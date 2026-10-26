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
  // Both drivers expose the same query builder; the cast only unifies the result-type generics.
  return drizzlePglite(new PGlite(process.env.PGLITE_DIR ?? "./.pglite"), { schema }) as unknown as DB;
}

// Reuse one connection across Next.js dev hot reloads.
const g = globalThis as unknown as { __ai4brainDb?: DB };
export const db = (g.__ai4brainDb ??= createDb());
export { schema };
