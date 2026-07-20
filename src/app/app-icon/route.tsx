import { createPartyrollIcon } from "@/lib/brand-images";

const supportedSizes = new Set([192, 512]);

export function GET(request: Request) {
  const requestedSize = Number(new URL(request.url).searchParams.get("size"));

  if (!supportedSizes.has(requestedSize)) {
    return new Response("Not found", { status: 404 });
  }

  return createPartyrollIcon(requestedSize);
}
