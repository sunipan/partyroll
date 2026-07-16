import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function requireAdmin() {
  const session = await auth();

  if (!session.userId) {
    redirect("/");
  }

  return { userId: session.userId };
}
