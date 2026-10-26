import { exportUserData } from "@/lib/server/privacy";
import { handle, requireUser } from "@/lib/server/user";

/** Download everything stored about the user as JSON. */
export const GET = handle(async () => {
  const user = await requireUser();
  const data = await exportUserData(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="ai4brain-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
