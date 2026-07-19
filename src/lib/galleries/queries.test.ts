import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseGalleryAccessCode } from "@/lib/guest-access/access-code";
import {
  completeUploadInputSchema,
  reserveUploadInputSchema,
} from "@/lib/uploads/rules";

const dbMock = vi.hoisted(() => {
  const state = {
    failuresBeforeSuccess: 0,
    insertedValues: [] as Array<{ slug: string }>,
  };
  const returning = vi.fn(async () => {
    const insertedValue = state.insertedValues.at(-1);

    if (!insertedValue) {
      return [];
    }

    if (state.failuresBeforeSuccess > 0) {
      state.failuresBeforeSuccess -= 1;
      return [];
    }

    return [{ id: `gallery-${state.insertedValues.length}`, ...insertedValue }];
  });
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn((insertedValue: { slug: string }) => {
    state.insertedValues.push(insertedValue);

    return { onConflictDoNothing, returning };
  });
  const insert = vi.fn(() => ({ values }));

  return { insert, onConflictDoNothing, returning, state, values };
});

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: {
    insert: dbMock.insert,
  },
}));

import { createGalleryForOwner } from "./queries";

describe("createGalleryForOwner slug collisions", () => {
  beforeEach(() => {
    dbMock.state.failuresBeforeSuccess = 0;
    dbMock.state.insertedValues = [];
    dbMock.insert.mockClear();
    dbMock.values.mockClear();
    dbMock.onConflictDoNothing.mockClear();
    dbMock.returning.mockClear();
  });

  it("persists numeric collision retry slugs within guest contracts", async () => {
    dbMock.state.failuresBeforeSuccess = 1;

    const gallery = await createGalleryForOwner("owner-1", {
      name: "Long Collision Gallery ".repeat(8),
      eventDate: undefined,
    });

    expect(gallery.slug).toMatch(/-2$/);
    expect(dbMock.state.insertedValues.map((value) => value.slug)).toHaveLength(2);
    expectPersistedSlugToSatisfyGuestContracts(gallery.slug);
  });

  it("persists random fallback retry slugs within guest contracts", async () => {
    dbMock.state.failuresBeforeSuccess = 100;

    const gallery = await createGalleryForOwner("owner-1", {
      name: "Long Random Collision Gallery ".repeat(8),
      eventDate: undefined,
    });

    expect(gallery.slug).toMatch(/-[a-f0-9]{8}$/);
    expect(dbMock.state.insertedValues.map((value) => value.slug)).toHaveLength(101);
    expectPersistedSlugToSatisfyGuestContracts(gallery.slug);
  });
});

function expectPersistedSlugToSatisfyGuestContracts(slug: string): void {
  expect(slug.length).toBeLessThanOrEqual(64);
  expect(parseGalleryAccessCode(`${slug}-23456789`)).toEqual({
    code: `${slug}-23456789`,
    slug,
  });
  expect(
    reserveUploadInputSchema.safeParse({
      slug,
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
      mimeType: "image/jpeg",
      byteSize: 1,
      originalFilename: "guest.jpg",
    }).success,
  ).toBe(true);
  expect(completeUploadInputSchema.safeParse({ slug }).success).toBe(true);
}
