import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { generateCoachMessage, getCoachState, listCoachMessages } from "@/lib/server/coach";
import { getCollabView } from "@/lib/server/collab";
import { handle, requireUser } from "@/lib/server/user";

const view = async (userId: string) => ({ messages: await listCoachMessages(userId), collab: await getCollabView(userId), ...(await getCoachState(userId)) });

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json(await view(user.id));
});

const body = z.object({
  question: z.string().trim().min(1).max(500).optional(),
  /** Self-prediction before a debrief (autonomy signal). */
  prediction: z.enum(["better", "same", "worse", "skip"]).optional(),
  /** A "What if I play N×/week?" button. */
  forecast: z.object({ skill: z.string().max(64), gamesPerWeek: z.union([z.literal(2), z.literal(4), z.literal(7)]) }).optional(),
  /** The answer to Bao's in-chat AI consent question. */
  consent: z.boolean().optional(),
});

/** Ask the coach: no question = debrief of the latest session. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson(req, body, { maxBytes: 4096, message: "Questions must be 1–500 characters." });
  await generateCoachMessage(user.id, b);
  return Response.json(await view(user.id));
});
