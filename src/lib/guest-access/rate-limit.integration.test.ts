import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));

const clientAddress = `partyroll-rate-test-${randomUUID()}`;
let rateLimit: typeof import("./rate-limit");

describe("guest access rate limiting", () => {
  beforeAll(async () => {
    rateLimit = await import("./rate-limit");
  });

  afterAll(async () => {
    if (rateLimit) {
      await rateLimit.clearGuestAccessAttempts(clientAddress);
    }
  });

  it(
    "allows ten attempts, blocks the next, and resets after the window",
    async () => {
      const now = new Date();

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await expect(
          rateLimit.consumeGuestAccessAttempt(clientAddress, now),
        ).resolves.toMatchObject({ allowed: true });
      }

      await expect(
        rateLimit.consumeGuestAccessAttempt(clientAddress, now),
      ).resolves.toMatchObject({ allowed: false });

      const nextWindow = new Date(now.getTime() + 16 * 60 * 1000);
      await expect(
        rateLimit.consumeGuestAccessAttempt(clientAddress, nextWindow),
      ).resolves.toMatchObject({ allowed: true });
    },
    15_000,
  );
});
