import path from "node:path";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { db } from "@/db";

let ready: Promise<void> | null = null;

/** Apply every Drizzle migration to the in-memory test database (once per test file). */
export function migrateTestDb() {
  ready ??= migrate(db as unknown as PgliteDatabase, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  return ready;
}
