import { z } from "zod";
import { createGoal } from "@/lib/server/dashboard";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reach_score"), dimensionId: z.string(), target: z.number().min(0.05).max(0.95), deadlineDays: z.number().int().min(3).max(90).default(14) }),
  z.object({ kind: z.literal("consistency"), target: z.number().int().min(1).max(14), deadlineDays: z.number().int().min(3).max(90).default(14) }),
]);

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Invalid goal.");
  return Response.json(await createGoal(user.id, parsed.data));
});
