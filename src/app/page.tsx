import { SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { PartyrollBrand } from "@/components/brand/partyroll-brand";
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
    <main className="relative isolate min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <svg
          className="absolute top-28 -right-20 hidden h-44 w-96 text-marigold opacity-90 sm:block lg:top-32 lg:right-0"
          fill="none"
          focusable="false"
          viewBox="0 0 384 176"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 134C86 62 180 53 291 74"
            stroke="currentColor"
            strokeLinecap="square"
            strokeWidth="18"
          />
          <path d="m285 65 35 13-24 25-28-22 17-16Z" fill="#f0a47b" />
          <path d="m296 103 24-25 14 31-38-6Z" fill="#c9825f" />
        </svg>

        <svg
          className="absolute top-40 left-[7%] size-7 text-apricot sm:top-[45%] sm:left-[3%] sm:size-9"
          fill="none"
          focusable="false"
          viewBox="0 0 40 40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M20 1c1.5 13.5 5.5 17.5 19 19-13.5 1.5-17.5 5.5-19 19C18.5 25.5 14.5 21.5 1 20 14.5 18.5 18.5 14.5 20 1Z" fill="currentColor" />
        </svg>

        <span className="absolute top-28 left-[72%] size-2.5 rounded-full bg-evergreen/75 sm:top-[38%] sm:left-[8%]" />
        <span className="absolute right-[6%] bottom-[18%] size-3 rounded-full bg-marigold sm:right-[12%]" />
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-12">
        <header
          className="motion-entrance flex items-center justify-between gap-5 [--motion-delay:40ms]"
          aria-label="Partyroll"
        >
          <Link
            href="/"
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <PartyrollBrand />
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

        <section className="grid flex-1 items-center gap-14 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,25rem)] lg:gap-20 lg:py-24">
          <div className="relative max-w-3xl">
            <p className="motion-entrance mb-5 flex items-center gap-3 text-xs font-bold tracking-[0.2em] text-primary uppercase [--motion-delay:110ms] sm:text-sm">
              <span aria-hidden="true" className="h-px w-8 bg-marigold" />
              Private party galleries
            </p>
            <h1 className="motion-entrance max-w-3xl text-[2.9rem] leading-[0.98] font-semibold tracking-[-0.045em] text-balance [--motion-delay:170ms] sm:text-6xl lg:text-7xl">
              Pass the camera. Keep the whole party.
            </h1>
            <p className="motion-entrance mt-7 max-w-xl text-lg leading-8 text-muted-foreground [--motion-delay:230ms] sm:text-xl sm:leading-9">
              Guests join with a private code, add their photos, and enjoy the
              moments everyone captured together.
            </p>
            <p className="motion-entrance mt-7 font-heading text-base font-semibold text-primary [--motion-delay:290ms] sm:text-lg">
              One private roll, made by everyone there.
            </p>
          </div>

          <div className="motion-entrance relative [--motion-delay:330ms]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-[7.6rem] -left-2 z-10 size-4 rounded-full border border-border bg-paper"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-[7.6rem] -right-2 z-10 size-4 rounded-full border border-border bg-paper"
            />
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute -top-5 -right-4 z-10 size-10 rotate-6 text-marigold sm:-right-6"
              fill="none"
              focusable="false"
              viewBox="0 0 40 40"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M20 1c1.5 13.5 5.5 17.5 19 19-13.5 1.5-17.5 5.5-19 19C18.5 25.5 14.5 21.5 1 20 14.5 18.5 18.5 14.5 20 1Z" fill="currentColor" />
            </svg>

            <Card className="motion-interactive motion-lift w-full border-primary/20 py-5 shadow-[0_1px_1px_rgb(34_55_46/0.06),0_26px_60px_-32px_rgb(34_55_46/0.55)] [--card-spacing:--spacing(6)] sm:py-6">
              <CardHeader className="border-b border-dashed border-border pb-5">
                <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
                  Your invitation
                </p>
                <CardTitle>
                  <h2 className="text-2xl leading-tight">Join a gallery</h2>
                </CardTitle>
                <CardDescription className="leading-6">
                  No account needed. Use the private code from your invitation.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1">
                <GuestAccessForm />
              </CardContent>
            </Card>
          </div>
        </section>

        <footer className="motion-entrance flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm text-muted-foreground [--motion-delay:390ms]">
          <span>Private galleries. No guest account required.</span>
          <span aria-hidden="true" className="font-heading text-primary/75">
            Made for the moments between poses.
          </span>
        </footer>
      </div>
    </main>
  );
}
