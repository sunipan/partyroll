import { describe, expect, it, vi, beforeEach } from "vitest";

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
  handleAdminMediaAssetGET,
  handleGuestMediaAssetGET,
  MEDIA_ASSET_CACHE_CONTROL,
  MEDIA_REDIRECT_URL_SECONDS,
  signR2MediaAssetUrl,
} from "./media-asset-routes";
import type { MediaAssetVariant, ResolvedMediaAsset } from "./media-assets";

describe("guest media asset route responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes with the guest lookup before signing and redirects privately", async () => {
    const resolved = asset({ variant: "display", objectKey: "display-key" });
    const lookupGuestMediaAsset = vi.fn(async () => resolved);
    const signMediaAssetUrl = vi.fn(async () => "https://r2.example/display");

    const response = await handleGuestMediaAssetGET(routeRequest("display"), routeParams(), "display", {
      lookupGuestMediaAsset,
      signMediaAssetUrl,
    });

    expect(lookupGuestMediaAsset).toHaveBeenCalledWith({
      slug: "party",
      mediaId: "media-1",
      variant: "display",
    });
    expect(signMediaAssetUrl).toHaveBeenCalledWith({
      asset: resolved,
      responseMetadata: {
        cacheControl: MEDIA_ASSET_CACHE_CONTROL,
        contentType: "image/jpeg",
        contentDisposition: "inline",
      },
      expiresInSeconds: MEDIA_REDIRECT_URL_SECONDS,
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://r2.example/display");
    expectPrivateHeaders(response);
  });

  it("returns identical minimal no-store 404s for the denial matrix seam", async () => {
    const denialCases = [
      "unauthenticated",
      "wrong slug",
      "wrong gallery",
      "rotated access version",
      "archived gallery",
      "not-ready media",
      "missing media",
      "cross-gallery media",
      "wrong variant for kind",
    ];

    for (const label of denialCases) {
      const lookupGuestMediaAsset = vi.fn(async () => null);
      const signMediaAssetUrl = vi.fn();
      const response = await handleGuestMediaAssetGET(routeRequest(label), routeParams(label), "display", {
        lookupGuestMediaAsset,
        signMediaAssetUrl,
      });

      expect(response.status, label).toBe(404);
      expect(await response.text(), label).toBe("Not found");
      expectPrivateHeaders(response);
      expect(lookupGuestMediaAsset, label).toHaveBeenCalledOnce();
      expect(signMediaAssetUrl, label).not.toHaveBeenCalled();
    }
  });

  it("signs a private R2 GET with 60s TTL and inline response metadata", async () => {
    let commandInput: Record<string, unknown> | undefined;
    let signOptions: unknown;
    vi.mocked(getSignedUrl).mockImplementationOnce(
      async (_client, command, options) => {
        commandInput = (command as { input: Record<string, unknown> }).input;
        signOptions = options;
        return "https://r2.example/thumb";
      },
    );

    await expect(
      signR2MediaAssetUrl({
        asset: asset({ variant: "thumbnail", objectKey: "thumb-key" }),
        responseMetadata: {
          cacheControl: MEDIA_ASSET_CACHE_CONTROL,
          contentType: "image/jpeg",
          contentDisposition: "inline",
        },
        expiresInSeconds: MEDIA_REDIRECT_URL_SECONDS,
      }),
    ).resolves.toBe("https://r2.example/thumb");

    expect(signOptions).toEqual({ expiresIn: 60 });
    expect(commandInput).toMatchObject({
      Bucket: "private-bucket",
      Key: "thumb-key",
      ResponseCacheControl: MEDIA_ASSET_CACHE_CONTROL,
      ResponseContentType: "image/jpeg",
      ResponseContentDisposition: "inline",
    });
  });

});

describe("admin owner media asset route responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes with the admin owner lookup before signing and redirects privately", async () => {
    const resolved = asset({
      variant: "download",
      objectKey: "original-key",
      originalMimeType: "image/png",
      responseContentType: "image/png",
      safeOriginalFilename: "party portrait.png",
    });
    const lookupAdminMediaAsset = vi.fn(async () => resolved);
    const signMediaAssetUrl = vi.fn(
      async () => "https://r2.example/admin-download",
    );

    const response = await handleAdminMediaAssetGET(
      adminRouteRequest("download"),
      adminRouteParams(),
      "download",
      {
        lookupAdminMediaAsset,
        signMediaAssetUrl,
      },
    );

    expect(lookupAdminMediaAsset).toHaveBeenCalledWith({
      galleryId: "gallery-1",
      mediaId: "media-1",
      variant: "download",
    });
    expect(signMediaAssetUrl).toHaveBeenCalledWith({
      asset: resolved,
      responseMetadata: {
        cacheControl: MEDIA_ASSET_CACHE_CONTROL,
        contentType: "image/png",
        contentDisposition:
          "attachment; filename=\"party portrait.png\"; filename*=UTF-8''party%20portrait.png",
      },
      expiresInSeconds: MEDIA_REDIRECT_URL_SECONDS,
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://r2.example/admin-download",
    );
    expectPrivateHeaders(response);
  });

  it("returns identical minimal no-store 404s for admin denial and owner-scope misses", async () => {
    const denialCases = [
      "unauthenticated",
      "forbidden owner",
      "cross-owner gallery",
      "missing gallery",
      "missing media",
      "not-ready media",
      "archived gallery",
      "wrong variant for kind",
    ];

    for (const label of denialCases) {
      const lookupAdminMediaAsset = vi.fn(async () => null);
      const signMediaAssetUrl = vi.fn();
      const response = await handleAdminMediaAssetGET(
        adminRouteRequest(label),
        adminRouteParams({ mediaId: label }),
        "display",
        {
          lookupAdminMediaAsset,
          signMediaAssetUrl,
        },
      );

      expect(response.status, label).toBe(404);
      expect(await response.text(), label).toBe("Not found");
      expectPrivateHeaders(response);
      expect(lookupAdminMediaAsset, label).toHaveBeenCalledWith({
        galleryId: "gallery-1",
        mediaId: label,
        variant: "display",
      });
      expect(signMediaAssetUrl, label).not.toHaveBeenCalled();
    }
  });
});

function expectPrivateHeaders(response: Response) {
  expect(Object.fromEntries(response.headers)).toMatchObject({
    "cache-control": MEDIA_ASSET_CACHE_CONTROL,
    expires: "0",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    vary: "Cookie",
    "x-content-type-options": "nosniff",
  });
}

function routeRequest(mediaId: string) {
  return new Request(`https://partyroll.test/g/party/media/${mediaId}/display`);
}

function routeParams(mediaId = "media-1") {
  return { params: Promise.resolve({ slug: "party", mediaId }) };
}

function adminRouteRequest(mediaId: string) {
  return new Request(
    `https://partyroll.test/admin/galleries/gallery-1/media/${mediaId}/display`,
  );
}

function adminRouteParams(overrides: { mediaId?: string } = {}) {
  return {
    params: Promise.resolve({
      galleryId: "gallery-1",
      mediaId: overrides.mediaId ?? "media-1",
    }),
  };
}

function asset(overrides: Partial<ResolvedMediaAsset> = {}): ResolvedMediaAsset {
  const variant = overrides.variant ?? "display";
  const video = variant === "video";

  return {
    mediaId: "media-1",
    galleryId: "gallery-1",
    mediaKind: video ? "video" : "image",
    variant: variant as MediaAssetVariant,
    objectKey: video ? "video-original-key" : "display-key",
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
