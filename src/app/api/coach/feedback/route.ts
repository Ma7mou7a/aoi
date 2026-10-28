import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { getCollabView, handleClaimFeedback } from "@/lib/server/collab";
import { handle, requireUser } from "@/lib/server/user";

const body = z.object({
  messageId: z.string().uuid(),
  claimIndex: z.number().int().nonnegative().max(50),
  action: z.enum(["opened_evidence", "looks_right", "something_off"]),
});

/** The user's reaction to a coach claim: feeds critical verification and resolves planted errors. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson(req, body, { maxBytes: 1024 });
  const { message } = await handleClaimFeedback(user.id, b.messageId, b.claimIndex, b.action);
  return Response.json({ message, collab: await getCollabView(user.id) });
});
