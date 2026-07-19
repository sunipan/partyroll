import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));

let db: (typeof import("@/db"))["db"];
let rateLimitCounters: (typeof import("@/db/schema"))["rateLimitCounters"];
let consumeUploadReservationAttempt: (typeof import("./rate-limit"))["consumeUploadReservationAttempt"];
let sessionScope = "";
let galleryScope = "";
let keyHashes: string[] = [];

const sessionId = randomUUID();
const renewedSessionId = randomUUID();
const galleryId = randomUUID();
const now = new Date();

async function consume(currentSessionId: string) {
  return consumeUploadReservationAttempt({
    galleryId,
    sessionId: currentSessionId,
    now,
    limits: { session: 2, gallery: 3 },
  });
}

describe("upload reservation rate limiting", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ rateLimitCounters } = await import("@/db/schema"));
    ({ consumeUploadReservationAttempt } = await import("./rate-limit"));
    const security = await import("./security-core");
    sessionScope = security.UPLOAD_SESSION_RESERVATION_SCOPE;
    galleryScope = security.UPLOAD_GALLERY_RESERVATION_SCOPE;

    const secret = process.env.GUEST_SESSION_SECRET;
    if (!secret) {
      throw new Error("GUEST_SESSION_SECRET is required for this test.");
    }

    keyHashes = [
      security.getUploadRateLimitKeyHash({
        key: sessionId,
        scope: sessionScope,
        secret,
      }),
      security.getUploadRateLimitKeyHash({
        key: renewedSessionId,
        scope: sessionScope,
        secret,
      }),
      security.getUploadRateLimitKeyHash({
        key: galleryId,
        scope: galleryScope,
        secret,
      }),
    ];
  });

  afterAll(async () => {
    if (db && rateLimitCounters && keyHashes.length > 0) {
      await db
        .delete(rateLimitCounters)
        .where(inArray(rateLimitCounters.keyHash, keyHashes));
    }
  });

  it(
    "enforces a session ceiling and a gallery ceiling that survives session renewal",
    async () => {
      await expect(consume(sessionId)).resolves.toMatchObject({ allowed: true });
      await expect(consume(sessionId)).resolves.toMatchObject({ allowed: true });
      await expect(consume(sessionId)).resolves.toMatchObject({ allowed: false });

      const [galleryAfterSessionLimit] = await db
        .select({ attempts: rateLimitCounters.attempts })
        .from(rateLimitCounters)
        .where(inArray(rateLimitCounters.keyHash, [keyHashes[2]]));

      expect(galleryAfterSessionLimit?.attempts).toBe(2);

      await expect(consume(renewedSessionId)).resolves.toMatchObject({
        allowed: true,
      });
      await expect(consume(renewedSessionId)).resolves.toMatchObject({
        allowed: false,
      });

      const counters = await db
        .select({
          scope: rateLimitCounters.scope,
          attempts: rateLimitCounters.attempts,
        })
        .from(rateLimitCounters)
        .where(inArray(rateLimitCounters.keyHash, keyHashes));

      expect(counters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: sessionScope, attempts: 3 }),
          expect.objectContaining({ scope: sessionScope, attempts: 2 }),
          expect.objectContaining({ scope: galleryScope, attempts: 4 }),
        ]),
      );
    },
    15_000,
  );
});
