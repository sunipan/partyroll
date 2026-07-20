import type { ComponentPropsWithoutRef } from "react";

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
        d="M9 46V14.75C9 7.7 14.7 2 21.75 2h5.5C38.7 2 48 10.86 48 21.75S38.7 41.5 27.25 41.5c-3.6 0-7.04-.9-10.05-2.56V46H9Zm8.2-31.25v14.08c2.38 3.31 6.02 5.17 10.05 5.17 7.36 0 13.25-5.47 13.25-12.25S34.61 9.5 27.25 9.5h-5.5a4.55 4.55 0 0 0-4.55 4.55v.7ZM11.85 39.4a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-.5a1 1 0 0 1-1-1v-2.5ZM23.2 4.7a1 1 0 0 1 1-1h2.9a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2.9a1 1 0 0 1-1-1v-1Zm18.15 12.05a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v2.8a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2.8ZM27.2 36.3a1 1 0 0 1 1-1h2.9a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2.9a1 1 0 0 1-1-1v-1Z"
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
