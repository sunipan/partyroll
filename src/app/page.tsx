import { SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { GuestAccessForm } from "@/components/guest/guest-access-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function Home() {
  const { userId } = await auth();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10 sm:py-10">
      <header
        className="flex items-center justify-between gap-6"
        aria-label="Partyroll"
      >
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground"
          >
            P
          </span>
          <span className="text-lg font-semibold tracking-tight">Partyroll</span>
        </Link>

        <nav aria-label="Account">
          {userId ? (
            <Link href="/admin" className={buttonVariants()}>
              Dashboard
            </Link>
          ) : (
            <SignInButton mode="modal" forceRedirectUrl="/admin">
              <Button variant="outline">Sign in</Button>
            </SignInButton>
          )}
        </nav>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_24rem] lg:py-24">
        <div className="max-w-2xl">
          <p className="mb-5 text-sm font-semibold tracking-widest text-primary uppercase">
            Private party galleries
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
            Every photo from your party, in one place.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Guests join with a private code, add their photos, and enjoy the
            moments everyone captured together.
          </p>
        </div>

        <Card className="w-full shadow-xs">
          <CardHeader>
            <CardTitle className="text-xl">Join a gallery</CardTitle>
            <CardDescription>
              No account needed. Use the private code from your invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GuestAccessForm />
          </CardContent>
        </Card>
      </section>

      <footer className="border-t pt-6 text-sm text-muted-foreground">
        Private galleries. No guest account required.
      </footer>
    </main>
  );
}
