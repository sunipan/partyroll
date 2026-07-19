import type { Metadata } from "next";
import Link from "next/link";

import { AdminHeader } from "@/components/admin/admin-header";
import { GalleryDeletionControl } from "@/components/admin/gallery-deletion-control";
import { GalleryStatusBadge } from "@/components/admin/gallery-status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10 sm:py-10">
      <AdminHeader />

      <section className="py-12 sm:py-16" aria-labelledby="dashboard-title">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-widest text-primary uppercase">
              Administrator
            </p>
            <h1
              id="dashboard-title"
              className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Your galleries
            </h1>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              Create a private gallery, then share its code or QR invitation
              with your guests.
            </p>
          </div>
          <Link href="/admin/galleries/new" className={buttonVariants({ size: "lg" })}>
            Create gallery
          </Link>
        </div>

        {galleries.length === 0 ? (
          <Card className="mt-10 border-dashed bg-card/70 text-center shadow-none">
            <CardHeader className="py-10">
              <CardTitle>No galleries yet</CardTitle>
              <CardDescription className="mx-auto max-w-md leading-6">
                Create your first gallery to generate a private guest code and
                QR invitation.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {galleries.map((gallery) => (
              <Card key={gallery.id} className="bg-card shadow-xs">
                <CardHeader>
                  <CardTitle className="text-lg">{gallery.name}</CardTitle>
                  <CardDescription>
                    {gallery.eventDate
                      ? dateFormatter.format(new Date(`${gallery.eventDate}T00:00:00Z`))
                      : "No event date"}
                  </CardDescription>
                  <CardAction>
                    <GalleryStatusBadge status={gallery.status} />
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
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
