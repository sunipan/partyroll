import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({
  r2: { name: "r2-client" },
  r2Bucket: "private-bucket",
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://r2.example/signed"),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  createMediaAssetContentDisposition,
  createMediaAssetRedirectResponse,
  getMediaAssetResponseMetadata,
  MEDIA_ASSET_CACHE_CONTROL,
} from "./media-asset-routes";
import type { MediaAssetVariant, ResolvedMediaAsset } from "./media-assets";

describe("media asset response disposition metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses exact original key, original MIME, and safe attachment filenames", async () => {
    let commandInput: Record<string, unknown> | undefined;
    vi.mocked(getSignedUrl).mockImplementationOnce(async (_client, command) => {
      commandInput = (command as { input: Record<string, unknown> }).input;
      return "https://r2.example/original";
    });

    const response = await createMediaAssetRedirectResponse(
      asset({
        variant: "download",
        objectKey: "original-key",
        responseContentType: "application/octet-stream",
        originalMimeType: "image/heic",
        safeOriginalFilename: '../résumé";\r\nparty.heic',
      }),
    );

    expect(response.status).toBe(307);
    expect(commandInput).toMatchObject({
      Key: "original-key",
      ResponseContentType: "image/heic",
    });
    const disposition = String(commandInput?.ResponseContentDisposition);
    expect(disposition).toContain('filename="_resume____party.heic"');
    expect(disposition).toContain(
      "filename*=UTF-8''_r%C3%A9sum%C3%A9____party.heic",
    );
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).not.toContain("../");
  });

  it("uses inline disposition for view variants and attachment for download", () => {
    for (const variant of ["thumbnail", "display", "video", "original"] as const) {
      expect(getMediaAssetResponseMetadata(asset({ variant }))).toMatchObject({
        contentDisposition: "inline",
      });
    }

    expect(createMediaAssetContentDisposition("attachment", "first dance.mp4")).toBe(
      "attachment; filename=\"first dance.mp4\"; filename*=UTF-8''first%20dance.mp4",
    );
  });

  it("does not sign when download filename metadata is unsafe after sanitizing", async () => {
    const signMediaAssetUrl = vi.fn();
    const response = await createMediaAssetRedirectResponse(
      asset({ variant: "download", safeOriginalFilename: "\u202e" }),
      { signMediaAssetUrl },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(signMediaAssetUrl).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe(MEDIA_ASSET_CACHE_CONTROL);
  });
});

function asset(overrides: Partial<ResolvedMediaAsset> = {}): ResolvedMediaAsset {
  const variant = overrides.variant ?? "download";
  const video = variant === "video";

  return {
    mediaId: "media-1",
    galleryId: "gallery-1",
    mediaKind: video ? "video" : "image",
    variant: variant as MediaAssetVariant,
    objectKey: video ? "video-original-key" : "original-key",
    responseContentType: video ? "video/mp4" : "image/jpeg",
    originalFilename: video ? "first-dance.mp4" : "dance-floor.jpg",
    safeOriginalFilename: video ? "first-dance.mp4" : "dance-floor.jpg",
    originalMimeType: video ? "video/mp4" : "image/jpeg",
    originalByteSize: 1234,
    retainedByteSize: 2345,
    width: video ? null : 800,
    height: video ? null : 600,
    ...overrides,
  };
}
