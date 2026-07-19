import "server-only";

import { randomUUID } from "node:crypto";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { r2, r2Bucket } from "@/lib/r2";

import {
  MAX_SOURCE_BYTES,
  type SupportedUploadMimeType,
  UPLOAD_RESERVATION_SECONDS,
  UPLOAD_URL_SECONDS,
} from "./rules";

const R2_OPERATION_TIMEOUT_MILLISECONDS = 30_000;

async function withR2Timeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("R2 operation timed out.")),
    R2_OPERATION_TIMEOUT_MILLISECONDS,
  );

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export function getQuarantineObjectKey(galleryId: string, photoId: string) {
  return `quarantine/${galleryId}/${photoId}`;
}

export function getOriginalObjectKey(galleryId: string, photoId: string) {
  return `originals/${galleryId}/${photoId}`;
}

export function getDisplayObjectKey(galleryId: string, photoId: string) {
  return `photos/${galleryId}/${photoId}/display.jpg`;
}

export function getThumbnailObjectKey(galleryId: string, photoId: string) {
  return `photos/${galleryId}/${photoId}/thumbnail.jpg`;
}

export async function prepareQuarantineUploadReservation({
  galleryId,
  mimeType,
  byteSize,
  now = new Date(),
}: {
  galleryId: string;
  mimeType: string;
  byteSize: number;
  now?: Date;
}) {
  const photoId = randomUUID();
  const expiresAt = new Date(
    now.getTime() + UPLOAD_RESERVATION_SECONDS * 1000,
  );
  const objectKey = getQuarantineObjectKey(galleryId, photoId);
  const uploadUrl = await createQuarantineUploadUrl({
    objectKey,
    mimeType,
    byteSize,
    expiresAt,
  });

  return { photoId, expiresAt, uploadUrl };
}

export async function createQuarantineUploadUrl({
  objectKey,
  mimeType,
  byteSize,
  expiresAt,
}: {
  objectKey: string;
  mimeType: string;
  byteSize: number;
  expiresAt: Date;
}) {
  const remainingSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    throw new Error("The upload reservation has expired.");
  }

  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: objectKey,
      ContentType: mimeType,
      ContentLength: byteSize,
    }),
    { expiresIn: Math.min(UPLOAD_URL_SECONDS, remainingSeconds) },
  );
}

type UploadObjectDescriptor = {
  galleryId: string;
  id: string;
  quarantineObjectKey?: string | null;
  mediaKind?: "image" | "video" | null;
  originalObjectKey?: string | null;
  displayObjectKey?: string | null;
  thumbnailObjectKey?: string | null;
};

export function getFinalUploadObjectKeys(input: UploadObjectDescriptor) {
  const originalObjectKey = requireObjectKey(
    input.originalObjectKey,
    "original object key",
  );

  if (input.mediaKind === "image") {
    return [
      originalObjectKey,
      requireObjectKey(input.displayObjectKey, "display object key"),
      requireObjectKey(input.thumbnailObjectKey, "thumbnail object key"),
    ];
  }

  if (input.mediaKind === "video") {
    if (input.displayObjectKey !== null && input.displayObjectKey !== undefined) {
      throw new InvalidUploadError("Video uploads must not have display objects.");
    }
    if (input.thumbnailObjectKey !== null && input.thumbnailObjectKey !== undefined) {
      throw new InvalidUploadError("Video uploads must not have thumbnail objects.");
    }
    return [originalObjectKey];
  }

  throw new InvalidUploadError("The upload record is missing media kind.");
}

export function getReadyMediaObjectKeys(input: UploadObjectDescriptor) {
  return [
    requireObjectKey(input.quarantineObjectKey, "quarantine object key"),
    ...getFinalUploadObjectKeys(input),
  ];
}

export function getMediaDeletionObjectKeys(input: UploadObjectDescriptor) {
  const objectKeys = [
    requireObjectKey(input.quarantineObjectKey, "quarantine object key"),
    requireObjectKey(input.originalObjectKey, "original object key"),
    getQuarantineObjectKey(input.galleryId, input.id),
    getOriginalObjectKey(input.galleryId, input.id),
  ];

  if (input.mediaKind === "image") {
    objectKeys.push(
      requireObjectKey(input.displayObjectKey, "display object key"),
      requireObjectKey(input.thumbnailObjectKey, "thumbnail object key"),
      getDisplayObjectKey(input.galleryId, input.id),
      getThumbnailObjectKey(input.galleryId, input.id),
    );
  } else if (input.mediaKind === "video") {
    if (input.displayObjectKey !== null && input.displayObjectKey !== undefined) {
      throw new InvalidUploadError("Video uploads must not have display objects.");
    }
    if (input.thumbnailObjectKey !== null && input.thumbnailObjectKey !== undefined) {
      throw new InvalidUploadError("Video uploads must not have thumbnail objects.");
    }
  } else {
    throw new InvalidUploadError("The upload record is missing media kind.");
  }

  return [...new Set(objectKeys)];
}

function requireObjectKey(value: string | null | undefined, label: string) {
  if (!value || value.trim().length === 0) {
    throw new InvalidUploadError(`The upload record is missing ${label}.`);
  }

  return value;
}

