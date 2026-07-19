import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./objects", () => {
  class InvalidUploadError extends Error {}
  return { InvalidUploadError };
});

import { InvalidUploadError } from "./objects";
import { validateUploadedVideo } from "./video-validation";

function box(type: string, payload = Buffer.alloc(4)) {
  const output = Buffer.alloc(8 + payload.byteLength);
  output.writeUInt32BE(output.byteLength, 0);
  output.write(type, 4, 4, "ascii");
  payload.copy(output, 8);
  return output;
}

describe("video upload validation", () => {
  it("accepts MP4-like and WebM container prefixes", () => {
    expect(() =>
      validateUploadedVideo({
        prefix: Buffer.concat([box("ftyp"), box("moov")]),
        mimeType: "video/mp4",
        byteSize: 1024,
      }),
    ).not.toThrow();

    expect(() =>
      validateUploadedVideo({
        prefix: Buffer.concat([
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          Buffer.from("webm", "ascii"),
        ]),
        mimeType: "video/webm",
        byteSize: 1024,
      }),
    ).not.toThrow();
  });

  it("rejects mismatched or malformed video bytes", () => {
    expect(() =>
      validateUploadedVideo({
        prefix: Buffer.from("not a video"),
        mimeType: "video/mp4",
        byteSize: 1024,
      }),
    ).toThrow(InvalidUploadError);

    expect(() =>
      validateUploadedVideo({
        prefix: Buffer.concat([box("ftyp"), box("moov")]),
        mimeType: "video/webm",
        byteSize: 1024,
      }),
    ).toThrow(InvalidUploadError);
  });
});
