import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { galleries, type Gallery } from "@/db/schema";
import { GUEST_ACCESSIBLE_GALLERY_STATUSES } from "@/lib/galleries/rules";

export async function getGalleryBySlugForAccess(
  slug: string,
): Promise<Gallery | null> {
  const [gallery] = await db
    .select()
    .from(galleries)
    .where(eq(galleries.slug, slug))
    .limit(1);

  return gallery ?? null;
}

export async function getGalleryForIssuedUpload({
  galleryId,
  slug,
}: {
  galleryId: string;
  slug: string;
}): Promise<Gallery | null> {
  const [gallery] = await db
    .select()
    .from(galleries)
    .where(
      and(
        eq(galleries.id, galleryId),
        eq(galleries.slug, slug),
        inArray(galleries.status, [...GUEST_ACCESSIBLE_GALLERY_STATUSES]),
      ),
    )
    .limit(1);

  return gallery ?? null;
}

export async function getGalleryForGuestSession({
  galleryId,
  slug,
  accessVersion,
}: {
  galleryId: string;
  slug: string;
  accessVersion: number;
}): Promise<Gallery | null> {
  const [gallery] = await db
    .select()
    .from(galleries)
    .where(
      and(
        eq(galleries.id, galleryId),
        eq(galleries.slug, slug),
        eq(galleries.accessVersion, accessVersion),
        inArray(galleries.status, [...GUEST_ACCESSIBLE_GALLERY_STATUSES]),
      ),
    )
    .limit(1);

  return gallery ?? null;
}
