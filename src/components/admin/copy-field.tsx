"use client";

import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CopyField({
  label,
  value,
  prominent = false,
}: {
  label: string;
  value: string;
  prominent?: boolean;
}) {
  const inputId = useId();
  const statusId = useId();
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={inputId} className="text-xs font-semibold tracking-wide uppercase">
        {label}
      </Label>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          id={inputId}
          value={value}
          readOnly
          aria-describedby={statusId}
          className={
            prominent
              ? "h-9 min-w-0 bg-background font-mono text-base font-semibold tracking-[0.16em]"
              : "h-9 min-w-0 bg-background font-mono text-xs"
          }
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" size="sm" onClick={copyValue}>
          {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {status === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p id={statusId} className="min-h-4 text-xs leading-4 text-muted-foreground" aria-live="polite">
        {status === "copied"
          ? `${label} copied to the clipboard.`
          : status === "error"
            ? `Could not copy automatically. Select and copy the ${label.toLowerCase()} manually.`
            : ""}
      </p>
    </div>
  );
}
