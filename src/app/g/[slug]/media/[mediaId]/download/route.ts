import {
  handleGuestMediaAssetGET,
  type GuestMediaAssetRouteContext,
} from "@/lib/media-asset-routes";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: GuestMediaAssetRouteContext,
) {
  return handleGuestMediaAssetGET(request, context, "download");
}
