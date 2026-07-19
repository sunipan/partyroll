import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const r2Mock = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({ r2: r2Mock, r2Bucket: "test-bucket" }));

import { deleteGalleryObjects } from "./gallery-object-deletion";

const galleryId = "123e4567-e89b-12d3-a456-426614174000";

describe("gallery object deletion failures and retries", () => {
  beforeEach(() => r2Mock.send.mockReset());

  it("rejects arbitrary gallery-prefix traversal before touching R2", async () => {
    await expect(
      deleteGalleryObjects({ galleryId: `quarantine/${galleryId}/` }),
    ).rejects.toThrow("canonical gallery UUID");
    expect(r2Mock.send).not.toHaveBeenCalled();
  });

  it("returns retryable progress for partial per-object delete errors", async () => {
    const first = `quarantine/${galleryId}/ok`;
    const failed = `quarantine/${galleryId}/cannot-delete`;
    r2Mock.send
      .mockResolvedValueOnce(list([first, failed]))
      .mockResolvedValueOnce({
        Errors: [
          {
            Key: failed,
            Code: "AccessDenied",
            Message: "see https://signed.example.test/private",
          },
        ],
      });

    const result = await deleteGalleryObjects({ galleryId });

    expect(result).toMatchObject({
      status: "retryable-error",
      converged: false,
      discovered: 2,
      deleted: 1,
      remaining: null,
      cursor: { prefixIndex: 0 },
      failure: {
        phase: "delete",
        prefix: "quarantine",
        errorName: "R2ObjectError",
        objectErrorCount: 1,
        errorCodes: [{ code: "AccessDenied", count: 1 }],
      },
    });
    expect(JSON.stringify(result)).not.toContain(failed);
    expect(JSON.stringify(result)).not.toContain("https://signed");
    expect(deleteInputs()).toEqual([[first, failed]]);
  });

  it("returns retryable progress for list failures without exposing provider messages", async () => {
    const error = Object.assign(new Error("secret https://signed.example.test"), {
      name: "TimeoutError",
    });
    r2Mock.send.mockRejectedValueOnce(error);

    const result = await deleteGalleryObjects({ galleryId });

    expect(result).toMatchObject({
      status: "retryable-error",
      converged: false,
      discovered: 0,
      deleted: 0,
      cursor: { prefixIndex: 0 },
      failure: { phase: "list", prefix: "quarantine", errorName: "TimeoutError" },
    });
    expect(JSON.stringify(result)).not.toContain("https://signed");
  });

  it("retries from the same prefix and converges after a partial delete failure", async () => {
    const deleted = `quarantine/${galleryId}/deleted-first`;
    const retry = `quarantine/${galleryId}/retry-me`;
    r2Mock.send
      .mockResolvedValueOnce(list([deleted, retry]))
      .mockResolvedValueOnce({ Errors: [{ Key: retry, Code: "InternalError" }] });

    const first = await deleteGalleryObjects({ galleryId });

    expect(first).toMatchObject({ status: "retryable-error", deleted: 1, cursor: { prefixIndex: 0 } });

    r2Mock.send
      .mockResolvedValueOnce(list([retry]))
      .mockResolvedValueOnce({ Errors: [] })
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(list());

    const second = await deleteGalleryObjects({
      galleryId,
      cursor: first.cursor,
      budget: { maxListRequests: 4 },
    });

    expect(second).toMatchObject({
      status: "complete",
      converged: true,
      discovered: 1,
      deleted: 1,
      remaining: 0,
      cursor: null,
      failure: null,
    });
    expect(deleteInputs()).toEqual([[deleted, retry], [retry]]);
  });
});

function list(keys: string[] = []) {
  return { Contents: keys.map((Key) => ({ Key })), IsTruncated: false };
}

function deleteInputs() {
  return r2Mock.send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof DeleteObjectsCommand)
    .map((command) => command.input.Delete?.Objects?.map((object) => object.Key));
}
