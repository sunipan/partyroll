import { handleAdminMediaAssetGET } from "@/lib/media-asset-routes";

export const runtime = "nodejs";

type AdminGalleryMediaRouteContext = {
  params: Promise<{ id: string; mediaId: string }>;
};

export async function GET(
  request: Request,
  { params }: AdminGalleryMediaRouteContext,
) {
  const { id: galleryId, mediaId } = await params;
  return handleAdminMediaAssetGET(
    request,
    { params: Promise.resolve({ galleryId, mediaId }) },
    "original",
  );
}
