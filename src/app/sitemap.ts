import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/", env.APP_URL).href,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
