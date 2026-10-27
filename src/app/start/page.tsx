import { notFound } from "next/navigation";
import { FirstGame } from "@/components/FirstGame";
import { getDimensions } from "@/lib/dimensions/loader";

export const metadata = { title: "Your first game · AI4Brain" };

/** The 60-second first game: Corsi blocks at level 2, before any signup. */
export default function StartPage() {
  const dim = getDimensions().find((d) => d.id === "visuospatial_memory");
  if (!dim) notFound();
  return <FirstGame dim={dim} taskId={dim.tasks[0].id} />;
}
