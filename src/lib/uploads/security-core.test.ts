import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  getUploadRateLimitKeyHash,
  hashGuestSession,
  UPLOAD_GALLERY_RESERVATION_LIMIT,
  UPLOAD_GALLERY_RESERVATION_SCOPE,
  UPLOAD_RESERVATION_WINDOW_MILLISECONDS,
  UPLOAD_SESSION_RESERVATION_LIMIT,
  UPLOAD_SESSION_RESERVATION_SCOPE,
} from "./security-core";

describe("upload security primitives", () => {
  it("creates stable, domain-separated session and rate-limit digests", () => {
    const sessionId = randomUUID();
    const secret = "a-secure-test-secret-that-is-at-least-32-characters";

    const sessionHash = hashGuestSession(sessionId, secret);
    const rateHash = getUploadRateLimitKeyHash({
      key: sessionId,
      scope: UPLOAD_SESSION_RESERVATION_SCOPE,
      secret,
    });

    expect(sessionHash).toHaveLength(64);
    expect(rateHash).toHaveLength(64);
    expect(rateHash).not.toBe(sessionHash);
    expect(
      getUploadRateLimitKeyHash({
        key: randomUUID(),
        scope: UPLOAD_SESSION_RESERVATION_SCOPE,
        secret,
      }),
    ).not.toBe(rateHash);
    expect(
      getUploadRateLimitKeyHash({
        key: sessionId,
        scope: UPLOAD_GALLERY_RESERVATION_SCOPE,
        secret,
      }),
    ).not.toBe(rateHash);
  });

  it("keeps upload session and gallery limits intentionally generous", () => {
    expect(UPLOAD_SESSION_RESERVATION_LIMIT).toBe(200);
    expect(UPLOAD_GALLERY_RESERVATION_LIMIT).toBe(5_000);
    expect(UPLOAD_RESERVATION_WINDOW_MILLISECONDS).toBe(60 * 60 * 1000);
  });
});
