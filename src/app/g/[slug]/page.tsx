import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Images, LockKeyhole } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthorizedGuestGallery } from "@/lib/guest-access/session";

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
  const gallery = await getAuthorizedGuestGallery(slug);

  if (!gallery) {
    notFound();
  }

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
              This gallery is open for viewing. The host has paused new photo
              uploads.
            </p>
          ) : (
            <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
              You have private access to view this gallery and add party photos.
            </p>
          )}
        </div>
      </section>

      <Card className="mb-12 border-dashed bg-card/70 py-12 text-center sm:py-16">
        <CardHeader>
          <Images aria-hidden="true" className="mx-auto size-10 text-primary" />
          <CardTitle className="mt-3 text-xl">No photos yet</CardTitle>
          <CardDescription>
            Photos shared by guests will appear together in this gallery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Enter another gallery
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
