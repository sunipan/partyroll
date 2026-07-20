import type { Metadata, Viewport } from "next";

export const SITE_NAME = "Partyroll";
export const SITE_TITLE = "Partyroll — Private party photo galleries";
export const SITE_DESCRIPTION =
  "Pass the camera. Keep the whole party in one private photo and video gallery made by everyone there.";
export const PRIVATE_DESCRIPTION =
  "A private Partyroll gallery available only to invited guests and its host.";

export const BRAND_COLORS = {
  evergreen: "#174c3c",
  paper: "#fbf6ec",
  ivory: "#fffdf8",
  apricot: "#f0a47b",
  marigold: "#e2a927",
} as const;

export const privateMetadata: Metadata = {
  alternates: { canonical: null },
  description: PRIVATE_DESCRIPTION,
  openGraph: {
    description: PRIVATE_DESCRIPTION,
    siteName: SITE_NAME,
    title: "Private gallery | Partyroll",
    type: "website",
  },
  robots: {
    follow: false,
    index: false,
    nocache: true,
    googleBot: {
      follow: false,
      index: false,
      noimageindex: true,
    },
  },
  twitter: {
    card: "summary_large_image",
    description: PRIVATE_DESCRIPTION,
    title: "Private gallery | Partyroll",
  },
};

export function createRootMetadata(appUrl: string): Metadata {
  return {
    metadataBase: new URL(appUrl),
    applicationName: SITE_NAME,
    title: {
      default: SITE_TITLE,
      template: "%s | Partyroll",
    },
    description: SITE_DESCRIPTION,
    keywords: [
      "private party photo sharing",
      "event photo gallery",
      "guest photo uploads",
    ],
    alternates: { canonical: "/" },
    manifest: "/manifest.webmanifest",
    openGraph: {
      description: SITE_DESCRIPTION,
      locale: "en_US",
      siteName: SITE_NAME,
      title: SITE_TITLE,
      type: "website",
      url: "/",
    },
    robots: {
      follow: true,
      index: true,
    },
    twitter: {
      card: "summary_large_image",
      description: SITE_DESCRIPTION,
      title: SITE_TITLE,
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  initialScale: 1,
  themeColor: BRAND_COLORS.paper,
  width: "device-width",
};
