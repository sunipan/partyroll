import "server-only";

import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { r2, r2Bucket } from "@/lib/r2";

const R2_TIMEOUT_MS = 30_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const GALLERY_OBJECT_LIST_PAGE_SIZE = 1_000;
export const GALLERY_OBJECT_DELETE_BATCH_SIZE = 1_000;

export type GalleryObjectPrefixName = "quarantine" | "originals" | "photos";
export type GalleryObjectDeletionFailure = {
  phase: "list" | "delete";
  prefix: GalleryObjectPrefixName;
  errorName: string;
};
export type GalleryObjectDeletionResult =
  | { status: "complete" }
  | {
      status: "retryable-error";
      message: "Gallery files could not be deleted. Please try again.";
      failure: GalleryObjectDeletionFailure;
    };

type PrefixDescriptor = { name: GalleryObjectPrefixName; value: string };
type ObjectError = { Code?: string };

export function getGalleryObjectPrefixes(galleryId: string): PrefixDescriptor[] {
  if (!UUID_RE.test(galleryId)) {
    throw new Error("Gallery object deletion requires a canonical gallery UUID.");
  }

  return [
    { name: "quarantine", value: `quarantine/${galleryId}/` },
    { name: "originals", value: `originals/${galleryId}/` },
    { name: "photos", value: `photos/${galleryId}/` },
  ];
}

export async function deleteGalleryObjects({
  galleryId,
}: {
  galleryId: string;
}): Promise<GalleryObjectDeletionResult> {
  for (const prefix of getGalleryObjectPrefixes(galleryId)) {
    let continuationToken: string | undefined;

    do {
      let page: Awaited<ReturnType<typeof listObjectPage>>;
      try {
        page = await listObjectPage(prefix, continuationToken);
      } catch (error) {
        return retryableFailure("list", prefix, error);
      }

      const keys = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => key?.startsWith(prefix.value) === true);

      for (let start = 0; start < keys.length; start += GALLERY_OBJECT_DELETE_BATCH_SIZE) {
        const batch = keys.slice(start, start + GALLERY_OBJECT_DELETE_BATCH_SIZE);
        let deleteOutput: Awaited<ReturnType<typeof deleteObjectBatch>>;
        try {
          deleteOutput = await deleteObjectBatch(batch);
        } catch (error) {
          return retryableFailure("delete", prefix, error);
        }

        if ((deleteOutput.Errors ?? []).some(isRetriableObjectError)) {
          return retryableFailure("delete", prefix, "R2ObjectError");
        }
      }

      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  return { status: "complete" };
}

function listObjectPage(prefix: PrefixDescriptor, continuationToken?: string) {
  return withR2Timeout((abortSignal) =>
    r2.send(
      new ListObjectsV2Command({
        Bucket: r2Bucket,
        Prefix: prefix.value,
        MaxKeys: GALLERY_OBJECT_LIST_PAGE_SIZE,
        ContinuationToken: continuationToken,
      }),
      { abortSignal },
    ),
  );
}

function deleteObjectBatch(keys: string[]) {
  return withR2Timeout((abortSignal) =>
    r2.send(
      new DeleteObjectsCommand({
        Bucket: r2Bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
      { abortSignal },
    ),
  );
}

async function withR2Timeout<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("R2 operation timed out.")),
    R2_TIMEOUT_MS,
  );
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function isRetriableObjectError(error: ObjectError) {
  return error.Code !== "NoSuchKey" && error.Code !== "NotFound";
}

function errorName(error: unknown) {
  if (typeof error === "string") return error;
  return error instanceof Error ? error.name : "R2Error";
}

function retryableFailure(
  phase: GalleryObjectDeletionFailure["phase"],
  prefix: PrefixDescriptor,
  error: unknown,
): GalleryObjectDeletionResult {
  return {
    status: "retryable-error",
    message: "Gallery files could not be deleted. Please try again.",
    failure: { phase, prefix: prefix.name, errorName: errorName(error) },
  };
}
