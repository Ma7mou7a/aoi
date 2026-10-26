import { z } from "zod";
import { getCollabView, handleClaimFeedback } from "@/lib/server/collab";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const body = z.object({
  messageId: z.string().uuid(),
  claimIndex: z.number().int().nonnegative(),
  action: z.enum(["opened_evidence", "looks_right", "something_off"]),
});

/** The user's reaction to a coach claim: feeds critical verification and resolves planted errors. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.message);
  const { message } = await handleClaimFeedback(user.id, parsed.data.messageId, parsed.data.claimIndex, parsed.data.action);
  return Response.json({ message, collab: await getCollabView(user.id) });
});
