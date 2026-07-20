import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/join", "/g/"],
    },
    sitemap: new URL("/sitemap.xml", env.APP_URL).href,
  };
}
