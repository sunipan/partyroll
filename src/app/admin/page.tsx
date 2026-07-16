import { UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminPage() {
  await requireAdmin();

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
        <UserButton />
      </header>

      <section className="flex flex-1 items-center py-16 sm:py-24">
        <div className="w-full rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
          <p className="text-sm font-semibold tracking-widest text-primary uppercase">
            Administrator
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-card-foreground sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
            Gallery creation and management will be added in the next phase.
            Authentication is ready for administrator-only pages.
          </p>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", className: "mt-8" })}
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
