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
          aria-hidden="true"
          className="absolute inset-0 size-full fill-apricot opacity-[0.09]"
          focusable="false"
          preserveAspectRatio="none"
          viewBox="0 0 1600 1000"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M0 350C400 300 800 430 1200 470C1370 488 1490 500 1600 515C1470 530 1360 538 1200 530C800 510 420 405 0 350Z" />
        </svg>

        <span className="homepage-shape homepage-shape-square homepage-texture-checks absolute -top-5 left-[12%] size-16 [--shape-delay:-4s] [--shape-duration:18s] [--shape-rotation:-8deg] sm:top-[17%] sm:left-[2%] sm:size-24" />
        <span className="homepage-shape homepage-shape-circle homepage-texture-halftone absolute top-24 -right-8 size-24 [--shape-delay:-9s] [--shape-duration:22s] sm:top-[22%] sm:right-[4%] sm:size-32" />
        <span className="homepage-shape homepage-shape-star homepage-texture-stripes absolute top-[48%] left-[2%] hidden size-14 [--shape-delay:-6s] [--shape-duration:20s] [--shape-rotation:7deg] sm:block lg:left-[4%] lg:size-16" />
        <span className="homepage-shape homepage-shape-circle homepage-texture-paper absolute bottom-[13%] left-[8%] size-8 [--shape-delay:-12s] [--shape-duration:24s] sm:bottom-[9%] sm:left-[40%] sm:size-11" />
        <span className="homepage-shape homepage-shape-square homepage-texture-stripes absolute right-[42%] bottom-[3%] size-7 [--shape-delay:-7s] [--shape-duration:19s] [--shape-rotation:12deg] sm:right-[5%] sm:bottom-[8%] sm:size-16" />
        <span className="homepage-shape homepage-shape-star homepage-texture-paper absolute top-[39%] right-[7%] size-8 [--shape-delay:-2s] [--shape-duration:17s] [--shape-rotation:-5deg] sm:top-[58%] sm:right-[2%] sm:size-10" />
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

          <div className="motion-entrance [--motion-delay:330ms]">
            <Card className="w-full border-primary/15 py-5 shadow-[0_1px_1px_rgb(34_55_46/0.06),0_26px_60px_-32px_rgb(34_55_46/0.45)] [--card-spacing:--spacing(6)] sm:py-6">
              <CardHeader>
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
