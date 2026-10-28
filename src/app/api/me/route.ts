import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { readJson } from "@/lib/security/body";
import { deleteAccount } from "@/lib/server/accounts";
import { logSecurityEvent } from "@/lib/server/audit";
import { purgeExpired, RETENTION_OPTIONS } from "@/lib/server/privacy";
import { clearSessionCookie, handle, requireUser } from "@/lib/server/user";

const patch = z
  .object({
    retentionDays: z.number().int().refine((d) => (RETENTION_OPTIONS as readonly number[]).includes(d)).optional(),
    researchMode: z.boolean().optional(),
    highContrast: z.boolean().optional(),
  })
  .strict()
  .refine((p) => p.retentionDays !== undefined || p.researchMode !== undefined || p.highContrast !== undefined);

/** Change how long data is kept (older data is deleted right away), Research mode or high-contrast display. */
export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const { retentionDays: days, researchMode, highContrast } = await readJson(req, patch, { maxBytes: 1024, message: `Retention must be one of ${RETENTION_OPTIONS.join(", ")} days.` });
  if (researchMode !== undefined || highContrast !== undefined) {
    const preferences = { ...user.preferences, ...(researchMode !== undefined ? { researchMode } : {}), ...(highContrast !== undefined ? { highContrast } : {}) };
    await db.update(schema.users).set({ preferences }).where(eq(schema.users.id, user.id));
  }
  if (days !== undefined) {
    await db.update(schema.users).set({ retentionDays: days }).where(eq(schema.users.id, user.id));
    await purgeExpired(user.id, days);
    await logSecurityEvent(user.id, "retention_changed", { days });
  }
  return Response.json({
    retentionDays: days ?? user.retentionDays,
    researchMode: researchMode ?? !!user.preferences.researchMode,
    highContrast: highContrast ?? !!user.preferences.highContrast,
  });
});

/** One-click delete: every user-owned row goes, the data key is destroyed; only a salted hash and row counts remain. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  const { rowsDeleted } = await deleteAccount(user.id, "user_request");
  await clearSessionCookie();
  return Response.json({ deleted: true, rowsDeleted });
});
