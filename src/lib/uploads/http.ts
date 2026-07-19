import "server-only";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";

export function isSameOriginMutation(request: Request): boolean {
  return request.headers.get("origin") === new URL(env.APP_URL).origin;
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    contentLength > maxBytes ||
    !request.body
  ) {
    return null;
  }

  try {
    const reader = request.body.getReader();
    const bytes = new Uint8Array(maxBytes);
    let length = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (length + value.byteLength > maxBytes) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, length);
      length += value.byteLength;
    }

    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
  } catch {
    return null;
  }
}

export function noStoreJson(
  body: object,
  init: ResponseInit = {},
): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
