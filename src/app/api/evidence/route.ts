import { getEvidence } from "@/lib/server/coach";
import { handle, requireUser } from "@/lib/server/user";

const ids = (v: string | null) => (v ? v.split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 200) : []);

/** GET /api/evidence?runs=<ids>&trials=<ids>: the blocks and trials a coach claim cites. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  return Response.json(await getEvidence(user.id, ids(url.searchParams.get("runs")), ids(url.searchParams.get("trials"))));
});
