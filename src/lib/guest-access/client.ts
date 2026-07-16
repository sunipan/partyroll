export type GuestAccessResult =
  | { ok: true; galleryPath: string }
  | { ok: false; message: string };

const GENERIC_ERROR = "That gallery code is invalid or unavailable.";

export async function submitGuestAccessCode(
  code: string,
): Promise<GuestAccessResult> {
  try {
    const response = await fetch("/api/guest/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      return {
        ok: false,
        message:
          response.status === 429
            ? "Too many attempts. Please wait and try again."
            : GENERIC_ERROR,
      };
    }

    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("galleryPath" in data) ||
      typeof data.galleryPath !== "string" ||
      !data.galleryPath.startsWith("/g/")
    ) {
      return { ok: false, message: GENERIC_ERROR };
    }

    return { ok: true, galleryPath: data.galleryPath };
  } catch {
    return {
      ok: false,
      message: "Partyroll could not connect. Check your connection and try again.",
    };
  }
}
