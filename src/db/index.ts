import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

type Conn = { db: DB; close: () => Promise<void> };

/** DATABASE_URL → real Postgres; otherwise an embedded PGlite (Postgres in WASM) under ./.pglite. */
function connect(): Conn {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    return { db: drizzlePg(pool, { schema }), close: () => pool.end() };
  }

  const dir = process.env.PGLITE_DIR ?? "./.pglite";
  const client = new PGlite(dir);
  client.waitReady.catch(() => {
    console.error(
      `\n[db] PGlite could not open ${dir}. This usually means the server was killed without a clean shutdown.\n` +
        `     Move the folder away (e.g. rename it to ${dir}.broken) and run "npm run db:migrate" to start fresh.\n`,
    );
  });
  // PGlite only flushes to disk reliably on close, so close it on Ctrl+C / termination.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => void client.close().finally(() => process.exit(0)));
  }
  // Both drivers expose the same query builder; the cast only unifies the result-type generics.
  return { db: drizzlePglite(client, { schema }) as unknown as DB, close: () => client.close() };
}

// Reuse one connection across Next.js dev hot reloads.
const g = globalThis as unknown as { __ai4brainConn?: Conn };
const conn = (g.__ai4brainConn ??= connect());
export const db = conn.db;
/** For scripts: close the connection so PGlite flushes to disk before the process ends. */
export const closeDb = conn.close;
export { schema };
