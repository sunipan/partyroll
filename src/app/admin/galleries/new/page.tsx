import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { AdminHeader } from "@/components/admin/admin-header";
import { CreateGalleryForm } from "@/components/admin/create-gallery-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Create gallery",
};

export default async function NewGalleryPage() {
  await requireAdmin();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-10 sm:py-9">
      <AdminHeader />

      <section className="py-9 sm:py-12" aria-labelledby="create-gallery-title">
        <Link
          href="/admin"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 text-muted-foreground hover:text-foreground",
          })}
        >
          <ArrowLeft aria-hidden="true" />
          Back to dashboard
        </Link>

        <div className="mt-5 max-w-2xl">
          <div className="mb-6">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
              <span aria-hidden="true" className="h-px w-6 bg-marigold" />
              New keepsake roll
            </p>
            <h1
              id="create-gallery-title"
              className="mt-2 text-3xl leading-tight font-semibold tracking-[-0.025em] sm:text-4xl"
            >
              Create a gallery
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Set up the event now. Its private guest code and QR invitation
              will be ready next.
            </p>
          </div>

          <Card className="border-primary/10 bg-card shadow-[var(--shadow-paper)]">
            <CardHeader className="border-b border-dashed border-border pb-4">
              <CardTitle>
                <h2 className="text-lg">Gallery details</h2>
              </CardTitle>
              <CardDescription className="leading-6">
                Use a name your guests will recognize. You can leave the date
                open if plans are still taking shape.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-1">
              <CreateGalleryForm />
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
