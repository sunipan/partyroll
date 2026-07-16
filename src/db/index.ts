import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  partyrollPostgres?: ReturnType<typeof postgres>;
};

const client =
  globalForDatabase.partyrollPostgres ??
  postgres(env.DATABASE_URL, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
  });

if (env.NODE_ENV !== "production") {
  globalForDatabase.partyrollPostgres = client;
}

export const db = drizzle(client, { schema });
