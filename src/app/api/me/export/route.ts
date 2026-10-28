import { logSecurityEvent } from "@/lib/server/audit";
import { exportUserData } from "@/lib/server/privacy";
import { handle, requireUser } from "@/lib/server/user";

/** Download everything stored about the user as JSON, decrypted for them. */
export const GET = handle(async () => {
  const user = await requireUser();
  await logSecurityEvent(user.id, "data_exported", {});
  const data = await exportUserData(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="ai4brain-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
