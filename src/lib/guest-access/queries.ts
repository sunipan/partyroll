import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { galleries, type Gallery } from "@/db/schema";

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
        ne(galleries.status, "archived"),
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
        ne(galleries.status, "archived"),
      ),
    )
    .limit(1);

  return gallery ?? null;
}
