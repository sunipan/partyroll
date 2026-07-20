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
      <div className="mx-auto max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">
            Invitation unavailable
          </h1>
          <p role="alert" className="mt-4 leading-7 text-muted-foreground">
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
    <div
      className="mx-auto max-w-sm text-center"
      role="status"
      aria-live="polite"
    >
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent">
        <LoaderCircle
          aria-hidden="true"
          className="size-7 text-primary motion-safe:animate-spin"
        />
      </span>
      <h1 className="mt-6 text-3xl leading-tight font-semibold tracking-tight">
        Opening your gallery
      </h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        Checking your private invitation.
      </p>
    </div>
  );
}
