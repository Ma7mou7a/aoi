import { redirect } from "next/navigation";
import { PlaySession } from "@/components/PlaySession";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ mode?: string; focus?: string }> }) {
  if (!(await getCurrentUser())) redirect("/");
  const { mode: m, focus } = await searchParams;
  const mode = m === "training" ? "training" : "assessment";
  return <PlaySession key={`${mode}:${focus ?? ""}`} mode={mode} focus={focus} />;
}
