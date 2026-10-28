import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { huntAnswer, persuaderArgue, persuaderFinal, startHuntRound, startPersuaderRound } from "@/lib/server/aiLab";
import { handle, requireUser } from "@/lib/server/user";

const id = z.string().uuid();
const side = z.union([z.literal(0), z.literal(1)]);

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("persuader_start"), gameId: id.optional() }),
  z.object({ action: z.literal("persuader_commit"), roundId: id, initial: side, sure: z.boolean() }),
  z.object({ action: z.literal("persuader_final"), roundId: id, final: side }),
  z.object({ action: z.literal("hunt_start"), gameId: id.optional() }),
  z.object({ action: z.literal("hunt_answer"), roundId: id, pick: z.number().int().min(0).max(3), wager: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
]);

/** AI Lab games, one step per call. The answer key never leaves the server before the player commits. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson(req, body, { maxBytes: 1024 });
  const result =
    b.action === "persuader_start" ? await startPersuaderRound(user.id, b.gameId)
    : b.action === "persuader_commit" ? await persuaderArgue(user.id, b.roundId, b.initial, b.sure)
    : b.action === "persuader_final" ? await persuaderFinal(user.id, b.roundId, b.final)
    : b.action === "hunt_start" ? await startHuntRound(user.id, b.gameId)
    : await huntAnswer(user.id, b.roundId, b.pick, b.wager);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
});
