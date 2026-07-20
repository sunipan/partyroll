import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { PartyrollBrand } from "@/components/brand/partyroll-brand";

export function AdminHeader() {
  return (
    <header className="flex items-center justify-between gap-6">
      <Link
        href="/"
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Partyroll home"
      >
        <PartyrollBrand />
      </Link>
      <UserButton />
    </header>
  );
}
