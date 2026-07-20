"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitGuestAccessCode } from "@/lib/guest-access/client";

export function GuestAccessForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await submitGuestAccessCode(code);
    if (result.ok) {
      window.location.assign(result.galleryPath);
      return;
    }

    setError(result.message);
    setIsPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gallery-code">Gallery code</Label>
        <Input
          id="gallery-code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="RENEE-SEBI-K7M4Q9"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          required
          aria-describedby={error ? "gallery-code-error" : "gallery-code-help"}
          aria-invalid={Boolean(error)}
          className="h-11 font-mono tracking-wide uppercase"
        />
        <p id="gallery-code-help" className="text-sm text-muted-foreground">
          Enter the private code shared by your host.
        </p>
      </div>

      {error ? (
        <p
          id="gallery-code-error"
          role="alert"
          className="text-sm font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            Opening gallery
          </>
        ) : (
          "Open gallery"
        )}
      </Button>
    </form>
  );
}
