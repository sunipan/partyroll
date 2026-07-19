import { timingSafeEqual } from "node:crypto";

export function isValidCronAuthorization(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!authorization || !secret) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authorization);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
