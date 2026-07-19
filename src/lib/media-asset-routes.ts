import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import {
  lookupAdminMediaAsset,
  lookupGuestMediaAsset,
  type MediaAssetVariant,
  type ResolvedMediaAsset,
} from "@/lib/media-assets";
import { r2, r2Bucket } from "@/lib/r2";

export const MEDIA_REDIRECT_URL_SECONDS = 60;
export const MEDIA_ASSET_CACHE_CONTROL =
  "private,no-store,max-age=0,must-revalidate";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": MEDIA_ASSET_CACHE_CONTROL,
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
} as const;

type LookupGuestMediaAsset = typeof lookupGuestMediaAsset;
type LookupAdminMediaAsset = typeof lookupAdminMediaAsset;

export type GuestMediaAssetRouteContext = {
  params: Promise<{ slug: string; mediaId: string }>;
};

export type AdminMediaAssetRouteContext = {
  params: Promise<{ galleryId: string; mediaId: string }>;
};

export type MediaAssetResponseMetadata = {
  cacheControl: string;
  contentType: string;
  contentDisposition: string;
};

export type SignMediaAssetUrlInput = {
  asset: ResolvedMediaAsset;
  responseMetadata: MediaAssetResponseMetadata;
  expiresInSeconds: number;
};

export type SignMediaAssetUrl = (
  input: SignMediaAssetUrlInput,
) => Promise<string>;

type GuestMediaAssetRouteDeps = {
  lookupGuestMediaAsset?: LookupGuestMediaAsset;
  signMediaAssetUrl?: SignMediaAssetUrl;
};

type AdminMediaAssetRouteDeps = {
  lookupAdminMediaAsset?: LookupAdminMediaAsset;
  signMediaAssetUrl?: SignMediaAssetUrl;
};

export async function handleGuestMediaAssetGET(
  _request: Request,
  { params }: GuestMediaAssetRouteContext,
  variant: MediaAssetVariant,
  deps: GuestMediaAssetRouteDeps = {},
): Promise<Response> {
  const { slug, mediaId } = await params;
  return handleResolvedMediaAssetGET(
    () =>
      (deps.lookupGuestMediaAsset ?? lookupGuestMediaAsset)({
        slug,
        mediaId,
        variant,
      }),
    { signMediaAssetUrl: deps.signMediaAssetUrl },
  );
}

export async function handleAdminMediaAssetGET(
  _request: Request,
  { params }: AdminMediaAssetRouteContext,
  variant: MediaAssetVariant,
  deps: AdminMediaAssetRouteDeps = {},
): Promise<Response> {
  const { galleryId, mediaId } = await params;
  return handleResolvedMediaAssetGET(
    () =>
      (deps.lookupAdminMediaAsset ?? lookupAdminMediaAsset)({
        galleryId,
        mediaId,
        variant,
      }),
    { signMediaAssetUrl: deps.signMediaAssetUrl },
  );
}

async function handleResolvedMediaAssetGET(
  resolveAsset: () => Promise<ResolvedMediaAsset | null>,
  deps: { signMediaAssetUrl?: SignMediaAssetUrl },
): Promise<Response> {
  const asset = await resolveAsset();

  if (!asset) {
    return createMediaAssetNotFoundResponse();
  }

  return createMediaAssetRedirectResponse(asset, {
    signMediaAssetUrl: deps.signMediaAssetUrl,
  });
}

export async function createMediaAssetRedirectResponse(
  asset: ResolvedMediaAsset,
  deps: { signMediaAssetUrl?: SignMediaAssetUrl } = {},
): Promise<Response> {
  const responseMetadata = getMediaAssetResponseMetadata(asset);
  if (!responseMetadata) {
    return createMediaAssetNotFoundResponse();
  }

  try {
    const signedUrl = await (deps.signMediaAssetUrl ?? signR2MediaAssetUrl)({
      asset,
      responseMetadata,
      expiresInSeconds: MEDIA_REDIRECT_URL_SECONDS,
    });

    return NextResponse.redirect(signedUrl, {
      status: 307,
      headers: getMediaAssetPrivateHeaders(),
    });
  } catch {
    return new Response("Service unavailable", {
      status: 503,
      headers: getMediaAssetPrivateHeaders(),
    });
  }
}

export function createMediaAssetNotFoundResponse(): Response {
  return new Response("Not found", {
    status: 404,
    headers: getMediaAssetPrivateHeaders(),
  });
}

export function getMediaAssetPrivateHeaders(): Record<string, string> {
  return { ...PRIVATE_RESPONSE_HEADERS };
}

export function getMediaAssetResponseMetadata(
  asset: ResolvedMediaAsset,
): MediaAssetResponseMetadata | null {
  const contentDisposition = createMediaAssetContentDisposition(
    asset.variant === "download" ? "attachment" : "inline",
    asset.safeOriginalFilename,
  );
  if (!contentDisposition) return null;

  return {
    cacheControl: MEDIA_ASSET_CACHE_CONTROL,
    contentType:
      asset.variant === "download"
        ? asset.originalMimeType
        : asset.responseContentType,
    contentDisposition,
  };
}

export async function signR2MediaAssetUrl({
  asset,
  responseMetadata,
  expiresInSeconds,
}: SignMediaAssetUrlInput): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: r2Bucket,
      Key: asset.objectKey,
      ResponseCacheControl: responseMetadata.cacheControl,
      ResponseContentType: responseMetadata.contentType,
      ResponseContentDisposition: responseMetadata.contentDisposition,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export function createMediaAssetContentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
): string | null {
  if (disposition === "inline") return "inline";

  const safeFilename = sanitizeHeaderFilename(filename);
  if (!safeFilename) return null;

  const asciiFilename = getAsciiFilename(safeFilename);
  if (!asciiFilename) return null;

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeRfc5987Value(safeFilename)}`;
}

function sanitizeHeaderFilename(value: string): string | null {
  const cleaned = value
    .normalize("NFC")
    .replace(/[\\/\u0000-\u001f\u007f"';`]/g, "_")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");
  const capped = cleaned.slice(0, 180).replace(/[. ]+$/g, "");

  return capped.length > 0 ? capped : null;
}

function getAsciiFilename(value: string): string | null {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[\\/\u0000-\u001f\u007f"';`]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");
  const capped = ascii.slice(0, 180).replace(/[. ]+$/g, "");

  return capped.length > 0 ? capped : null;
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
