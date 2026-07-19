import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/galleries/queries", () => ({
  createGalleryForOwner: vi.fn(),
  regenerateGalleryAccessForOwner: vi.fn(),
  updateGalleryStatusForOwner: vi.fn(),
}));
vi.mock("@/lib/uploads/media", () => ({
  deleteReadyMediaForOwner: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

import { deleteGalleryMediaAction } from "./actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteReadyMediaForOwner } from "@/lib/uploads/media";

describe("deleteGalleryMediaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "owner-1" });
    vi.mocked(deleteReadyMediaForOwner).mockResolvedValue({
      outcome: "deleted",
      media: {} as never,
    });
  });

  it("passes the authenticated owner and scoped IDs to media deletion", async () => {
    const galleryId = randomUUID();
    const photoId = randomUUID();
    const formData = new FormData();
    formData.set("galleryId", galleryId);
    formData.set("photoId", photoId);

    await deleteGalleryMediaAction(formData);

    expect(deleteReadyMediaForOwner).toHaveBeenCalledWith({
      ownerClerkId: "owner-1",
      galleryId,
      photoId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/galleries/${galleryId}`);
  });

  it("redirects invalid input without attempting deletion", async () => {
    await expect(deleteGalleryMediaAction(new FormData())).rejects.toThrow(
      "redirect:/admin",
    );

    expect(deleteReadyMediaForOwner).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("redirects back to the gallery when media is not found", async () => {
    const galleryId = randomUUID();
    const photoId = randomUUID();
    const formData = new FormData();
    formData.set("galleryId", galleryId);
    formData.set("photoId", photoId);
    vi.mocked(deleteReadyMediaForOwner).mockResolvedValueOnce({
      outcome: "not-found",
    });

    await expect(deleteGalleryMediaAction(formData)).rejects.toThrow(
      `redirect:/admin/galleries/${galleryId}`,
    );
    expect(redirect).toHaveBeenCalledWith(`/admin/galleries/${galleryId}`);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects retryable provider failures to a safe retry message", async () => {
    const galleryId = randomUUID();
    const photoId = randomUUID();
    const formData = new FormData();
    formData.set("galleryId", galleryId);
    formData.set("photoId", photoId);
    formData.set("cursor", "page-cursor");
    vi.mocked(deleteReadyMediaForOwner).mockResolvedValueOnce({
      outcome: "retryable-error",
      media: {} as never,
      message: "Media could not be deleted. Please try again.",
    });

    await expect(deleteGalleryMediaAction(formData)).rejects.toThrow(
      `redirect:/admin/galleries/${galleryId}?deleteError=${photoId}&cursor=page-cursor`,
    );

    expect(redirect).toHaveBeenCalledWith(
      `/admin/galleries/${galleryId}?deleteError=${photoId}&cursor=page-cursor`,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
