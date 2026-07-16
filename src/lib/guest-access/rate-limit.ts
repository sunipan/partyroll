import "server-only";

import { createHmac } from "node:crypto";

import { eq, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { rateLimitCounters } from "@/db/schema";
import { env } from "@/lib/env";

const GUEST_ACCESS_SCOPE = "guest-access";
const ATTEMPT_LIMIT = 10;
const WINDOW_MILLISECONDS = 15 * 60 * 1000;

export async function consumeGuestAccessAttempt(
  clientAddress: string,
  now = new Date(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const keyHash = hashClientAddress(clientAddress);
  const expiresAt = new Date(now.getTime() + WINDOW_MILLISECONDS);
  const nowIso = now.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  await db
    .delete(rateLimitCounters)
    .where(lte(rateLimitCounters.expiresAt, now));

  const [counter] = await db
    .insert(rateLimitCounters)
    .values({
      keyHash,
      scope: GUEST_ACCESS_SCOPE,
      attempts: 1,
      windowStartedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: rateLimitCounters.keyHash,
      set: {
        scope: GUEST_ACCESS_SCOPE,
        attempts: sql<number>`case when ${rateLimitCounters.expiresAt} <= ${nowIso}::timestamptz then 1 else ${rateLimitCounters.attempts} + 1 end`,
        windowStartedAt: sql<Date>`case when ${rateLimitCounters.expiresAt} <= ${nowIso}::timestamptz then ${nowIso}::timestamptz else ${rateLimitCounters.windowStartedAt} end`,
        expiresAt: sql<Date>`case when ${rateLimitCounters.expiresAt} <= ${nowIso}::timestamptz then ${expiresAtIso}::timestamptz else ${rateLimitCounters.expiresAt} end`,
      },
    })
    .returning({
      attempts: rateLimitCounters.attempts,
      expiresAt: rateLimitCounters.expiresAt,
    });

  return {
    allowed: counter.attempts <= ATTEMPT_LIMIT,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((counter.expiresAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

export async function clearGuestAccessAttempts(clientAddress: string) {
  await db
    .delete(rateLimitCounters)
    .where(eq(rateLimitCounters.keyHash, hashClientAddress(clientAddress)));
}

export function getClientAddress(request: Request): string {
  const forwardedAddress = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const address = forwardedAddress || request.headers.get("x-real-ip") || "unknown";

  return address.slice(0, 256);
}

function hashClientAddress(clientAddress: string): string {
  return createHmac("sha256", env.GUEST_SESSION_SECRET)
    .update("partyroll-rate-limit-v1\0")
    .update(GUEST_ACCESS_SCOPE)
    .update("\0")
    .update(clientAddress)
    .digest("hex");
}
