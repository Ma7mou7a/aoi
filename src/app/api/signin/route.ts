import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { normaliseSigninKey } from "@/lib/signinKey";
import { findUserBySigninKey } from "@/lib/server/accounts";
import { guardAttempt } from "@/lib/server/attempts";
import { handle, HttpError, startSession } from "@/lib/server/user";

const body = z.object({ key: z.string().max(64) });

/**
 * Sign in on this browser with a sign-in key. Keys have 80 random bits, so guessing is hopeless anyway;
 * the rate limit (progressive delay, then a 15-minute lockout per address) is belt and braces.
 */
export const POST = handle(async (req: Request) => {
  const attempt = await guardAttempt();
  const parsed = await readJson(req, body, { maxBytes: 1024, message: "A sign-in key has 16 letters and digits, like K7QM-2XRP-9TFD-W4HN." });
  const key = normaliseSigninKey(parsed.key);
  if (!key) throw new HttpError(400, "A sign-in key has 16 letters and digits, like K7QM-2XRP-9TFD-W4HN.");
  const user = await findUserBySigninKey(key);
  if (!user) {
    attempt.fail();
    throw new HttpError(401, "That key doesn't match a profile. Check it and try again.");
  }
  attempt.succeed();
  await startSession(user.id, "key");
  return Response.json({ displayName: user.displayName });
});
