import { redirect } from "next/navigation";
import { PlaySession } from "@/components/PlaySession";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!(await getCurrentUser())) redirect("/");
  const mode = (await searchParams).mode === "training" ? "training" : "assessment";
  return <PlaySession key={mode} mode={mode} />;
}
