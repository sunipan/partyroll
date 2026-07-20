import { createPartyrollIcon } from "@/lib/brand-images";

export const size = { height: 180, width: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return createPartyrollIcon(size.width);
}
