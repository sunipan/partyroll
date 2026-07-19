import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));

const owner = `partyroll-assets-${randomUUID()}`;
const otherOwner = `${owner}-other`;

let db: (typeof import("@/db"))["db"];
let galleries: (typeof import("@/db/schema"))["galleries"];
let photos: (typeof import("@/db/schema"))["photos"];
let galleryQueries: typeof import("@/lib/galleries/queries");
let mediaAssets: typeof import("./media-assets");
let galleryIds: string[] = [];
let mainGallery: Awaited<ReturnType<typeof galleryQueries.createGalleryForOwner>>;
let otherGallery: Awaited<ReturnType<typeof galleryQueries.createGalleryForOwner>>;
let otherOwnerGallery: Awaited<ReturnType<typeof galleryQueries.createGalleryForOwner>>;
let archivedGallery: Awaited<ReturnType<typeof galleryQueries.createGalleryForOwner>>;
const readyImageId = randomUUID();
const readyVideoId = randomUUID();
const pendingImageId = randomUUID();
const otherGalleryImageId = randomUUID();
const otherOwnerImageId = randomUUID();
const archivedImageId = randomUUID();

describe("authorized media asset DB lookups", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ galleries, photos } = await import("@/db/schema"));
    galleryQueries = await import("@/lib/galleries/queries");
    mediaAssets = await import("./media-assets");

    [mainGallery, otherGallery, otherOwnerGallery, archivedGallery] = await Promise.all([
      galleryQueries.createGalleryForOwner(owner, {
        name: `Assets Main ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Assets Other ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(otherOwner, {
        name: `Assets Owner ${randomUUID()}`,
        eventDate: undefined,
      }),
      galleryQueries.createGalleryForOwner(owner, {
        name: `Assets Archived ${randomUUID()}`,
        eventDate: undefined,
      }),
    ]);
    galleryIds = [
      mainGallery.id,
      otherGallery.id,
      otherOwnerGallery.id,
      archivedGallery.id,
    ];

    await db
      .update(galleries)
      .set({ status: "archived" })
      .where(inArray(galleries.id, [archivedGallery.id]));
    await db.insert(photos).values([
      photoFixture({ id: readyImageId, galleryId: mainGallery.id, kind: "image" }),
      photoFixture({ id: readyVideoId, galleryId: mainGallery.id, kind: "video" }),
      photoFixture({ id: pendingImageId, galleryId: mainGallery.id, kind: "image", status: "pending" }),
      photoFixture({ id: otherGalleryImageId, galleryId: otherGallery.id, kind: "image" }),
      photoFixture({ id: otherOwnerImageId, galleryId: otherOwnerGallery.id, kind: "image" }),
      photoFixture({ id: archivedImageId, galleryId: archivedGallery.id, kind: "image" }),
    ]);
  }, 20_000);

  afterAll(async () => {
    if (db && galleries && galleryIds.length > 0) {
      await db.delete(galleries).where(inArray(galleries.id, galleryIds));
    }
  });

  it("returns null uniformly for denied guest asset requests", async () => {
    await expect(
      mediaAssets.lookupGuestMediaAssetForSession({
        galleryId: mainGallery.id,
        slug: mainGallery.slug,
        accessVersion: mainGallery.accessVersion,
        mediaId: readyImageId,
        variant: "display",
      }),
    ).resolves.toMatchObject({ objectKey: `assets/${readyImageId}/display.jpg` });

    const denied = [
      { slug: otherGallery.slug, mediaId: readyImageId, variant: "display" as const },
      { accessVersion: mainGallery.accessVersion + 1, mediaId: readyImageId, variant: "display" as const },
      { mediaId: otherGalleryImageId, variant: "display" as const },
      { galleryId: archivedGallery.id, slug: archivedGallery.slug, mediaId: archivedImageId, variant: "display" as const },
      { mediaId: pendingImageId, variant: "display" as const },
      { mediaId: randomUUID(), variant: "display" as const },
      { mediaId: readyImageId, variant: "video" as const },
      { mediaId: readyVideoId, variant: "thumbnail" as const },
    ];

    for (const input of denied) {
      await expect(
        mediaAssets.lookupGuestMediaAssetForSession({
          galleryId: input.galleryId ?? mainGallery.id,
          slug: input.slug ?? mainGallery.slug,
          accessVersion: input.accessVersion ?? mainGallery.accessVersion,
          mediaId: input.mediaId,
          variant: input.variant,
        }),
      ).resolves.toBeNull();
    }
  });

  it("returns null uniformly for denied admin owner asset requests", async () => {
    await expect(
      mediaAssets.lookupAdminMediaAssetForOwner({
        ownerClerkId: owner,
        galleryId: mainGallery.id,
        mediaId: readyVideoId,
        variant: "video",
      }),
    ).resolves.toMatchObject({ objectKey: `assets/${readyVideoId}/original` });

    const denied = [
      { ownerClerkId: otherOwner, galleryId: mainGallery.id, mediaId: readyImageId, variant: "display" as const },
      { ownerClerkId: owner, galleryId: mainGallery.id, mediaId: otherGalleryImageId, variant: "display" as const },
      { ownerClerkId: owner, galleryId: archivedGallery.id, mediaId: archivedImageId, variant: "display" as const },
      { ownerClerkId: owner, galleryId: mainGallery.id, mediaId: pendingImageId, variant: "display" as const },
      { ownerClerkId: owner, galleryId: mainGallery.id, mediaId: randomUUID(), variant: "display" as const },
      { ownerClerkId: owner, galleryId: mainGallery.id, mediaId: readyVideoId, variant: "thumbnail" as const },
    ];

    for (const input of denied) {
      await expect(mediaAssets.lookupAdminMediaAssetForOwner(input)).resolves.toBeNull();
    }
  });
});

function photoFixture(input: {
  id: string;
  galleryId: string;
  kind: "image" | "video";
  status?: "ready" | "pending";
}) {
  const ready = input.status !== "pending";
  const video = input.kind === "video";
  return {
    id: input.id,
    galleryId: input.galleryId,
    status: ready ? ("ready" as const) : ("pending" as const),
    idempotencyKey: randomUUID(),
    uploaderSessionHash: "a".repeat(64),
    quarantineObjectKey: `assets/${input.id}/quarantine`,
    originalFilename: video ? "first-dance.mp4" : "dance-floor.jpg",
    declaredMimeType: video ? "video/mp4" : "image/jpeg",
    mediaKind: input.kind,
    originalObjectKey: `assets/${input.id}/original`,
    displayObjectKey: video ? null : `assets/${input.id}/display.jpg`,
    thumbnailObjectKey: video ? null : `assets/${input.id}/thumbnail.jpg`,
    declaredByteSize: 1024,
    mimeType: ready ? (video ? "video/mp4" : "image/jpeg") : null,
    byteSize: ready ? 2048 : null,
    width: ready && !video ? 800 : null,
    height: ready && !video ? 600 : null,
    reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    readyAt: ready ? new Date() : null,
  };
}
