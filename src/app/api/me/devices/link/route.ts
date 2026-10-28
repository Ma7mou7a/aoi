import { headers } from "next/headers";
import { expectedOrigin } from "@/lib/security/web";
import { logSecurityEvent } from "@/lib/server/audit";
import { createDeviceLink, qrSvg } from "@/lib/server/deviceLink";
import { handle, requireUser } from "@/lib/server/user";

/**
 * Make a one-time link (as a QR code) and a short code that sign another device in to this profile.
 * The token rides in the URL fragment (#…), which browsers never send to a server or in a Referer.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { token, code, expiresAt } = await createDeviceLink(user.id);
  const url = `${expectedOrigin(await headers(), req.url)}/link#${token}`;
  await logSecurityEvent(user.id, "device_link_created", {});
  return Response.json({ url, code, expiresAt: expiresAt.toISOString(), qrSvg: qrSvg(url) }, { headers: { "cache-control": "no-store" } });
});
