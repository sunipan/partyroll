import type { Metadata } from "next";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10 sm:py-10">
      <AdminHeader />

      <section className="py-12 sm:py-16">
        <Link
          href="/admin"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Back to dashboard
        </Link>

        <div className="mt-6 max-w-xl">
          <Card className="bg-card shadow-xs">
            <CardHeader>
              <CardTitle className="text-2xl">Create a gallery</CardTitle>
              <CardDescription className="leading-6">
                Give the event a clear name. Partyroll will create its private
                access code and QR invitation automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateGalleryForm />
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
