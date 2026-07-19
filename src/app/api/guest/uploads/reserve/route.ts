import { env } from "@/lib/env";
import { getAuthorizedGuestContext } from "@/lib/guest-access/session";
import {
  createQuarantineUploadUrl,
  prepareQuarantineUploadReservation,
} from "@/lib/uploads/objects";
import {
  getUploadReservationForGuest,
  reservePhotoUpload,
} from "@/lib/uploads/queries";
import { consumeUploadReservationAttempt } from "@/lib/uploads/rate-limit";
import {
  isSupportedUploadMimeType,
  reserveUploadInputSchema,
} from "@/lib/uploads/rules";
import { hashGuestSession } from "@/lib/uploads/security-core";
import {
  isSameOriginMutation,
  noStoreJson,
  readBoundedJson,
} from "@/lib/uploads/http";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 512;
const GENERIC_ERROR = { message: "Unable to reserve this media upload." };

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson(GENERIC_ERROR, { status: 403 });
  }

  const parsed = reserveUploadInputSchema.safeParse(
    await readBoundedJson(request, MAX_REQUEST_BYTES),
  );
  if (!parsed.success) {
    const sizeIssue = parsed.error.issues.find(
      (issue) =>
        issue.code === "custom" &&
        issue.path.length === 1 &&
        issue.path[0] === "byteSize",
    );
    return noStoreJson(
      sizeIssue ? { message: sizeIssue.message } : GENERIC_ERROR,
      { status: 400 },
    );
  }

  const context = await getAuthorizedGuestContext(parsed.data.slug);
  if (!context || context.gallery.status !== "open") {
    return noStoreJson(GENERIC_ERROR, { status: 403 });
  }

  const uploaderSessionHash = hashGuestSession(
    context.session.sessionId,
    env.GUEST_SESSION_SECRET,
  );
  const existing = await getUploadReservationForGuest({
    galleryId: context.gallery.id,
    uploaderSessionHash,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (existing) {
    if (
      !isSupportedUploadMimeType(existing.declaredMimeType) ||
      existing.declaredMimeType !== parsed.data.mimeType ||
      existing.declaredByteSize !== parsed.data.byteSize ||
      existing.originalFilename !== parsed.data.originalFilename
    ) {
      return noStoreJson(GENERIC_ERROR, { status: 409 });
    }
    if (existing.status === "ready") {
      return noStoreJson({ photoId: existing.id, status: "ready" });
    }
    if (
      existing.status !== "pending" ||
      existing.reservationExpiresAt <= new Date()
    ) {
      return noStoreJson(GENERIC_ERROR, { status: 409 });
    }

    try {
      const uploadUrl = await createQuarantineUploadUrl({
        objectKey: existing.quarantineObjectKey,
        mimeType: existing.declaredMimeType,
        byteSize: existing.declaredByteSize,
        expiresAt: existing.reservationExpiresAt,
      });
      return noStoreJson({
        photoId: existing.id,
        status: "pending",
        uploadUrl,
        expiresAt: existing.reservationExpiresAt.toISOString(),
      });
    } catch {
      return noStoreJson(GENERIC_ERROR, { status: 503 });
    }
  }

  const limit = await consumeUploadReservationAttempt({
    galleryId: context.gallery.id,
    sessionId: context.session.sessionId,
  });
  if (!limit.allowed) {
    return noStoreJson(
      { message: "Upload limit reached. Please wait and try again." },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  let prepared;
  try {
    prepared = await prepareQuarantineUploadReservation({
      galleryId: context.gallery.id,
      mimeType: parsed.data.mimeType,
      byteSize: parsed.data.byteSize,
    });
  } catch {
    return noStoreJson(GENERIC_ERROR, { status: 503 });
  }

  const result = await reservePhotoUpload({
    galleryId: context.gallery.id,
    accessVersion: context.gallery.accessVersion,
    uploaderSessionHash,
    input: parsed.data,
    photoId: prepared.photoId,
    reservationExpiresAt: prepared.expiresAt,
  });

  if (result.outcome === "quota-exceeded") {
    return noStoreJson(
      { message: "This gallery has reached its upload capacity." },
      { status: 409 },
    );
  }
  if (
    result.outcome === "unavailable" ||
    result.outcome === "idempotency-conflict"
  ) {
    return noStoreJson(GENERIC_ERROR, { status: 409 });
  }

  const { photo } = result;
  if (photo.status === "ready") {
    return noStoreJson({ photoId: photo.id, status: "ready" });
  }
  if (photo.status !== "pending" || photo.reservationExpiresAt <= new Date()) {
    return noStoreJson(GENERIC_ERROR, { status: 409 });
  }

  let uploadUrl = prepared.uploadUrl;
  if (result.outcome === "existing") {
    if (!isSupportedUploadMimeType(photo.declaredMimeType)) {
      return noStoreJson(GENERIC_ERROR, { status: 409 });
    }
    try {
      uploadUrl = await createQuarantineUploadUrl({
        objectKey: photo.quarantineObjectKey,
        mimeType: photo.declaredMimeType,
        byteSize: photo.declaredByteSize,
        expiresAt: photo.reservationExpiresAt,
      });
    } catch {
      return noStoreJson(GENERIC_ERROR, { status: 503 });
    }
  }

  return noStoreJson({
    photoId: photo.id,
    status: "pending",
    uploadUrl,
    expiresAt: photo.reservationExpiresAt.toISOString(),
  });
}
