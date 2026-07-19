import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { regenerateGalleryAccessAction } from "@/app/admin/galleries/actions";
import { AdminHeader } from "@/components/admin/admin-header";
import { CopyField } from "@/components/admin/copy-field";
import { GalleryStatusBadge } from "@/components/admin/gallery-status-badge";
import { GalleryStatusControls } from "@/components/admin/gallery-status-controls";
import {
  GalleryMediaViewer,
  type GalleryMediaViewerItem,
} from "@/components/gallery/media-viewer";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { getGalleryInvitation } from "@/lib/galleries/invitations";
import { getGalleryForOwner } from "@/lib/galleries/queries";
import { galleryIdSchema } from "@/lib/galleries/rules";
import { listReadyMediaForOwnerGallery } from "@/lib/uploads/media";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

type GalleryPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: GalleryPageProps): Promise<Metadata> {
  const { id } = await params;
  const parsedId = galleryIdSchema.safeParse(id);

  if (!parsedId.success) {
    return { title: "Gallery" };
  }

  const { userId } = await requireAdmin();
  const gallery = await getGalleryForOwner(userId, parsedId.data);

  return { title: gallery?.name ?? "Gallery" };
}

export default async function GalleryAdminPage({ params }: GalleryPageProps) {
  const { userId } = await requireAdmin();
  const { id } = await params;
  const parsedId = galleryIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const gallery = await getGalleryForOwner(userId, parsedId.data);

  if (!gallery) {
    notFound();
  }

  const invitation = getGalleryInvitation(gallery);
  const qrPath = `/admin/galleries/${gallery.id}/qr?v=${gallery.accessVersion}`;
  const readyMedia = await listReadyMediaForOwnerGallery({
    ownerClerkId: userId,
    galleryId: gallery.id,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10 sm:py-10">
      <AdminHeader />

      <section className="py-12 sm:py-16" aria-labelledby="gallery-title">
        <Link
          href="/admin"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Back to dashboard
        </Link>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1
                id="gallery-title"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                {gallery.name}
              </h1>
              <GalleryStatusBadge status={gallery.status} />
            </div>
            <p className="mt-3 text-muted-foreground">
              {gallery.eventDate
                ? dateFormatter.format(new Date(`${gallery.eventDate}T00:00:00Z`))
                : "No event date"}
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="bg-card shadow-xs">
            <CardHeader>
              <CardTitle>Guest invitation</CardTitle>
              <CardDescription className="leading-6">
                Share the code for manual entry or the link as a QR invitation.
                Guests can use either invitation to open the gallery and upload media.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <CopyField label="Access code" value={invitation.accessCode} />
              <CopyField label="Invitation link" value={invitation.invitationLink} />
            </CardContent>
          </Card>

          <Card className="bg-card shadow-xs">
            <CardHeader>
              <CardTitle>QR invitation</CardTitle>
              <CardDescription>Version {gallery.accessVersion}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="rounded-xl border bg-white p-3">
                <Image
                  src={qrPath}
                  alt={`QR invitation for ${gallery.name}`}
                  width={224}
                  height={224}
                  unoptimized
                />
              </div>
              <a
                href={`${qrPath}&download=1`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                download={`${gallery.slug}-qr.svg`}
              >
                Download QR code
              </a>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 bg-card shadow-xs">
          <CardHeader>
            <CardTitle>Gallery availability</CardTitle>
            <CardDescription className="leading-6">
              Current status: {gallery.status}. Status changes are reversible;
              archiving does not delete the gallery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GalleryStatusControls galleryId={gallery.id} status={gallery.status} />
          </CardContent>
        </Card>

        <Card className="mt-6 bg-card shadow-xs">
          <CardHeader>
            <CardTitle>Uploaded media</CardTitle>
            <CardDescription className="leading-6">
              {readyMedia.length === 0
                ? "Ready uploads will appear here once guests add media."
                : `${readyMedia.length} ready ${readyMedia.length === 1 ? "item" : "items"} using ${formatByteSize(gallery.storageBytes)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readyMedia.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
                No uploaded media yet.
              </div>
            ) : (
              <GalleryMediaViewer items={readyMedia.map(toGalleryMediaViewerItem)} />
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 border-primary/20 bg-primary/5 shadow-none">
          <CardHeader>
            <CardTitle>Regenerate guest access</CardTitle>
            <CardDescription className="leading-6">
              Create a new code and QR invitation. Existing invitations will no
              longer work once guest access is enabled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={regenerateGalleryAccessAction}>
              <input type="hidden" name="galleryId" value={gallery.id} />
              <Button type="submit" variant="outline">
                Regenerate access
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function toGalleryMediaViewerItem(media: GalleryMediaViewerItem) {
  return {
    id: media.id,
    originalFilename: media.originalFilename,
    mediaKind: media.mediaKind,
    originalUrl: media.originalUrl,
    displayUrl: media.displayUrl,
    thumbnailUrl: media.thumbnailUrl,
    downloadUrl: media.downloadUrl,
    originalByteSize: media.originalByteSize,
    width: media.width,
    height: media.height,
  } satisfies GalleryMediaViewerItem;
}

function formatByteSize(byteSize: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    style: "unit",
    unit: byteSize >= 1024 * 1024 ? "megabyte" : "kilobyte",
    unitDisplay: "short",
  }).format(byteSize / (byteSize >= 1024 * 1024 ? 1024 * 1024 : 1024));
}
