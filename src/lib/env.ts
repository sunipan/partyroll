import "server-only";

import { z } from "zod";

const postgresUrl = z
  .url()
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "Must be a PostgreSQL connection URL",
  );

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: postgresUrl,
    R2_ACCOUNT_ID: z.string().trim().min(1),
    R2_ACCESS_KEY_ID: z.string().trim().min(1),
    R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
    R2_BUCKET_NAME: z.string().trim().min(1),
    INVITE_SECRET: z.string().min(32),
    GUEST_SESSION_SECRET: z.string().min(32),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      !value.APP_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        message: "Must use HTTPS in production",
        path: ["APP_URL"],
      });
    }

    if (value.INVITE_SECRET === value.GUEST_SESSION_SECRET) {
      context.addIssue({
        code: "custom",
        message: "Must be different from GUEST_SESSION_SECRET",
        path: ["INVITE_SECRET"],
      });
    }
  });

const result = serverEnvSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  INVITE_SECRET: process.env.INVITE_SECRET,
  GUEST_SESSION_SECRET: process.env.GUEST_SESSION_SECRET,
});

if (!result.success) {
  const messages = result.error.issues.map(
    (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
  );

  throw new Error(`Invalid server environment:\n${messages.join("\n")}`);
}

export const env = Object.freeze(result.data);
