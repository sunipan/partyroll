import type { Metadata } from "next";

import { privateMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = {
  ...privateMetadata,
  title: "Admin",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
