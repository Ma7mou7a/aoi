import { closeDb } from "@/db";

/**
 * Development only: close the database cleanly, then stop the dev server.
 * PGlite only flushes to disk reliably on close, so killing the server outright can corrupt ./.pglite.
 * POST /api/dev/shutdown. Returns 404 in production builds.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  await closeDb();
  setTimeout(() => process.exit(0), 200);
  return new Response("Database closed; stopping the dev server.\n");
}
