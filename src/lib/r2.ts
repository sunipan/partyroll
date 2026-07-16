import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

export const r2 = new S3Client({
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: "auto",
});

export const r2Bucket = env.R2_BUCKET_NAME;
