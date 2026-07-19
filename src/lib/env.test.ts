import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const validEnvironment = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_partyroll",
  CLERK_SECRET_KEY: "sk_test_partyroll",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://partyroll:partyroll@localhost:5432/partyroll",
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "test-bucket",
  INVITE_SECRET: "invite-secret-that-is-at-least-32-characters",
  GUEST_SESSION_SECRET: "guest-session-secret-at-least-32-characters",
} as const;

function stubEnvironment(nodeEnv: "development" | "production") {
  vi.stubEnv("NODE_ENV", nodeEnv);

  for (const [name, value] of Object.entries(validEnvironment)) {
    vi.stubEnv(name, value);
  }

  vi.stubEnv("CRON_SECRET", undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("server environment", () => {
  it("allows development without a cleanup secret", async () => {
    stubEnvironment("development");

    const { env } = await import("./env");

    expect(env.CRON_SECRET).toBeUndefined();
  });

  it("requires a cleanup secret in production", async () => {
    stubEnvironment("production");
    vi.stubEnv("APP_URL", "https://partyroll.example");

    await expect(import("./env")).rejects.toThrow(
      /CRON_SECRET: Required in production for authenticated cleanup/,
    );
  });
});
