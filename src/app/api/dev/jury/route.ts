import { createPersona, PERSONAS, type Persona } from "@/lib/server/jury";
import { startSession } from "@/lib/server/user";

/**
 * Development only: create a fresh jury persona, sign in as it and open the page where its scenario
 * starts. GET /api/dev/jury?persona=masher|plateau|skeptic|asymmetric. 404 in production builds.
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const persona = new URL(req.url).searchParams.get("persona") ?? "";
  if (!(persona in PERSONAS)) return new Response("Unknown persona", { status: 400 });
  const { userId, landing } = await createPersona(persona as Persona);
  await startSession(userId, "dev");
  return Response.redirect(new URL(landing, req.url), 302);
}
