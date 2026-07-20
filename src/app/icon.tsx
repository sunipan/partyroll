import { createPartyrollIcon } from "@/lib/brand-images";

export const size = { height: 32, width: 32 };
export const contentType = "image/png";

export default function Icon() {
  return createPartyrollIcon(size.width);
}
