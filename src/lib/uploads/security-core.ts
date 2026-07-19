import { createHmac } from "node:crypto";

export const UPLOAD_SESSION_RESERVATION_LIMIT = 200;
export const UPLOAD_GALLERY_RESERVATION_LIMIT = 5_000;
export const UPLOAD_RESERVATION_WINDOW_MILLISECONDS = 60 * 60 * 1000;
export const UPLOAD_SESSION_RESERVATION_SCOPE = "upload-reservation-session";
export const UPLOAD_GALLERY_RESERVATION_SCOPE = "upload-reservation-gallery";
export const MAX_COMPLETION_ATTEMPTS = 10;
export const COMPLETION_RETRY_DELAY_MILLISECONDS = 3_000;
export const MAX_MEDIA_DELETION_ATTEMPTS = 10;
export const MEDIA_DELETION_RETRY_DELAY_MILLISECONDS = 30_000;
export const UPLOAD_WORK_LEASE_MILLISECONDS = 2 * 60 * 1000;
export const UPLOAD_CLEANUP_GRACE_MILLISECONDS = 10 * 60 * 1000;

export function hashGuestSession(sessionId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update("partyroll-upload-session-v1\0")
    .update(sessionId)
    .digest("hex");
}

export function getUploadRateLimitKeyHash({
  key,
  scope,
  secret,
}: {
  key: string;
  scope: string;
  secret: string;
}): string {
  return createHmac("sha256", secret)
    .update("partyroll-upload-rate-limit-v2\0")
    .update(scope)
    .update("\0")
    .update(key)
    .digest("hex");
}
