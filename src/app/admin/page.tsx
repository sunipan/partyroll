import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";

import { AdminHeader } from "@/components/admin/admin-header";
import { GalleryDeletionControl } from "@/components/admin/gallery-deletion-control";
import { GalleryStatusBadge } from "@/components/admin/gallery-status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { listGalleriesForOwner } from "@/lib/galleries/queries";

export const metadata: Metadata = {
  title: "Dashboard",
};

type AdminPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { userId } = await requireAdmin();
  const { confirmError, deleteError } = await getGalleryDeletionSearchParams(
    searchParams,
  );
  const galleries = await listGalleriesForOwner(userId);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-10 sm:py-9">
      <AdminHeader />

      <section className="py-9 sm:py-12" aria-labelledby="dashboard-title">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
              <span aria-hidden="true" className="h-px w-6 bg-marigold" />
              Administrator
            </p>
            <h1
              id="dashboard-title"
              className="mt-2 text-3xl leading-tight font-semibold tracking-[-0.025em] sm:text-4xl"
            >
              Your galleries
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Create a private gallery, then share its code or QR invitation
              with your guests.
            </p>
          </div>
          <Link href="/admin/galleries/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Create gallery
          </Link>
        </div>

        {galleries.length === 0 ? (
          <Card className="mt-8 border-dashed border-primary/25 bg-card/70 text-center shadow-none sm:mt-9">
            <CardHeader className="pt-5">
              <span
                aria-hidden="true"
                className="mx-auto mb-1 flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground"
              >
                <Plus className="size-4" />
              </span>
              <CardTitle>
                <h2 className="text-lg">No galleries yet</h2>
              </CardTitle>
              <CardDescription className="mx-auto max-w-md leading-6">
                Create your first gallery to generate a private guest code and
                QR invitation.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-2">
              <Link
                href="/admin/galleries/new"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Create your first gallery
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-4 sm:mt-9 sm:grid-cols-2">
            {galleries.map((gallery) => (
              <Card
                key={gallery.id}
                size="sm"
                className="border-primary/10 bg-card shadow-[var(--shadow-control)]"
              >
                <CardHeader>
                  <CardTitle className="min-w-0 pr-2">
                    <h2 className="min-w-0 truncate text-lg" title={gallery.name}>
                      {gallery.name}
                    </h2>
                  </CardTitle>
                  <CardDescription className="text-xs leading-5">
                    {gallery.eventDate
                      ? dateFormatter.format(new Date(`${gallery.eventDate}T00:00:00Z`))
                      : "No event date"}
                  </CardDescription>
                  <CardAction>
                    <GalleryStatusBadge status={gallery.status} />
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex flex-wrap items-start justify-between gap-3 bg-muted/40">
                  <Link
                    href={`/admin/galleries/${gallery.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Manage gallery
                  </Link>
                  <GalleryDeletionControl
                    galleryId={gallery.id}
                    galleryName={gallery.name}
                    confirmationFailed={confirmError === gallery.id}
                    deletionFailed={
                      deleteError === gallery.id || gallery.status === "deleting"
                    }
                    isDeleting={gallery.status === "deleting"}
                  />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

async function getGalleryDeletionSearchParams(
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>,
) {
  const params = searchParams ? await searchParams : undefined;
  const confirmError = params?.confirmError;
  const deleteError = params?.deleteError;

  return {
    confirmError: typeof confirmError === "string" ? confirmError : undefined,
    deleteError: typeof deleteError === "string" ? deleteError : undefined,
  };
}
