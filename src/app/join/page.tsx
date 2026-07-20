import Link from "next/link";

import { PartyrollBrand } from "@/components/brand/partyroll-brand";
import { JoinExchange } from "@/components/guest/join-exchange";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Join gallery | Partyroll",
  robots: { index: false, follow: false },
};

export default function JoinPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-28 right-[8%] -z-10 hidden sm:block"
      >
        <svg
          className="size-8 text-apricot"
          fill="none"
          focusable="false"
          viewBox="0 0 40 40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M20 1c1.5 13.5 5.5 17.5 19 19-13.5 1.5-17.5 5.5-19 19C18.5 25.5 14.5 21.5 1 20 14.5 18.5 18.5 14.5 20 1Z" fill="currentColor" />
        </svg>
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-7 sm:px-6 sm:py-11">
        <Link
          href="/"
          className="mx-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Partyroll home"
        >
          <PartyrollBrand />
        </Link>

        <div className="flex flex-1 items-center py-10 sm:py-14">
          <Card className="w-full border-primary/15 py-0">
            <div
              aria-hidden="true"
              className="mx-auto h-1 w-20 rounded-b-full bg-marigold"
            />
            <CardContent className="px-6 py-10 sm:px-10 sm:py-14">
              <p className="mb-5 text-center text-xs font-bold tracking-[0.18em] text-primary uppercase">
                Private invitation
              </p>
              <JoinExchange />
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Private galleries. No guest account required.
        </p>
      </div>
    </main>
  );
}