export async function readQuarantineObject(
  objectKey: string,
  expectedByteSize: number,
  expectedMimeType?: SupportedUploadMimeType,
): Promise<Buffer> {
  const head = await withR2Timeout((abortSignal) =>
    r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: objectKey }), {
      abortSignal,
    }),
  );
  if (
    !head.ContentLength ||
    head.ContentLength <= 0 ||
    head.ContentLength > MAX_SOURCE_BYTES ||
    head.ContentLength !== expectedByteSize
  ) {
    throw new InvalidUploadError("The uploaded object has an invalid size.");
  }
  if (expectedMimeType && head.ContentType !== expectedMimeType) {
    throw new InvalidUploadError("The uploaded object has an invalid content type.");
  }

  return withR2Timeout(async (abortSignal) => {
    const result = await r2.send(
      new GetObjectCommand({ Bucket: r2Bucket, Key: objectKey }),
      { abortSignal },
    );
    if (!result.Body) {
      throw new InvalidUploadError("The uploaded object is empty.");
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_SOURCE_BYTES) {
        throw new InvalidUploadError("The uploaded object is too large.");
      }
      chunks.push(Buffer.from(chunk));
    }

    if (
      totalBytes <= 0 ||
      totalBytes !== head.ContentLength ||
      totalBytes !== expectedByteSize
    ) {
      throw new InvalidUploadError("The uploaded object is incomplete.");
    }

    return Buffer.concat(chunks, totalBytes);
  });
}

export async function readQuarantineObjectPrefix(
  objectKey: string,
  expectedByteSize: number,
  expectedMimeType: SupportedUploadMimeType,
  maxBytes: number,
): Promise<Buffer> {
  const head = await withR2Timeout((abortSignal) =>
    r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: objectKey }), {
      abortSignal,
    }),
  );
  if (
    !head.ContentLength ||
    head.ContentLength <= 0 ||
    head.ContentLength > MAX_SOURCE_BYTES ||
    head.ContentLength !== expectedByteSize
  ) {
    throw new InvalidUploadError("The uploaded object has an invalid size.");
  }
  if (head.ContentType !== expectedMimeType) {
    throw new InvalidUploadError("The uploaded object has an invalid content type.");
  }

  const endByte = Math.max(0, Math.min(maxBytes, expectedByteSize) - 1);
  return withR2Timeout(async (abortSignal) => {
    const result = await r2.send(
      new GetObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey,
        Range: `bytes=0-${endByte}`,
      }),
      { abortSignal },
    );
    if (!result.Body) {
      throw new InvalidUploadError("The uploaded object is empty.");
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        throw new InvalidUploadError("The uploaded object prefix is too large.");
      }
      chunks.push(Buffer.from(chunk));
    }

    if (totalBytes <= 0) {
      throw new InvalidUploadError("The uploaded object is empty.");
    }

    return Buffer.concat(chunks, totalBytes);
  });
}

export async function copyQuarantineObjectToOriginal(input: {
  quarantineObjectKey: string;
  originalObjectKey: string;
  mimeType: SupportedUploadMimeType;
  byteSize: number;
}) {
  const { quarantineObjectKey, originalObjectKey, mimeType } = input;
  await withR2Timeout((abortSignal) =>
    r2.send(
      new CopyObjectCommand({
        Bucket: r2Bucket,
        CopySource: `${r2Bucket}/${encodeR2CopySourceKey(quarantineObjectKey)}`,
        Key: originalObjectKey,
        ContentType: mimeType,
        MetadataDirective: "REPLACE",
        CacheControl: "private, max-age=0, no-store",
      }),
      { abortSignal },
    ),
  );
}

export async function assertOriginalObject({
  objectKey,
  expectedByteSize,
  expectedMimeType,
}: {
  objectKey: string;
  expectedByteSize: number;
  expectedMimeType: SupportedUploadMimeType;
}) {
  const head = await withR2Timeout((abortSignal) =>
    r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: objectKey }), {
      abortSignal,
    }),
  );
  if (
    !head.ContentLength ||
    head.ContentLength <= 0 ||
    head.ContentLength > MAX_SOURCE_BYTES ||
    head.ContentLength !== expectedByteSize
  ) {
    throw new InvalidUploadError("The original object has an invalid size.");
  }
  if (head.ContentType !== expectedMimeType) {
    throw new InvalidUploadError("The original object has an invalid content type.");
  }
}

function encodeR2CopySourceKey(objectKey: string) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

export async function putProcessedObject({
  objectKey,
  body,
}: {
  objectKey: string;
  body: Buffer;
}) {
  await withR2Timeout((abortSignal) =>
    r2.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey,
        Body: body,
        ContentLength: body.byteLength,
        ContentType: "image/jpeg",
        CacheControl: "private, max-age=0, no-store",
      }),
      { abortSignal },
    ),
  );
}

export async function deleteUploadObjects(objectKeys: string[]) {
  for (const objectKey of objectKeys) {
    if (objectKey.trim().length === 0) {
      throw new Error("Cannot delete an object with a blank key.");
    }
  }

  const uniqueKeys = [...new Set(objectKeys)];
  if (uniqueKeys.length === 0) {
    return;
  }

  const result = await withR2Timeout((abortSignal) =>
    r2.send(
      new DeleteObjectsCommand({
        Bucket: r2Bucket,
        Delete: {
          Objects: uniqueKeys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
      { abortSignal },
    ),
  );

  if (result.Errors?.length) {
    throw new Error("One or more R2 objects could not be deleted.");
  }
}

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUploadError";
  }
}
