import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { PartyrollBrand } from "@/components/brand/partyroll-brand";

export function AdminHeader() {
  return (
    <header
      className="flex items-center justify-between gap-5 border-b border-primary/15 pb-5"
      aria-label="Partyroll administration"
    >
      <Link
        href="/"
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Partyroll home"
      >
        <PartyrollBrand />
      </Link>
      <nav aria-label="Account">
        <UserButton />
      </nav>
    </header>
  );
}
