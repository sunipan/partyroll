import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { regenerateGalleryAccessAction } from "@/app/admin/galleries/actions";
import { AdminHeader } from "@/components/admin/admin-header";
import { CopyField } from "@/components/admin/copy-field";
import { GalleryStatusBadge } from "@/components/admin/gallery-status-badge";
import { GalleryStatusControls } from "@/components/admin/gallery-status-controls";
import { AdminMediaDeletionControl } from "@/components/admin/media-deletion-controls";
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
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
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

export default async function GalleryAdminPage({
  params,
  searchParams,
}: GalleryPageProps) {
  const { userId } = await requireAdmin();
  const { id } = await params;
  const { cursor, deleteError } = await getReadyMediaSearchParams(searchParams);
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
  const readyMediaPage = await listReadyMediaForOwnerGallery({
    ownerClerkId: userId,
    galleryId: gallery.id,
    ...(cursor === undefined ? {} : { cursor }),
  });
  const readyMedia = readyMediaPage.items;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-10 sm:py-9">
      <AdminHeader />

      <section className="py-8 sm:py-10" aria-labelledby="gallery-title">
        <Link
          href="/admin"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 text-muted-foreground",
          })}
        >
          Back to dashboard
        </Link>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
              <span aria-hidden="true" className="h-px w-6 bg-marigold" />
              Gallery workspace
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1
                id="gallery-title"
                className="min-w-0 text-3xl leading-tight font-semibold tracking-[-0.025em] sm:text-4xl"
              >
                {gallery.name}
              </h1>
              <GalleryStatusBadge status={gallery.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {gallery.eventDate
                ? dateFormatter.format(new Date(`${gallery.eventDate}T00:00:00Z`))
                : "No event date"}
            </p>
          </div>
        </div>

        <div className="mt-7 space-y-4 sm:mt-8">
          <Card
            size="sm"
            className="border-primary/10 bg-card shadow-[var(--shadow-control)]"
          >
            <CardHeader className="border-b border-primary/10">
              <CardTitle>
                <h2 className="text-lg">Guest invitation</h2>
              </CardTitle>
              <CardDescription className="max-w-2xl leading-5">
                Share the code, link, or QR invitation. Each opens this private
                gallery for guests.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-6">
              <div className="space-y-4">
                <CopyField
                  label="Access code"
                  value={invitation.accessCode}
                  prominent
                />
                <CopyField
                  label="Invitation link"
                  value={invitation.invitationLink}
                />
              </div>

              <section
                aria-labelledby="qr-invitation-title"
                className="border-t border-primary/10 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
              >
                <div className="flex items-baseline justify-between gap-3 lg:block">
                  <h3 id="qr-invitation-title" className="text-base font-semibold">
                    QR invitation
                  </h3>
                  <p className="text-xs text-muted-foreground lg:mt-1">
                    Version {gallery.accessVersion}
                  </p>
                </div>
                <div className="mt-3 flex flex-col items-center gap-3 lg:items-stretch">
                  <div className="mx-auto rounded-xl border border-primary/15 bg-white p-2 shadow-[var(--shadow-control)]">
                    <Image
                      src={qrPath}
                      alt={`QR invitation for ${gallery.name}`}
                      width={176}
                      height={176}
                      unoptimized
                    />
                  </div>
                  <a
                    href={`${qrPath}&download=1`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "w-full",
                    })}
                    download={`${gallery.slug}-qr.svg`}
                  >
                    Download QR code
                  </a>
                </div>
              </section>
            </CardContent>
          </Card>

          <Card
            size="sm"
            className="border-primary/10 bg-card shadow-[var(--shadow-control)]"
          >
            <CardHeader className="border-b border-primary/10">
              <CardTitle>
                <h2 className="text-lg">Gallery availability</h2>
              </CardTitle>
              <CardDescription className="leading-5">
                Current status: {gallery.status}. Changes are reversible;
                archiving does not delete the gallery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <GalleryStatusControls galleryId={gallery.id} status={gallery.status} />
              <form
                action={regenerateGalleryAccessAction}
                className="flex flex-col gap-3 border-t border-primary/10 pt-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <input type="hidden" name="galleryId" value={gallery.id} />
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">Regenerate guest access</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                    Replace the code, link, and QR invitation. Existing invitations
                    stop working immediately.
                  </p>
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full shrink-0 sm:w-auto"
                >
                  Regenerate access
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card
            size="sm"
            className="border-primary/10 bg-card shadow-[var(--shadow-control)]"
          >
            <CardHeader className="border-b border-primary/10">
              <CardTitle>
                <h2 className="text-lg">Uploaded media</h2>
              </CardTitle>
              <CardDescription className="leading-5">
                {readyMedia.length === 0
                  ? cursor === undefined
                    ? "Ready uploads will appear here once guests add media."
                    : "No ready uploads were found on this media page."
                  : `Showing ${readyMedia.length} ready ${readyMedia.length === 1 ? "item" : "items"} using ${formatByteSize(gallery.storageBytes)}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {readyMedia.length === 0 ? (
                <div className="space-y-3 rounded-xl border border-dashed border-primary/20 bg-muted/25 p-5 text-sm text-muted-foreground">
                  <p>{cursor === undefined ? "No uploaded media yet." : "No media on this page."}</p>
                  {cursor === undefined ? null : (
                    <Link
                      href={`/admin/galleries/${gallery.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      First media page
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <GalleryMediaViewer
                    items={readyMedia.map(toGalleryMediaViewerItem)}
                    itemActions={readyMedia.map((media) => (
                      <AdminMediaDeletionControl
                        key={media.id}
                        galleryId={gallery.id}
                        mediaId={media.id}
                        originalFilename={media.originalFilename}
                        cursor={cursor}
                        deletionFailed={deleteError === media.id}
                      />
                    ))}
                  />
                  {readyMediaPage.nextCursor ? (
                    <nav
                      className="mt-5 flex justify-end border-t border-primary/10 pt-4"
                      aria-label="Uploaded media pagination"
                    >
                      <Link
                        href={{
                          pathname: `/admin/galleries/${gallery.id}`,
                          query: { cursor: readyMediaPage.nextCursor },
                        }}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                        aria-label={`Next uploaded media page for ${gallery.name}`}
                      >
                        Next media page
                      </Link>
                    </nav>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

      </section>
    </main>
  );
}

async function getReadyMediaSearchParams(
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>,
) {
  const params = searchParams ? await searchParams : undefined;
  const cursor = params?.cursor;
  const deleteError = params?.deleteError;

  return {
    cursor: cursor === undefined || typeof cursor === "string" ? cursor : "",
    deleteError: typeof deleteError === "string" ? deleteError : undefined,
  };
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
