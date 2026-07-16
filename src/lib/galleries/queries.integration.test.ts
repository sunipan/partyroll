import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });
vi.mock("server-only", () => ({}));

const ownerA = `partyroll-test-a-${randomUUID()}`;
const ownerB = `partyroll-test-b-${randomUUID()}`;

let db: (typeof import("@/db"))["db"];
let galleries: (typeof import("@/db/schema"))["galleries"];
let galleryA: Awaited<
  ReturnType<(typeof import("./queries"))["createGalleryForOwner"]>
>;
let galleryB: typeof galleryA;
let queries: typeof import("./queries");

describe("gallery owner isolation", () => {
  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ galleries } = await import("@/db/schema"));
    queries = await import("./queries");

    galleryA = await queries.createGalleryForOwner(ownerA, {
      name: "Owner A Test Gallery",
      eventDate: undefined,
    });
    galleryB = await queries.createGalleryForOwner(ownerB, {
      name: "Owner B Test Gallery",
      eventDate: undefined,
    });
  });

  afterAll(async () => {
    if (db && galleries) {
      await db
        .delete(galleries)
        .where(inArray(galleries.ownerClerkId, [ownerA, ownerB]));
    }
  });

  it("lists only galleries belonging to the requested owner", async () => {
    const ownerAGalleries = await queries.listGalleriesForOwner(ownerA);

    expect(ownerAGalleries.map((gallery) => gallery.id)).toContain(galleryA.id);
    expect(ownerAGalleries.map((gallery) => gallery.id)).not.toContain(galleryB.id);
  });

  it("does not return another owner's gallery", async () => {
    await expect(queries.getGalleryForOwner(ownerA, galleryB.id)).resolves.toBeNull();
  });

  it("does not change another owner's gallery status", async () => {
    await expect(
      queries.updateGalleryStatusForOwner({
        ownerClerkId: ownerA,
        galleryId: galleryB.id,
        nextStatus: "closed",
      }),
    ).resolves.toEqual({ outcome: "not-found" });
  });

  it("does not regenerate another owner's invitation", async () => {
    await expect(
      queries.regenerateGalleryAccessForOwner(ownerA, galleryB.id),
    ).resolves.toBeNull();
  });

  it("persists an approved transition for the owner", async () => {
    const result = await queries.updateGalleryStatusForOwner({
      ownerClerkId: ownerA,
      galleryId: galleryA.id,
      nextStatus: "closed",
    });

    expect(result.outcome).toBe("updated");
    if (result.outcome === "updated") {
      expect(result.gallery.status).toBe("closed");
    }
  });
});
