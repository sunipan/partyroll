"use client";

import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
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
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          value={value}
          readOnly
          aria-describedby={statusId}
          className="h-10 font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={copyValue}>
          {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {status === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p id={statusId} className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {status === "copied"
          ? `${label} copied to the clipboard.`
          : status === "error"
            ? `Could not copy automatically. Select and copy the ${label.toLowerCase()} manually.`
            : ""}
      </p>
    </div>
  );
}
