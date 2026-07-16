import { createHmac } from "node:crypto";

const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ACCESS_CODE_SUFFIX_LENGTH = 8;

export function deriveGalleryAccessCode({
  galleryId,
  slug,
  accessVersion,
  secret,
}: {
  galleryId: string;
  slug: string;
  accessVersion: number;
  secret: string;
}): string {
  const digest = createHmac("sha256", secret)
    .update("partyroll-invitation-v1\0")
    .update(galleryId)
    .update("\0")
    .update(slug)
    .update("\0")
    .update(String(accessVersion))
    .digest();

  return `${slug}-${encodeBase32(digest).slice(0, ACCESS_CODE_SUFFIX_LENGTH)}`;
}

export function buildGalleryInvitationLink({
  appUrl,
  accessCode,
}: {
  appUrl: string;
  accessCode: string;
}): string {
  const invitationUrl = new URL("/join", appUrl);
  invitationUrl.hash = accessCode;
  return invitationUrl.toString();
}

function encodeBase32(value: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bitsInBuffer = 0;

  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;

    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      output += ACCESS_CODE_ALPHABET[(buffer >> bitsInBuffer) & 31];
    }

    buffer &= (1 << bitsInBuffer) - 1;
  }

  if (bitsInBuffer > 0) {
    output += ACCESS_CODE_ALPHABET[(buffer << (5 - bitsInBuffer)) & 31];
  }

  return output;
}
