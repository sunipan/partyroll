import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Images, LockKeyhole } from "lucide-react";

import { PhotoUploadQueue } from "@/components/guest/photo-upload-queue";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthorizedGuestContext } from "@/lib/guest-access/session";
import { listReadyMediaForGuestGallery } from "@/lib/uploads/media";

export const metadata = {
  title: "Guest gallery | Partyroll",
  robots: { index: false, follow: false },
};

export default async function GuestGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const context = await getAuthorizedGuestContext(slug);

  if (!context) {
    notFound();
  }

  const { gallery, session } = context;
  const readyMedia = await listReadyMediaForGuestGallery({
    galleryId: gallery.id,
    slug: gallery.slug,
    accessVersion: session.accessVersion,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10 sm:py-10">
      <header className="flex items-center justify-between gap-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Partyroll home"
        >
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground"
          >
            P
          </span>
          <span className="text-lg font-semibold tracking-tight">Partyroll</span>
        </Link>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-4" />
          Private gallery
        </span>
      </header>

      <section className="py-14 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-widest text-primary uppercase">
            Shared gallery
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {gallery.name}
          </h1>
          {gallery.eventDate ? (
            <p className="mt-4 flex items-center gap-2 text-muted-foreground">
              <CalendarDays aria-hidden="true" className="size-4" />
              {formatEventDate(gallery.eventDate)}
            </p>
          ) : null}
          {gallery.status === "closed" ? (
            <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
              This gallery is open for viewing. The host has paused new media
              uploads.
            </p>
          ) : (
            <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
              You have private access to view this gallery and add party photos
              or videos.
            </p>
          )}
        </div>
      </section>

      {gallery.status === "open" ? <PhotoUploadQueue slug={gallery.slug} /> : null}

      {readyMedia.length > 0 ? (
        <section className="mb-12" aria-labelledby="gallery-media-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 id="gallery-media-title" className="text-2xl font-semibold">
                Shared media
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {readyMedia.length} ready {readyMedia.length === 1 ? "item" : "items"}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {readyMedia.map((media) => (
              <Card key={media.id} className="overflow-hidden bg-card shadow-xs">
                {media.mediaKind === "video" ? (
                  <video
                    controls
                    preload="metadata"
                    src={media.originalUrl}
                    className="aspect-square w-full bg-black object-contain"
                    aria-label={getMediaLabel(media)}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- Private media uses authenticated same-origin routes. */
                  <img
                    src={media.displayUrl}
                    alt={getMediaLabel(media)}
                    className="aspect-square w-full bg-muted object-cover"
                    loading="lazy"
                  />
                )}
                <CardContent className="space-y-1">
                  <p className="truncate font-medium">{getMediaLabel(media)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMediaDetails(media)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <Card className="mb-12 border-dashed bg-card/70 py-12 text-center sm:py-16">
          <CardHeader>
            <Images aria-hidden="true" className="mx-auto size-10 text-primary" />
            <CardTitle className="mt-3 text-xl">No media yet</CardTitle>
            <CardDescription>
              Photos and videos shared by guests will appear together in this gallery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Enter another gallery
            </Link>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function getMediaLabel(media: {
  originalFilename: string;
}) {
  return media.originalFilename;
}

function formatMediaDetails(media: {
  originalByteSize: number;
  width: number | null;
  height: number | null;
}) {
  const dimensions =
    media.width && media.height ? `${media.width}×${media.height}` : null;
  const byteSize = formatByteSize(media.originalByteSize);

  return [dimensions, byteSize].filter(Boolean).join(" · ") || "Ready";
}

function formatByteSize(byteSize: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    style: "unit",
    unit: byteSize >= 1024 * 1024 ? "megabyte" : "kilobyte",
    unitDisplay: "short",
  }).format(byteSize / (byteSize >= 1024 * 1024 ? 1024 * 1024 : 1024));
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
