import "server-only";

import { cookies } from "next/headers";

import type { Gallery } from "@/db/schema";
import { env } from "@/lib/env";

import {
  getGalleryForGuestSession,
  getGalleryForIssuedUpload,
} from "./queries";
import {
  createGuestSessionToken,
  type GuestSessionPayload,
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

export type AuthorizedGuestContext = {
  gallery: Gallery;
  session: GuestSessionPayload;
};

export async function getAuthorizedGuestContextForIssuedUpload(
  slug: string,
): Promise<AuthorizedGuestContext | null> {
  const session = await getSignedGuestSession();
  if (!session) {
    return null;
  }

  const gallery = await getGalleryForIssuedUpload({
    galleryId: session.galleryId,
    slug,
  });

  return gallery ? { gallery, session } : null;
}

export async function getAuthorizedGuestContext(
  slug: string,
): Promise<AuthorizedGuestContext | null> {
  const session = await getSignedGuestSession();
  if (!session) {
    return null;
  }

  const gallery = await getGalleryForGuestSession({
    galleryId: session.galleryId,
    slug,
    accessVersion: session.accessVersion,
  });

  return gallery ? { gallery, session } : null;
}

async function getSignedGuestSession(): Promise<GuestSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return verifyGuestSessionToken({
    token,
    secret: env.GUEST_SESSION_SECRET,
  });
}

export async function getAuthorizedGuestGallery(
  slug: string,
): Promise<Gallery | null> {
  return (await getAuthorizedGuestContext(slug))?.gallery ?? null;
}
