import "server-only";

import { env } from "@/lib/env";

import { parseGalleryAccessCode, verifyGalleryAccessCode } from "./access-code";
import { getGalleryBySlugForAccess } from "./queries";

const DUMMY_GALLERY_ID = "00000000-0000-4000-8000-000000000000";

export async function exchangeGalleryAccessCode(input: string) {
  const parsed = parseGalleryAccessCode(input);
  if (!parsed) {
    return null;
  }

  const gallery = await getGalleryBySlugForAccess(parsed.slug);
  const comparisonGallery = gallery ?? {
    id: DUMMY_GALLERY_ID,
    slug: parsed.slug,
    accessVersion: 1,
  };
  const valid = verifyGalleryAccessCode({
    candidate: parsed.code,
    gallery: comparisonGallery,
    secret: env.INVITE_SECRET,
  });

  if (!gallery || !valid || gallery.status === "archived") {
    return null;
  }

  return gallery;
}
