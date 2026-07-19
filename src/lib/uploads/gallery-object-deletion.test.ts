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

describe("bounded gallery object deletion", () => {
  beforeEach(() => r2Mock.send.mockReset());

  it("converges with zero objects across current strict gallery prefixes", async () => {
    r2Mock.send.mockResolvedValueOnce(list()).mockResolvedValueOnce(list()).mockResolvedValueOnce(list());

    const result = await deleteGalleryObjects({ galleryId });

    expect(result).toMatchObject({
      status: "complete",
      converged: true,
      discovered: 0,
      deleted: 0,
      remaining: 0,
      cursor: null,
      listRequests: 3,
      deleteBatches: 0,
    });
    expect(listInputs().map((input) => input.Prefix)).toEqual(
      getGalleryObjectPrefixes(galleryId).map((prefix) => prefix.value),
    );
    expect(deleteInputs()).toEqual([]);
  });

  it("deletes only keys under the exact gallery UUID prefix", async () => {
    const scopedKey = `quarantine/${galleryId}/photo-1`;
    r2Mock.send
      .mockResolvedValueOnce(
        list([scopedKey, `quarantine/${galleryId}-neighbor/photo-1`, `quarantine/${galleryId}`]),
      )
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    const result = await deleteGalleryObjects({
      galleryId,
      budget: { maxListRequests: 5 },
    });

    expect(result).toMatchObject({ status: "complete", discovered: 1, deleted: 1 });
    expect(deleteInputs()).toEqual([[scopedKey]]);
  });

  it("handles multiple bounded pages by relisting a prefix until it is empty", async () => {
    const keys = [
      `quarantine/${galleryId}/a`,
      `quarantine/${galleryId}/b`,
      `quarantine/${galleryId}/c`,
    ];
    r2Mock.send
      .mockResolvedValueOnce(list(keys.slice(0, 2), true))
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(list(keys.slice(2)))
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    const result = await deleteGalleryObjects({
      galleryId,
      budget: { listPageSize: 2, maxListRequests: 5, maxDeleteBatches: 2 },
    });

    expect(result).toMatchObject({ status: "complete", discovered: 3, deleted: 3 });
    expect(listInputs().map((input) => input.MaxKeys)).toEqual([2, 2, 2, 2, 2]);
    expect(deleteInputs()).toEqual([keys.slice(0, 2), keys.slice(2)]);
  });

  it("keeps list pages and delete batches within the 1000-object provider boundary", async () => {
    const keys = Array.from({ length: 1_001 }, (_, index) => `quarantine/${galleryId}/${index}`);
    r2Mock.send
      .mockResolvedValueOnce(list(keys))
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(deleteOk());

    const result = await deleteGalleryObjects({
      galleryId,
      budget: {
        listPageSize: 5_000,
        deleteBatchSize: 5_000,
        maxListRequests: 1,
        maxDeleteBatches: 2,
      },
    });

    expect(result).toMatchObject({ status: "bounded", discovered: 1_001, deleted: 1_001 });
    expect(listInputs()[0].MaxKeys).toBe(1_000);
    expect(deleteInputs().map((batch) => batch!.length)).toEqual([1_000, 1]);
  });

  it("stops after the invocation work budget and returns retry progress", async () => {
    const key = `quarantine/${galleryId}/one-pass`;
    r2Mock.send.mockResolvedValueOnce(list([key])).mockResolvedValueOnce(deleteOk());

    const result = await deleteGalleryObjects({
      galleryId,
      budget: { maxListRequests: 1, maxDeleteBatches: 1 },
    });

    expect(result).toMatchObject({
      status: "bounded",
      converged: false,
      discovered: 1,
      deleted: 1,
      remaining: null,
      cursor: { prefixIndex: 0 },
      failure: null,
    });
  });

  it("deduplicates listed keys before issuing deletes", async () => {
    const first = `quarantine/${galleryId}/duplicate`;
    const second = `quarantine/${galleryId}/unique`;
    r2Mock.send
      .mockResolvedValueOnce(list([first, first, second, first]))
      .mockResolvedValueOnce(deleteOk())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    const result = await deleteGalleryObjects({ galleryId, budget: { maxListRequests: 4 } });

    expect(result).toMatchObject({ status: "complete", discovered: 2, duplicates: 2, deleted: 2 });
    expect(deleteInputs()).toEqual([[first, second]]);
  });

  it("treats missing-key delete errors as idempotent success", async () => {
    const key = `quarantine/${galleryId}/already-gone`;
    r2Mock.send
      .mockResolvedValueOnce(list([key]))
      .mockResolvedValueOnce({ Errors: [{ Key: key, Code: "NoSuchKey", Message: "missing" }] })
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    const result = await deleteGalleryObjects({ galleryId, budget: { maxListRequests: 4 } });

    expect(result).toMatchObject({ status: "complete", discovered: 1, deleted: 1, failure: null });
  });
});

function list(keys: string[] = [], truncated = false) {
  return { Contents: keys.map((Key) => ({ Key })), IsTruncated: truncated };
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
