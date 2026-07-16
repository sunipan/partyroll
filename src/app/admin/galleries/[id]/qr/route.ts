import { auth } from "@clerk/nextjs/server";
import QRCode from "qrcode";

import { getGalleryInvitation } from "@/lib/galleries/invitations";
import { getGalleryForOwner } from "@/lib/galleries/queries";
import { galleryIdSchema } from "@/lib/galleries/rules";

export const runtime = "nodejs";

type QrRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: QrRouteProps) {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  const parsedId = galleryIdSchema.safeParse(id);

  if (!parsedId.success) {
    return new Response("Not found", { status: 404 });
  }

  const gallery = await getGalleryForOwner(userId, parsedId.data);

  if (!gallery) {
    return new Response("Not found", { status: 404 });
  }

  const { invitationLink } = getGalleryInvitation(gallery);
  const svg = await QRCode.toString(invitationLink, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: {
      dark: "#294D3F",
      light: "#FFFFFF",
    },
  });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "image/svg+xml; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });

  if (download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${gallery.slug}-qr.svg"`,
    );
  }

  return new Response(svg, { headers });
}
