import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { setRunContext } from "@/lib/server/scenarios";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const body = z.object({ context: z.enum(["rushing", "distracted", "testing", "fine"]) });

/** The player's own account of a game flagged as uncertain ("I was rushing", "distracted", ...). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Game not found");
  const b = await readJson(req, body, { maxBytes: 256 });
  return Response.json(await setRunContext(user.id, id, b.context));
});
