import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { generateSigninKey, hashSigninKey, normaliseSigninKey } from "@/lib/signinKey";
import { handle, requireUser } from "@/lib/server/user";

/** Create (or replace) this profile's sign-in key. The key is returned once; only its hash is stored. */
export const POST = handle(async () => {
  const user = await requireUser();
  const key = generateSigninKey();
  await db.update(schema.users).set({ signinKeyHash: hashSigninKey(normaliseSigninKey(key)!) }).where(eq(schema.users.id, user.id));
  return Response.json({ key });
});
