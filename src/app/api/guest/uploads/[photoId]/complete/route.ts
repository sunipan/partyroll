import { z } from "zod";

import { env } from "@/lib/env";
import { getAuthorizedGuestContextForIssuedUpload } from "@/lib/guest-access/session";
import { completePhotoUpload } from "@/lib/uploads/completion";
import {
  isSameOriginMutation,
  noStoreJson,
  readBoundedJson,
} from "@/lib/uploads/http";
import { completeUploadInputSchema } from "@/lib/uploads/rules";
import { hashGuestSession } from "@/lib/uploads/security-core";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 256;
const GENERIC_ERROR = { message: "Unable to complete this media upload." };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson(GENERIC_ERROR, { status: 403 });
  }

  const [{ photoId }, parsed] = await Promise.all([
    params,
    Promise.resolve(
      completeUploadInputSchema.safeParse(
        await readBoundedJson(request, MAX_REQUEST_BYTES),
      ),
    ),
  ]);
  if (!z.uuid().safeParse(photoId).success || !parsed.success) {
    return noStoreJson(GENERIC_ERROR, { status: 400 });
  }

  const context = await getAuthorizedGuestContextForIssuedUpload(
    parsed.data.slug,
  );
  if (!context) {
    return noStoreJson(GENERIC_ERROR, { status: 403 });
  }

  const result = await completePhotoUpload({
    photoId,
    galleryId: context.gallery.id,
    uploaderSessionHash: hashGuestSession(
      context.session.sessionId,
      env.GUEST_SESSION_SECRET,
    ),
  });

  switch (result.outcome) {
    case "ready":
      return noStoreJson({ photoId: result.photo.id, status: "ready" });
    case "processing":
      return noStoreJson(
        { photoId, status: "processing" },
        { status: 202, headers: { "retry-after": "2" } },
      );
    case "invalid":
      return noStoreJson(
        { message: "This file is not a supported image or video." },
        { status: 422 },
      );
    case "quota-exceeded":
      return noStoreJson(
        { message: "This gallery has reached its upload capacity." },
        { status: 409 },
      );
    case "retryable":
      return noStoreJson(
        { message: "Processing failed temporarily. Please retry." },
        { status: 503, headers: { "retry-after": "3" } },
      );
    case "expired":
    case "not-found":
      return noStoreJson(GENERIC_ERROR, { status: 409 });
  }
}
