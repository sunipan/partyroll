import { z } from "zod";

export const galleryStatusSchema = z.enum([
  "open",
  "closed",
  "archived",
  "deleting",
]);
export type GalleryStatus = z.infer<typeof galleryStatusSchema>;
export type GuestAccessibleGalleryStatus = Extract<GalleryStatus, "open" | "closed">;

export const GUEST_ACCESSIBLE_GALLERY_STATUSES = ["open", "closed"] as const;

const galleryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a gallery name.")
  .max(100, "Gallery names must be 100 characters or fewer.");

const eventDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine((value) => value === undefined || isCalendarDate(value), {
    message: "Enter a valid event date.",
  });

export const createGalleryInputSchema = z.object({
  name: galleryNameSchema,
  eventDate: eventDateSchema,
});

export type CreateGalleryInput = z.infer<typeof createGalleryInputSchema>;

export const galleryIdSchema = z.uuid();
export const MAX_GALLERY_SLUG_LENGTH = 64;

const allowedTransitions: Record<GalleryStatus, readonly GalleryStatus[]> = {
  open: ["closed", "archived"],
  closed: ["open", "archived"],
  archived: ["closed"],
  deleting: [],
};

export function getAllowedGalleryTransitions(
  status: GalleryStatus,
): readonly GalleryStatus[] {
  return allowedTransitions[status];
}

export function canTransitionGallery(
  currentStatus: GalleryStatus,
  nextStatus: GalleryStatus,
): boolean {
  return allowedTransitions[currentStatus].includes(nextStatus);
}

export function isGalleryGuestAccessible(
  status: GalleryStatus,
): status is GuestAccessibleGalleryStatus {
  return GUEST_ACCESSIBLE_GALLERY_STATUSES.includes(
    status as GuestAccessibleGalleryStatus,
  );
}

export function slugifyGalleryName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_GALLERY_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return slug || "gallery";
}

export function buildCollisionGallerySlug(
  baseSlug: string,
  suffix: string,
): string {
  const suffixSegment = `-${suffix}`;
  const maxBaseLength = MAX_GALLERY_SLUG_LENGTH - suffixSegment.length;

  if (maxBaseLength < 1) {
    throw new Error("Collision slug suffix must leave room for a base slug.");
  }

  const truncatedBase = baseSlug.slice(0, maxBaseLength).replace(/-+$/g, "");

  return `${truncatedBase || "gallery"}${suffixSegment}`;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
