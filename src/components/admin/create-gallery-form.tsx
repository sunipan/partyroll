"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createGalleryAction } from "@/app/admin/galleries/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialCreateGalleryFormState } from "@/lib/galleries/form-state";

export function CreateGalleryForm() {
  const [state, formAction] = useActionState(
    createGalleryAction,
    initialCreateGalleryFormState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <p
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Gallery name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={100}
          autoComplete="off"
          defaultValue={state.values.name}
          aria-invalid={Boolean(state.errors?.name)}
          aria-describedby={state.errors?.name ? "name-error" : undefined}
          placeholder="John & Cathy"
          className="h-11"
        />
        {state.errors?.name ? (
          <p id="name-error" className="text-sm text-destructive">
            {state.errors.name[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="eventDate">
          Event date <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="eventDate"
          name="eventDate"
          type="date"
          defaultValue={state.values.eventDate}
          aria-invalid={Boolean(state.errors?.eventDate)}
          aria-describedby={state.errors?.eventDate ? "event-date-error" : undefined}
          className="h-11"
        />
        {state.errors?.eventDate ? (
          <p id="event-date-error" className="text-sm text-destructive">
            {state.errors.eventDate[0]}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Creating…" : "Create gallery"}
    </Button>
  );
}
