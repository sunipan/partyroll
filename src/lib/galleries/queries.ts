import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { galleries, type Gallery } from "@/db/schema";

import {
  buildCollisionGallerySlug,
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
    const slug =
      attempt === 1 ? baseSlug : buildCollisionGallerySlug(baseSlug, `${attempt}`);
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
      slug: buildCollisionGallerySlug(baseSlug, randomUUID().slice(0, 8)),
      eventDate: input.eventDate,
    })
    .returning();

  return gallery;
}

export type GalleryUpdateResult =
  | { outcome: "updated"; gallery: Gallery }
  | { outcome: "not-found" }
  | { outcome: "invalid-transition" };

export const GALLERY_DELETION_RETRY_MESSAGE =
  "Deletion could not finish. Try again.";

export type GalleryDeletionResult =
  | { outcome: "deleted"; gallery: Gallery }
  | { outcome: "retryable-error"; gallery: Gallery; message: string }
  | { outcome: "name-mismatch" }
  | { outcome: "not-found" };

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

export async function deleteGalleryForOwner({
  ownerClerkId,
  galleryId,
  confirmationName,
  now = new Date(),
}: {
  ownerClerkId: string;
  galleryId: string;
  confirmationName: string;
  now?: Date;
}): Promise<GalleryDeletionResult> {
  const claimed = await markGalleryDeletingForOwner({
    ownerClerkId,
    galleryId,
    confirmationName,
    now,
  });

  if (claimed.outcome !== "deleting") {
    return claimed;
  }

  let objectDeletion: Awaited<ReturnType<typeof deleteGalleryStorageObjects>>;
  try {
    objectDeletion = await deleteGalleryStorageObjects(galleryId);
  } catch (error) {
    console.error("Failed to delete gallery storage objects", error);
    return retryableGalleryDeletion(claimed.gallery);
  }

  if (objectDeletion.status !== "complete") {
    return retryableGalleryDeletion(claimed.gallery);
  }

  try {
    const deleted = await db.transaction(async (tx) => {
      const [gallery] = await tx
        .delete(galleries)
        .where(
          and(
            eq(galleries.id, galleryId),
            eq(galleries.ownerClerkId, ownerClerkId),
            eq(galleries.status, "deleting"),
          ),
        )
        .returning();

      return gallery ?? null;
    });

    return deleted
      ? { outcome: "deleted", gallery: deleted }
      : { outcome: "not-found" };
  } catch (error) {
    console.error("Failed to delete gallery row", error);
    return retryableGalleryDeletion(claimed.gallery);
  }
}

async function markGalleryDeletingForOwner({
  ownerClerkId,
  galleryId,
  confirmationName,
  now,
}: {
  ownerClerkId: string;
  galleryId: string;
  confirmationName: string;
  now: Date;
}): Promise<
  | { outcome: "deleting"; gallery: Gallery }
  | { outcome: "name-mismatch" }
  | { outcome: "not-found" }
> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(galleries)
      .where(
        and(
          eq(galleries.id, galleryId),
          eq(galleries.ownerClerkId, ownerClerkId),
        ),
      )
      .limit(1)
      .for("update");

    if (!current) {
      return { outcome: "not-found" };
    }

    if (current.name !== confirmationName) {
      return { outcome: "name-mismatch" };
    }

    if (current.status === "deleting") {
      return { outcome: "deleting", gallery: current };
    }

    const [updated] = await tx
      .update(galleries)
      .set({
        status: "deleting",
        deletionRequestedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(galleries.id, galleryId),
          eq(galleries.ownerClerkId, ownerClerkId),
          eq(galleries.status, current.status),
        ),
      )
      .returning();

    return updated
      ? { outcome: "deleting", gallery: updated }
      : { outcome: "not-found" };
  });
}

async function deleteGalleryStorageObjects(galleryId: string) {
  const { deleteGalleryObjects } = await import(
    "@/lib/uploads/gallery-object-deletion"
  );
  return deleteGalleryObjects({ galleryId });
}

function retryableGalleryDeletion(gallery: Gallery): GalleryDeletionResult {
  return {
    outcome: "retryable-error",
    gallery,
    message: GALLERY_DELETION_RETRY_MESSAGE,
  };
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
