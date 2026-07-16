import "server-only";

import { cookies } from "next/headers";

import type { Gallery } from "@/db/schema";
import { env } from "@/lib/env";

import { getGalleryForGuestSession } from "./queries";
import {
  createGuestSessionToken,
  GUEST_SESSION_MAX_AGE_SECONDS,
  verifyGuestSessionToken,
} from "./session-core";

export const GUEST_SESSION_COOKIE = "partyroll_guest_session";

export function createGuestSession(gallery: {
  id: string;
  accessVersion: number;
}) {
  return createGuestSessionToken({
    galleryId: gallery.id,
    accessVersion: gallery.accessVersion,
    secret: env.GUEST_SESSION_SECRET,
  });
}

export function getGuestSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
  };
}

export async function getAuthorizedGuestGallery(
  slug: string,
): Promise<Gallery | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = verifyGuestSessionToken({
    token,
    secret: env.GUEST_SESSION_SECRET,
  });
  if (!session) {
    return null;
  }

  return getGalleryForGuestSession({
    galleryId: session.galleryId,
    slug,
    accessVersion: session.accessVersion,
  });
}
