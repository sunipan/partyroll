import type { MetadataRoute } from "next";

import {
  BRAND_COLORS,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/site-metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Private party photo galleries`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND_COLORS.paper,
    theme_color: BRAND_COLORS.paper,
    icons: [
      {
        src: "/app-icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/app-icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
