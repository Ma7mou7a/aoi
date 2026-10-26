import { redirect } from "next/navigation";
import { PlaySession } from "@/components/PlaySession";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  if (!(await getCurrentUser())) redirect("/");
  return <PlaySession mode="assessment" />;
}
