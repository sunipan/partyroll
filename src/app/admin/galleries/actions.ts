"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import type { CreateGalleryFormState } from "@/lib/galleries/form-state";
import {
  createGalleryForOwner,
  regenerateGalleryAccessForOwner,
  updateGalleryStatusForOwner,
} from "@/lib/galleries/queries";
import {
  createGalleryInputSchema,
  galleryIdSchema,
  galleryStatusSchema,
} from "@/lib/galleries/rules";

export async function createGalleryAction(
  _previousState: CreateGalleryFormState,
  formData: FormData,
): Promise<CreateGalleryFormState> {
  const { userId } = await requireAdmin();
  const values = {
    name: String(formData.get("name") ?? ""),
    eventDate: String(formData.get("eventDate") ?? ""),
  };
  const result = createGalleryInputSchema.safeParse(values);

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
      message: "Check the highlighted fields and try again.",
      values,
    };
  }

  let gallery;

  try {
    gallery = await createGalleryForOwner(userId, result.data);
  } catch (error) {
    console.error("Failed to create gallery", error);
    return {
      message: "The gallery could not be created. Please try again.",
      values,
    };
  }

  redirect(`/admin/galleries/${gallery.id}`);
}

const updateStatusSchema = z.object({
  galleryId: galleryIdSchema,
  nextStatus: galleryStatusSchema,
});

export async function updateGalleryStatusAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const input = updateStatusSchema.safeParse({
    galleryId: formData.get("galleryId"),
    nextStatus: formData.get("nextStatus"),
  });

  if (!input.success) {
    redirect("/admin");
  }

  const result = await updateGalleryStatusForOwner({
    ownerClerkId: userId,
    galleryId: input.data.galleryId,
    nextStatus: input.data.nextStatus,
  });

  if (result.outcome === "not-found") {
    redirect("/admin");
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/galleries/${input.data.galleryId}`);
}

const regenerateAccessSchema = z.object({
  galleryId: galleryIdSchema,
});

export async function regenerateGalleryAccessAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const input = regenerateAccessSchema.safeParse({
    galleryId: formData.get("galleryId"),
  });

  if (!input.success) {
    redirect("/admin");
  }

  const gallery = await regenerateGalleryAccessForOwner(
    userId,
    input.data.galleryId,
  );

  if (!gallery) {
    redirect("/admin");
  }

  revalidatePath(`/admin/galleries/${input.data.galleryId}`);
}
