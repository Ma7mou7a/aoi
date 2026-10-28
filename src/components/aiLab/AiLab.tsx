"use client";

import { useState } from "react";
import { HuntGame } from "./HuntGame";
import { PersuaderGame } from "./PersuaderGame";

type Pick = "persuader" | "hunt" | null;

const GAMES = [
  {
    id: "persuader" as const,
    name: "Resist the Persuader",
    pitch: "Answer a surprising question. Then a real AI argues with you, sometimes for the truth, sometimes against it. Hold firm or change your mind?",
    science: "Inoculation research: practising against manipulation makes people better at spotting it (Roozenbeek & van der Linden, 2019). AI can now out-argue people in debates (Salvi et al., 2025).",
  },
  {
    id: "hunt" as const,
    name: "Fabrication Hunt",
    pitch: "A real AI writes four confident sentences. Three are true; one it made up. Find the fake and bet on how sure you are.",
    science: "AI “hallucinations” sound just as fluent as facts. Betting on your answer measures whether you know when you're right (post-decision wagering, Persaud et al., 2007).",
  },
];

/** The AI Lab hub: choose a game, play it, come back. */
export function AiLab() {
  const [game, setGame] = useState<Pick>(null);
  if (game === "persuader") return <PersuaderGame onExit={() => setGame(null)} />;
  if (game === "hunt") return <HuntGame onExit={() => setGame(null)} />;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {GAMES.map((g) => (
        <div key={g.id} className="glass flex flex-col gap-3 rounded-2xl p-5">
          <h2 className="text-2xl">{g.name}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{g.pitch}</p>
          <p className="text-xs text-slate-500">{g.science}</p>
          <button type="button" onClick={() => setGame(g.id)} className="mt-auto rounded-xl bg-brand py-3 font-medium text-white dark:text-slate-950">Play</button>
        </div>
      ))}
    </div>
  );
}
