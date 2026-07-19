import "server-only";

import { lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { rateLimitCounters } from "@/db/schema";
import { env } from "@/lib/env";

import {
  getUploadRateLimitKeyHash,
  UPLOAD_GALLERY_RESERVATION_LIMIT,
  UPLOAD_GALLERY_RESERVATION_SCOPE,
  UPLOAD_RESERVATION_WINDOW_MILLISECONDS,
  UPLOAD_SESSION_RESERVATION_LIMIT,
  UPLOAD_SESSION_RESERVATION_SCOPE,
} from "./security-core";

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

type UploadReservationLimits = {
  session: number;
  gallery: number;
};

const DEFAULT_UPLOAD_RESERVATION_LIMITS: UploadReservationLimits = {
  session: UPLOAD_SESSION_RESERVATION_LIMIT,
  gallery: UPLOAD_GALLERY_RESERVATION_LIMIT,
};

export async function consumeUploadReservationAttempt({
  galleryId,
  sessionId,
  now = new Date(),
  limits = DEFAULT_UPLOAD_RESERVATION_LIMITS,
}: {
  galleryId: string;
  sessionId: string;
  now?: Date;
  limits?: UploadReservationLimits;
}): Promise<RateLimitResult> {
  await db
    .delete(rateLimitCounters)
    .where(lte(rateLimitCounters.expiresAt, now));

  return db.transaction(async (tx) => {
    const sessionResult = await consumeCounter({
      tx,
      key: sessionId,
      scope: UPLOAD_SESSION_RESERVATION_SCOPE,
      limit: limits.session,
      now,
    });

    if (!sessionResult.allowed) {
      return sessionResult;
    }

    return consumeCounter({
      tx,
      key: galleryId,
      scope: UPLOAD_GALLERY_RESERVATION_SCOPE,
      limit: limits.gallery,
      now,
    });
  });
}

async function consumeCounter({
  tx,
  key,
  scope,
  limit,
  now,
}: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  key: string;
  scope: string;
  limit: number;
  now: Date;
}): Promise<RateLimitResult> {
  const keyHash = getUploadRateLimitKeyHash({
    key,
    scope,
    secret: env.GUEST_SESSION_SECRET,
  });
  const expiresAt = new Date(
    now.getTime() + UPLOAD_RESERVATION_WINDOW_MILLISECONDS,
  );
  const nowIso = now.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  const [counter] = await tx
    .insert(rateLimitCounters)
    .values({
      keyHash,
      scope,
      attempts: 1,
      windowStartedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: rateLimitCounters.keyHash,
      set: {
        scope,
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
    allowed: counter.attempts <= limit,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((counter.expiresAt.getTime() - now.getTime()) / 1000),
    ),
  };
}
