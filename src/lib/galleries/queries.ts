import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { galleries, type Gallery } from "@/db/schema";

import {
  canTransitionGallery,
  slugifyGalleryName,
  type CreateGalleryInput,
  type GalleryStatus,
} from "./rules";

export async function listGalleriesForOwner(
  ownerClerkId: string,
): Promise<Gallery[]> {
  return db
    .select()
    .from(galleries)
    .where(eq(galleries.ownerClerkId, ownerClerkId))
    .orderBy(desc(galleries.createdAt));
}

export async function getGalleryForOwner(
  ownerClerkId: string,
  galleryId: string,
): Promise<Gallery | null> {
  const [gallery] = await db
    .select()
    .from(galleries)
    .where(
      and(
        eq(galleries.id, galleryId),
        eq(galleries.ownerClerkId, ownerClerkId),
      ),
    )
    .limit(1);

  return gallery ?? null;
}

export async function createGalleryForOwner(
  ownerClerkId: string,
  input: CreateGalleryInput,
): Promise<Gallery> {
  const baseSlug = slugifyGalleryName(input.name);

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const [gallery] = await db
      .insert(galleries)
      .values({
        ownerClerkId,
        name: input.name,
        slug,
        eventDate: input.eventDate,
      })
      .onConflictDoNothing({ target: galleries.slug })
      .returning();

    if (gallery) {
      return gallery;
    }
  }

  const [gallery] = await db
    .insert(galleries)
    .values({
      ownerClerkId,
      name: input.name,
      slug: `${baseSlug}-${randomUUID().slice(0, 8)}`,
      eventDate: input.eventDate,
    })
    .returning();

  return gallery;
}

export type GalleryUpdateResult =
  | { outcome: "updated"; gallery: Gallery }
  | { outcome: "not-found" }
  | { outcome: "invalid-transition" };

export async function updateGalleryStatusForOwner({
  ownerClerkId,
  galleryId,
  nextStatus,
}: {
  ownerClerkId: string;
  galleryId: string;
  nextStatus: GalleryStatus;
}): Promise<GalleryUpdateResult> {
  const currentGallery = await getGalleryForOwner(ownerClerkId, galleryId);

  if (!currentGallery) {
    return { outcome: "not-found" };
  }

  if (!canTransitionGallery(currentGallery.status, nextStatus)) {
    return { outcome: "invalid-transition" };
  }

  const [gallery] = await db
    .update(galleries)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(
      and(
        eq(galleries.id, galleryId),
        eq(galleries.ownerClerkId, ownerClerkId),
        eq(galleries.status, currentGallery.status),
      ),
    )
    .returning();

  return gallery
    ? { outcome: "updated", gallery }
    : { outcome: "invalid-transition" };
}

export async function regenerateGalleryAccessForOwner(
  ownerClerkId: string,
  galleryId: string,
): Promise<Gallery | null> {
  const [gallery] = await db
    .update(galleries)
    .set({
      accessVersion: sql`${galleries.accessVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(galleries.id, galleryId),
        eq(galleries.ownerClerkId, ownerClerkId),
      ),
    )
    .returning();

  return gallery ?? null;
}
