"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { submitGuestAccessCode } from "@/lib/guest-access/client";

export function JoinExchange() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const code = window.location.hash.slice(1);
    window.history.replaceState(null, "", "/join");

    void Promise.resolve().then(async () => {
      if (!code) {
        setError("This invitation is missing its gallery code.");
        return;
      }

      const result = await submitGuestAccessCode(code);
      if (result.ok) {
        window.location.replace(result.galleryPath);
        return;
      }

      setError(result.message);
    });
  }, []);

  if (error) {
    return (
      <div className="space-y-5 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Invitation unavailable
          </h1>
          <p role="alert" className="mt-3 leading-7 text-muted-foreground">
            {error}
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Enter a gallery code
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center" role="status" aria-live="polite">
      <LoaderCircle
        aria-hidden="true"
        className="mx-auto size-8 animate-spin text-primary"
      />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Opening your gallery
      </h1>
      <p className="mt-2 text-muted-foreground">
        Checking your private invitation.
      </p>
    </div>
  );
}
