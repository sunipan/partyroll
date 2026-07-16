import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AdminHeader() {
  return (
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
  );
}
