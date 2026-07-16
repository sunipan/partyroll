import { describe, expect, it } from "vitest";

import {
  createGuestSessionToken,
  GUEST_SESSION_MAX_AGE_SECONDS,
  verifyGuestSessionToken,
} from "./session-core";

const secret = "a-guest-session-secret-that-is-long-enough";
const now = new Date("2026-07-16T12:00:00Z");
const sessionId = "4adace8a-a157-4c85-af78-d42f14ef3598";
const galleryId = "f7ebd47e-1d1b-4acd-9745-53a1c83860ca";

describe("guest sessions", () => {
  it("signs and verifies a scoped, expiring session", () => {
    const token = createGuestSessionToken({
      galleryId,
      accessVersion: 3,
      secret,
      now,
      sessionId,
    });

    expect(verifyGuestSessionToken({ token, secret, now })).toMatchObject({
      version: 1,
      galleryId,
      accessVersion: 3,
      sessionId,
      issuedAt: Math.floor(now.getTime() / 1000),
      expiresAt:
        Math.floor(now.getTime() / 1000) + GUEST_SESSION_MAX_AGE_SECONDS,
    });
  });

  it("rejects forged and wrong-secret tokens", () => {
    const token = createGuestSessionToken({
      galleryId,
      accessVersion: 1,
      secret,
      now,
      sessionId,
    });

    expect(
      verifyGuestSessionToken({ token: `${token}x`, secret, now }),
    ).toBeNull();
    expect(
      verifyGuestSessionToken({
        token,
        secret: "another-guest-session-secret-long-enough",
        now,
      }),
    ).toBeNull();
  });

  it("rejects expired sessions", () => {
    const token = createGuestSessionToken({
      galleryId,
      accessVersion: 1,
      secret,
      now,
      sessionId,
    });
    const expiredAt = new Date(
      now.getTime() + (GUEST_SESSION_MAX_AGE_SECONDS + 1) * 1000,
    );

    expect(verifyGuestSessionToken({ token, secret, now: expiredAt })).toBeNull();
  });
});
