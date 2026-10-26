import { z } from "zod";
import { generateCoachMessage, listCoachMessages } from "@/lib/server/coach";
import { handle, HttpError, requireUser } from "@/lib/server/user";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ messages: await listCoachMessages(user.id) });
});

const body = z.object({ question: z.string().trim().min(1).max(500).optional() });

/** Ask the coach: no question = debrief of the latest session. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Questions must be 1–500 characters.");
  await generateCoachMessage(user.id, parsed.data.question);
  return Response.json({ messages: await listCoachMessages(user.id) });
});
