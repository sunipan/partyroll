import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const r2Mock = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({ r2: r2Mock, r2Bucket: "test-bucket" }));

import {
  deleteGalleryObjects,
  getGalleryObjectPrefixes,
} from "./gallery-object-deletion";

const galleryId = "123e4567-e89b-12d3-a456-426614174000";

describe("gallery object deletion", () => {
  beforeEach(() => r2Mock.send.mockReset());

  it("deletes only objects under exact UUID-scoped gallery prefixes", async () => {
    const scopedKey = `quarantine/${galleryId}/photo-1`;
    r2Mock.send
      .mockResolvedValueOnce(
        list([scopedKey, `quarantine/${galleryId}-neighbor/photo-1`, `quarantine/${galleryId}`]),
      )
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    await expect(deleteGalleryObjects({ galleryId })).resolves.toEqual({
      status: "complete",
    });

    expect(listInputs().map((input) => input.Prefix)).toEqual(
      getGalleryObjectPrefixes(galleryId).map((prefix) => prefix.value),
    );
    expect(deleteInputs()).toEqual([[scopedKey]]);
  });

  it("uses ListObjectsV2 pagination and DeleteObjects batches within provider limits", async () => {
    const firstPageKeys = Array.from(
      { length: 1_001 },
      (_, index) => `quarantine/${galleryId}/first-${index}`,
    );
    const secondPageKey = `quarantine/${galleryId}/second-page`;
    r2Mock.send
      .mockResolvedValueOnce(list(firstPageKeys, { truncated: true, token: "next-page" }))
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(list([secondPageKey]))
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    await expect(deleteGalleryObjects({ galleryId })).resolves.toEqual({
      status: "complete",
    });

    expect(listInputs().map((input) => input.ContinuationToken)).toEqual([
      undefined,
      "next-page",
      undefined,
      undefined,
    ]);
    expect(listInputs().every((input) => input.MaxKeys === 1_000)).toBe(true);
    expect(deleteInputs().map((batch) => batch!.length)).toEqual([1_000, 1, 1]);
  });

  it("returns a simple retryable failure without exposing object keys", async () => {
    const failed = `quarantine/${galleryId}/cannot-delete`;
    r2Mock.send
      .mockResolvedValueOnce(list([failed]))
      .mockResolvedValueOnce({ Errors: [{ Key: failed, Code: "AccessDenied" }] });

    const result = await deleteGalleryObjects({ galleryId });

    expect(result).toEqual({
      status: "retryable-error",
      message: "Gallery files could not be deleted. Please try again.",
      failure: {
        phase: "delete",
        prefix: "quarantine",
        errorName: "R2ObjectError",
      },
    });
    expect(JSON.stringify(result)).not.toContain(failed);
  });

  it("treats missing-key delete errors as idempotent success", async () => {
    const key = `quarantine/${galleryId}/already-gone`;
    r2Mock.send
      .mockResolvedValueOnce(list([key]))
      .mockResolvedValueOnce({ Errors: [{ Key: key, Code: "NoSuchKey" }] })
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    await expect(deleteGalleryObjects({ galleryId })).resolves.toEqual({
      status: "complete",
    });
  });

  it("rejects arbitrary gallery-prefix traversal before touching R2", async () => {
    await expect(
      deleteGalleryObjects({ galleryId: `quarantine/${galleryId}/` }),
    ).rejects.toThrow("canonical gallery UUID");
    expect(r2Mock.send).not.toHaveBeenCalled();
  });
});

function list(
  keys: string[] = [],
  options: { truncated?: boolean; token?: string } = {},
) {
  return {
    Contents: keys.map((Key) => ({ Key })),
    IsTruncated: options.truncated ?? false,
    NextContinuationToken: options.token,
  };
}

function deleteOk() {
  return { Errors: [] };
}

function listInputs() {
  return r2Mock.send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof ListObjectsV2Command)
    .map((command) => command.input);
}

function deleteInputs() {
  return r2Mock.send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof DeleteObjectsCommand)
    .map((command) => command.input.Delete?.Objects?.map((object) => object.Key));
}
