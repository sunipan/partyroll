import Link from "next/link";

import { JoinExchange } from "@/components/guest/join-exchange";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Join gallery | Partyroll",
  robots: { index: false, follow: false },
};

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-8 sm:py-12">
      <Link
        href="/"
        className="mx-auto flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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

      <div className="flex flex-1 items-center py-12">
        <Card className="w-full">
          <CardContent className="py-8 sm:py-12">
            <JoinExchange />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
