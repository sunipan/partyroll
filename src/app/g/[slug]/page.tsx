import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Images,
  LockKeyhole,
} from "lucide-react";

import { PartyrollBrand } from "@/components/brand/partyroll-brand";
import {
  GalleryMediaViewer,
  type GalleryMediaViewerItem,
} from "@/components/gallery/media-viewer";
import { PhotoUploadQueue } from "@/components/guest/photo-upload-queue";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthorizedGuestContext } from "@/lib/guest-access/session";
import { privateMetadata } from "@/lib/site-metadata";
import {
  listReadyMediaForGuestGallery,
  type ReadyMediaView,
} from "@/lib/uploads/media";

export const metadata: Metadata = {
  ...privateMetadata,
  title: "Private gallery",
};

export default async function GuestGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const cursor = await getReadyMediaCursor(searchParams);
  const context = await getAuthorizedGuestContext(slug);

  if (!context) {
    notFound();
  }

  const { gallery, session } = context;
  const readyMediaPage = await listReadyMediaForGuestGallery({
    galleryId: gallery.id,
    slug: gallery.slug,
    accessVersion: session.accessVersion,
    ...(cursor === undefined ? {} : { cursor }),
  });
  const readyMedia = readyMediaPage.items;
  const statusPresentation = getGalleryStatusPresentation(gallery.status);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-5 sm:px-8 sm:py-8 lg:px-10">
      <header className="flex min-w-0 items-center justify-between gap-4 border-b border-primary/10 pb-5">
        <Link
          href="/"
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Partyroll home"
        >
          <PartyrollBrand className="[&>svg]:size-9" />
        </Link>
        <Badge variant="outline" className="h-8 gap-1.5 border-primary/20 bg-card px-3 text-primary">
          <LockKeyhole aria-hidden="true" className="size-4" />
          Private gallery
        </Badge>
      </header>

      <section className="py-8 sm:py-12" aria-labelledby="gallery-title">
        <div className="overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-[var(--shadow-paper)]">
          <div className="h-1.5 bg-marigold" aria-hidden="true" />
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
                <span aria-hidden="true" className="h-px w-7 bg-marigold" />
                Guest keepsake
              </p>
              <Badge variant={statusPresentation.badgeVariant}>
                {statusPresentation.icon === "open" ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : statusPresentation.icon === "archived" ? (
                  <Archive aria-hidden="true" />
                ) : (
                  <LockKeyhole aria-hidden="true" />
                )}
                {statusPresentation.label}
              </Badge>
            </div>

            <h1
              id="gallery-title"
              className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-5xl"
            >
              {gallery.name}
            </h1>
            {gallery.eventDate ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-muted-foreground sm:text-base">
                <CalendarDays aria-hidden="true" className="size-4 text-primary" />
                {formatEventDate(gallery.eventDate)}
              </p>
            ) : null}

            <div className="mt-6 border-t border-dashed border-border pt-5">
              <p className="max-w-2xl leading-7 text-muted-foreground">
                {statusPresentation.description}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-primary">
                <LockKeyhole aria-hidden="true" className="size-4" />
                Only guests with this private invitation can see the roll.
              </p>
            </div>
          </div>
        </div>
      </section>

      {gallery.status === "open" ? <PhotoUploadQueue slug={gallery.slug} /> : null}

      {readyMedia.length > 0 ? (
        <section className="mb-10 sm:mb-14" aria-labelledby="gallery-media-title">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-border pb-4 sm:mb-6">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">
                The shared roll
              </p>
              <h2 id="gallery-media-title" className="mt-1 text-2xl font-semibold sm:text-3xl">
                Moments from everyone
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {readyMedia.length} {readyMedia.length === 1 ? "moment" : "moments"} on this page
            </p>
          </div>
          <GalleryMediaViewer
            items={readyMedia.map(toGalleryMediaViewerItem)}
            presentation="guest"
          />
          {readyMediaPage.nextCursor ? (
            <nav
              className="mt-6 flex flex-col items-center gap-3 border-t border-dashed border-border pt-6 sm:flex-row sm:justify-between"
              aria-label="Gallery media pagination"
            >
              <p className="text-sm text-muted-foreground">More moments are waiting on the next page.</p>
              <Link
                href={{
                  pathname: `/g/${gallery.slug}`,
                  query: { cursor: readyMediaPage.nextCursor },
                }}
                className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}
                aria-label={`Next media page for ${gallery.name}`}
              >
                Next media page
                <ChevronRight aria-hidden="true" />
              </Link>
            </nav>
          ) : null}
        </section>
      ) : (
        <section className="mb-10 sm:mb-14" aria-labelledby="empty-gallery-title">
          <Card className="border-dashed border-primary/25 bg-card py-10 text-center sm:py-14">
            <CardHeader>
              <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-primary/15 bg-paper text-primary shadow-xs">
                <Images aria-hidden="true" className="size-6" />
              </span>
              <CardTitle className="mt-3 text-xl sm:text-2xl">
                <h2 id="empty-gallery-title">
                  {cursor === undefined ? "The roll is ready" : "No moments on this page"}
                </h2>
              </CardTitle>
              <CardDescription className="mx-auto max-w-md leading-6">
                {getEmptyGalleryDescription({
                  cursor,
                  status: gallery.status,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={cursor === undefined ? "/" : `/g/${gallery.slug}`}
                className={buttonVariants({ variant: "outline" })}
              >
                {cursor === undefined ? "Join another gallery" : "First media page"}
              </Link>
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}

function getGalleryStatusPresentation(
  status: "open" | "closed" | "archived" | "deleting",
) {
  switch (status) {
    case "open":
      return {
        badgeVariant: "secondary" as const,
        description:
          "Add the photos and videos you captured, then enjoy the moments everyone shared together.",
        icon: "open" as const,
        label: "Open for contributions",
      };
    case "closed":
      return {
        badgeVariant: "outline" as const,
        description:
          "This gallery is open for viewing. The host has paused new photo and video uploads.",
        icon: "closed" as const,
        label: "Viewing only",
      };
    case "archived":
      return {
        badgeVariant: "outline" as const,
        description:
          "This keepsake has been archived. You can still revisit its shared photos and videos.",
        icon: "archived" as const,
        label: "Gallery archived",
      };
    case "deleting":
      return {
        badgeVariant: "outline" as const,
        description:
          "This gallery is no longer available for new uploads while the host removes it.",
        icon: "closed" as const,
        label: "Gallery unavailable",
      };
  }
}

function getEmptyGalleryDescription({
  cursor,
  status,
}: {
  cursor: string | undefined;
  status: "open" | "closed" | "archived" | "deleting";
}) {
  if (cursor !== undefined) {
    return "Return to the first media page to continue browsing this gallery.";
  }
  if (status === "open") {
    return "Be the first to add a photo or video. New moments will gather here for everyone with this invitation.";
  }
  if (status === "closed") {
    return "No photos or videos were shared before the host closed uploads.";
  }
  if (status === "archived") {
    return "This archived gallery does not have any shared photos or videos.";
  }
  return "This gallery is no longer available.";
}

async function getReadyMediaCursor(
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>,
) {
  const cursor = searchParams ? (await searchParams).cursor : undefined;

  if (cursor === undefined || typeof cursor === "string") {
    return cursor;
  }

  return "";
}

function toGalleryMediaViewerItem(media: ReadyMediaView) {
  return {
    id: media.id,
    originalFilename: media.originalFilename,
    mediaKind: media.mediaKind,
    originalUrl: media.originalUrl,
    displayUrl: media.displayUrl,
    thumbnailUrl: media.thumbnailUrl,
    thumbnailPlaceholderDataUrl: media.thumbnailPlaceholderDataUrl,
    downloadUrl: media.downloadUrl,
    originalByteSize: media.originalByteSize,
    width: media.width,
    height: media.height,
  } satisfies GalleryMediaViewerItem;
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
