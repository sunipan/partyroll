import type { ComponentPropsWithoutRef } from "react";

import { PARTYROLL_MARK_PATH } from "@/lib/partyroll-mark";
import { cn } from "@/lib/utils";

type MarkSvgProps = Omit<
  ComponentPropsWithoutRef<"svg">,
  "aria-hidden" | "aria-label" | "children" | "color" | "role"
>;

type PartyrollMarkProps = MarkSvgProps &
  (
    | { decorative?: true; label?: never }
    | { decorative: false; label: string }
  );

export function PartyrollMark({
  className,
  decorative = true,
  label,
  style,
  ...props
}: PartyrollMarkProps) {
  const accessibilityProps = decorative
    ? { "aria-hidden": true as const }
    : { "aria-label": label, role: "img" as const };

  return (
    <svg
      {...props}
      {...accessibilityProps}
      className={cn("size-10 shrink-0", className)}
      fill="none"
      focusable="false"
      style={{ ...style, fill: "var(--brand-evergreen)" }}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={PARTYROLL_MARK_PATH}
        fillRule="evenodd"
      />
    </svg>
  );
}

type PartyrollWordmarkProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children" | "color"
>;

export function PartyrollWordmark({
  className,
  style,
  ...props
}: PartyrollWordmarkProps) {
  return (
    <span
      {...props}
      className={cn(
        "font-heading text-[1.35rem] leading-none font-semibold tracking-[-0.035em]",
        className,
      )}
      style={{ ...style, color: "var(--brand-evergreen)" }}
    >
      Partyroll
    </span>
  );
}

export function PartyrollBrand({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...props}
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <PartyrollMark />
      <PartyrollWordmark />
    </span>
  );
}
