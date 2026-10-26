import { z } from "zod";
import { db, schema } from "@/db";
import { nextBlock } from "@/lib/server/blocks";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const body = z.object({
  mode: z.enum(["assessment", "training"]),
  device: z
    .object({
      type: z.enum(["desktop", "tablet", "phone"]),
      input: z.enum(["keyboard", "mouse", "touch"]),
      screen: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

/** Start a session (always non-biometric) and return its first block. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.message);

  const [session] = await db
    .insert(schema.sessions)
    .values({ userId: user.id, mode: parsed.data.mode, device: parsed.data.device, biometric: false })
    .returning();
  return Response.json({ sessionId: session.id, next: await nextBlock(user.id, session.id, parsed.data.mode) });
});
