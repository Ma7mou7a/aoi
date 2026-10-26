import { z } from "zod";
import { db, schema } from "@/db";
import { EDITABLE_CONSENTS, getConsentState } from "@/lib/server/privacy";
import { handle, HttpError, POLICY_VERSION, requireUser } from "@/lib/server/user";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json(await getConsentState(user.id));
});

const body = z.object({ kind: z.enum(EDITABLE_CONSENTS), granted: z.boolean() });

/** Change one consent. Append-only: the new row becomes current, older rows stay as the audit trail. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "This consent can't be changed here.");
  await db.insert(schema.consents).values({ userId: user.id, kind: parsed.data.kind, granted: parsed.data.granted, policyVersion: POLICY_VERSION });
  return Response.json(await getConsentState(user.id));
});
