import { createShareImage } from "@/lib/brand-images";

export const alt = "Partyroll — Pass the camera. Keep the whole party.";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

export default function TwitterImage() {
  return createShareImage();
}
