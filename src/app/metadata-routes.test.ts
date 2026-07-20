import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://partyroll.iloveyoureneebaker.com" },
}));

const APP_URL = "https://partyroll.iloveyoureneebaker.com";

import { GET as getAppIcon } from "@/app/app-icon/route";
import AppleIcon, {
  contentType as appleIconContentType,
  size as appleIconSize,
} from "@/app/apple-icon";
import Icon, {
  contentType as iconContentType,
  size as iconSize,
} from "@/app/icon";
import manifest from "@/app/manifest";
import OpenGraphImage, {
  alt as openGraphAlt,
  contentType as openGraphContentType,
  size as openGraphSize,
} from "@/app/opengraph-image";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import TwitterImage, {
  alt as twitterAlt,
  contentType as twitterContentType,
  size as twitterSize,
} from "@/app/twitter-image";
import {
  BRAND_COLORS,
  createRootMetadata,
  privateMetadata,
  SITE_DESCRIPTION,
  SITE_TITLE,
  viewport,
} from "@/lib/site-metadata";

async function expectPngDimensions(
  response: Response,
  expected: { height: number; width: number },
) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");

  const imageMetadata = await sharp(await response.arrayBuffer()).metadata();
  expect(imageMetadata.format).toBe("png");
  expect(imageMetadata.width).toBe(expected.width);
  expect(imageMetadata.height).toBe(expected.height);
}

describe("public metadata", () => {
  it("uses the canonical production base and indexable homepage metadata", () => {
    const metadata = createRootMetadata(APP_URL);

    expect(metadata.metadataBase).toEqual(new URL(APP_URL));
    expect(metadata.alternates).toEqual({ canonical: "/" });
    expect(metadata.title).toMatchObject({ default: SITE_TITLE });
    expect(metadata.description).toBe(SITE_DESCRIPTION);
    expect(metadata.openGraph).toMatchObject({
      title: SITE_TITLE,
      type: "website",
      url: "/",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.robots).toEqual({ follow: true, index: true });
    expect(viewport).toEqual({
      colorScheme: "light",
      initialScale: 1,
      themeColor: BRAND_COLORS.paper,
      width: "device-width",
    });
  });

  it("keeps private route metadata generic and non-indexable", () => {
    expect(privateMetadata.alternates).toEqual({ canonical: null });
    expect(privateMetadata.robots).toMatchObject({
      follow: false,
      index: false,
      googleBot: { follow: false, index: false, noimageindex: true },
    });
    expect(JSON.stringify(privateMetadata)).not.toMatch(/slug|access code|media/i);
  });
});

describe("metadata routes", () => {
  it("publishes a standalone manifest with stable branded icons", () => {
    expect(manifest()).toMatchObject({
      short_name: "Partyroll",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: BRAND_COLORS.paper,
      theme_color: BRAND_COLORS.paper,
      icons: [
        { src: "/app-icon?size=192", sizes: "192x192", type: "image/png" },
        { src: "/app-icon?size=512", sizes: "512x512", type: "image/png" },
      ],
    });
  });

  it("allows the homepage and excludes all private route families", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/join", "/g/"],
      },
      sitemap: new URL("/sitemap.xml", APP_URL).href,
    });
  });

  it("includes only the public homepage in the sitemap", () => {
    expect(sitemap()).toEqual([
      {
        url: new URL("/", APP_URL).href,
        changeFrequency: "monthly",
        priority: 1,
      },
    ]);
  });

  it("renders browser, Apple, and install icons at declared sizes", async () => {
    expect(iconContentType).toBe("image/png");
    expect(appleIconContentType).toBe("image/png");
    await expectPngDimensions(Icon(), iconSize);
    await expectPngDimensions(AppleIcon(), appleIconSize);
    await expectPngDimensions(
      getAppIcon(new Request("https://partyroll.example/app-icon?size=192")),
      { height: 192, width: 192 },
    );
    await expectPngDimensions(
      getAppIcon(new Request("https://partyroll.example/app-icon?size=512")),
      { height: 512, width: 512 },
    );
    expect(
      getAppIcon(new Request("https://partyroll.example/app-icon?size=64")).status,
    ).toBe(404);
  });

  it("renders generic Open Graph and Twitter images", async () => {
    expect(openGraphAlt).toBe(twitterAlt);
    expect(openGraphContentType).toBe("image/png");
    expect(twitterContentType).toBe("image/png");
    expect(openGraphSize).toEqual(twitterSize);
    await expectPngDimensions(OpenGraphImage(), openGraphSize);
    await expectPngDimensions(TwitterImage(), twitterSize);
  });
});
