import { env } from "@/lib/env";
import { isValidCronAuthorization } from "@/lib/uploads/cleanup-auth";
import { runUploadCleanup } from "@/lib/uploads/cleanup";
import { noStoreJson } from "@/lib/uploads/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (
    !isValidCronAuthorization(
      request.headers.get("authorization"),
      env.CRON_SECRET,
    )
  ) {
    return noStoreJson({ message: "Not found." }, { status: 404 });
  }

  const result = await runUploadCleanup();

  return noStoreJson(result);
}
