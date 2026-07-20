import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { processUploadedImage } from "./image-processing";
import { MAX_IMAGE_SOURCE_BYTES } from "./rules";

describe("authoritative image processing", () => {
  it("normalizes orientation, strips metadata, and creates controlled JPEG assets", async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 120, g: 180, b: 130 },
      },
    })
      .withMetadata({ orientation: 6, exif: { IFD0: { Artist: "Partyroll test" } } })
      .png()
      .toBuffer();

    const result = await processUploadedImage(source);
    const [displayMetadata, thumbnailMetadata] = await Promise.all([
      sharp(result.display).metadata(),
      sharp(result.thumbnail).metadata(),
    ]);

    expect(displayMetadata.format).toBe("jpeg");
    expect(thumbnailMetadata.format).toBe("jpeg");
    expect(Math.max(displayMetadata.width!, displayMetadata.height!)).toBeLessThanOrEqual(
      3000,
    );
    expect(
      Math.max(thumbnailMetadata.width!, thumbnailMetadata.height!),
    ).toBeLessThanOrEqual(720);
    expect(displayMetadata.exif).toBeUndefined();
    expect(displayMetadata.orientation).toBeUndefined();
    expect(result.totalByteSize).toBe(
      result.display.byteLength + result.thumbnail.byteLength,
    );
  });

  it("processes byte-valid images without an additional pixel limit", async () => {
    const source = await sharp({
      create: {
        width: 20_000,
        height: 14_000,
        channels: 3,
        background: { r: 120, g: 180, b: 130 },
      },
      limitInputPixels: false,
    })
      .jpeg()
      .toBuffer();

    expect(source.byteLength).toBeLessThanOrEqual(MAX_IMAGE_SOURCE_BYTES);

    const result = await processUploadedImage(source);
    const metadata = await sharp(result.display).metadata();

    expect(metadata.width).toBe(3000);
    expect(metadata.height).toBe(2100);
  });

  it("rejects malformed and animated input", async () => {
    await expect(
      processUploadedImage(Buffer.from("not an image")),
    ).rejects.toMatchObject({ name: "InvalidImageError" });

    const animatedGif = await sharp({
      create: {
        width: 10,
        height: 20,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        pageHeight: 10,
      },
    })
      .gif()
      .toBuffer();

    await expect(processUploadedImage(animatedGif)).rejects.toMatchObject({
      name: "InvalidImageError",
    });
  });
});
