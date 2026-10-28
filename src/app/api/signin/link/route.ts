import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { loadUser } from "@/lib/server/accounts";
import { guardAttempt } from "@/lib/server/attempts";
import { redeemDeviceLink } from "@/lib/server/deviceLink";
import { handle, HttpError, startSession } from "@/lib/server/user";

const body = z.union([z.object({ token: z.string().min(20).max(128) }).strict(), z.object({ code: z.string().min(1).max(32) }).strict()]);

/** Sign this device in with a QR link token or the short code shown on a signed-in device. */
export const POST = handle(async (req: Request) => {
  const attempt = await guardAttempt();
  const input = await readJson(req, body, { maxBytes: 512, message: "Scan the QR code again, or type the 10-character code." });
  const userId = await redeemDeviceLink(input);
  const user = userId ? await loadUser(userId) : null;
  if (!user) {
    attempt.fail();
    throw new HttpError(401, "That code has expired or was already used. Make a new one on your other device.");
  }
  attempt.succeed();
  await startSession(user.id, "device_link");
  return Response.json({ displayName: user.displayName });
});
