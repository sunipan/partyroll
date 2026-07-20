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
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-8 sm:py-12">
      <Link
        href="/"
        className="mx-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Partyroll home"
      >
        <PartyrollBrand />
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
