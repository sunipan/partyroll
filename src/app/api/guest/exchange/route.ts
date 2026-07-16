import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { exchangeGalleryAccessCode } from "@/lib/guest-access/exchange";
import {
  clearGuestAccessAttempts,
  consumeGuestAccessAttempt,
  getClientAddress,
} from "@/lib/guest-access/rate-limit";
import {
  createGuestSession,
  getGuestSessionCookieOptions,
  GUEST_SESSION_COOKIE,
} from "@/lib/guest-access/session";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 512;
const GENERIC_ERROR = { message: "Invalid or unavailable gallery code." };

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return noStoreJson(GENERIC_ERROR, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    contentLength > MAX_REQUEST_BYTES
  ) {
    return noStoreJson(GENERIC_ERROR, { status: 400 });
  }

  const clientAddress = getClientAddress(request);
  const limit = await consumeGuestAccessAttempt(clientAddress);
  if (!limit.allowed) {
    return noStoreJson(
      { message: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  const code = await readAccessCode(request);
  const gallery = code ? await exchangeGalleryAccessCode(code) : null;
  if (!gallery) {
    return noStoreJson(GENERIC_ERROR, { status: 400 });
  }

  await clearGuestAccessAttempts(clientAddress);

  const response = noStoreJson({ galleryPath: `/g/${gallery.slug}` });
  response.cookies.set(
    GUEST_SESSION_COOKIE,
    createGuestSession(gallery),
    getGuestSessionCookieOptions(),
  );

  return response;
}

async function readAccessCode(request: Request): Promise<string | null> {
  try {
    if (!request.body) {
      return null;
    }

    const reader = request.body.getReader();
    const bodyBytes = new Uint8Array(MAX_REQUEST_BYTES);
    let byteLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (byteLength + value.byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }

      bodyBytes.set(value, byteLength);
      byteLength += value.byteLength;
    }

    const body: unknown = JSON.parse(
      new TextDecoder().decode(bodyBytes.subarray(0, byteLength)),
    );
    if (
      !body ||
      typeof body !== "object" ||
      !("code" in body) ||
      typeof body.code !== "string"
    ) {
      return null;
    }

    return body.code;
  } catch {
    return null;
  }
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(env.APP_URL).origin;
}

function noStoreJson(
  body: object,
  init: ResponseInit = {},
): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
