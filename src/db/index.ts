import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

/** DATABASE_URL → real Postgres; otherwise an embedded PGlite (Postgres in WASM) under ./.pglite. */
function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (url) return drizzlePg(new Pool({ connectionString: url }), { schema });

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
  return drizzlePglite(client, { schema }) as unknown as DB;
}

// Reuse one connection across Next.js dev hot reloads.
const g = globalThis as unknown as { __ai4brainDb?: DB };
export const db = (g.__ai4brainDb ??= createDb());
export { schema };
