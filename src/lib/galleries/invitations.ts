import "server-only";

import { env } from "@/lib/env";

import {
  buildGalleryInvitationLink,
  deriveGalleryAccessCode,
} from "./invitation-core";

export function getGalleryInvitation(gallery: {
  id: string;
  slug: string;
  accessVersion: number;
}) {
  const accessCode = deriveGalleryAccessCode({
    galleryId: gallery.id,
    slug: gallery.slug,
    accessVersion: gallery.accessVersion,
    secret: env.INVITE_SECRET,
  });

  return {
    accessCode,
    invitationLink: buildGalleryInvitationLink({
      appUrl: env.APP_URL,
      accessCode,
    }),
  };
}
