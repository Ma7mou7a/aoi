import { notFound } from "next/navigation";
import { TryTask } from "@/components/TryTask";
import { getDimensions } from "@/lib/dimensions/loader";
import { AVAILABLE_PARADIGMS } from "@/lib/tasks/registry";

export default async function TryTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const dim = getDimensions().find((d) => d.tasks.some((t) => t.id === taskId && AVAILABLE_PARADIGMS.includes(t.paradigm)));
  if (!dim) notFound();
  return <TryTask dim={dim} taskId={taskId} />;
}
