import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const guestSessionPayloadSchema = z.object({
  version: z.literal(1),
  galleryId: z.uuid(),
  accessVersion: z.number().int().positive(),
  sessionId: z.uuid(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export type GuestSessionPayload = z.infer<typeof guestSessionPayloadSchema>;

export function createGuestSessionToken({
  galleryId,
  accessVersion,
  secret,
  now = new Date(),
  sessionId = randomUUID(),
}: {
  galleryId: string;
  accessVersion: number;
  secret: string;
  now?: Date;
  sessionId?: string;
}): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: GuestSessionPayload = {
    version: 1,
    galleryId,
    accessVersion,
    sessionId,
    issuedAt,
    expiresAt: issuedAt + GUEST_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyGuestSessionToken({
  token,
  secret,
  now = new Date(),
}: {
  token: string;
  secret: string;
  now?: Date;
}): GuestSessionPayload | null {
  if (token.length > 1024) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = sign(encodedPayload, secret);

  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const parsed = guestSessionPayloadSchema.safeParse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    );

    if (!parsed.success) {
      return null;
    }

    const currentTime = Math.floor(now.getTime() / 1000);
    if (
      parsed.data.expiresAt <= currentTime ||
      parsed.data.issuedAt > currentTime + 60
    ) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret)
    .update("partyroll-guest-session-v1\0")
    .update(value)
    .digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
