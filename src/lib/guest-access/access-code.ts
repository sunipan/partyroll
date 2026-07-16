import { timingSafeEqual } from "node:crypto";

import { deriveGalleryAccessCode } from "@/lib/galleries/invitation-core";

const ACCESS_CODE_PATTERN =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)-([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})$/i;
const MAX_ACCESS_CODE_LENGTH = 80;

export type ParsedAccessCode = {
  code: string;
  slug: string;
};

export function parseGalleryAccessCode(input: string): ParsedAccessCode | null {
  const code = input.trim().replace(/\s+/g, "");

  if (code.length === 0 || code.length > MAX_ACCESS_CODE_LENGTH) {
    return null;
  }

  const match = ACCESS_CODE_PATTERN.exec(code);
  const slug = match?.[1]?.toLowerCase();
  const suffix = match?.[2]?.toUpperCase();

  if (!slug || !suffix || slug.length > 64) {
    return null;
  }

  return { code: `${slug}-${suffix}`, slug };
}

export function verifyGalleryAccessCode({
  candidate,
  gallery,
  secret,
}: {
  candidate: string;
  gallery: { id: string; slug: string; accessVersion: number };
  secret: string;
}): boolean {
  const parsed = parseGalleryAccessCode(candidate);
  if (!parsed || parsed.slug !== gallery.slug) {
    return false;
  }

  const expected = deriveGalleryAccessCode({
    galleryId: gallery.id,
    slug: gallery.slug,
    accessVersion: gallery.accessVersion,
    secret,
  });

  return constantTimeEqual(parsed.code, expected);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
