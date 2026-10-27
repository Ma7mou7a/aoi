"use client";

import { useEffect } from "react";
import { badgeTitle } from "@/lib/rewards";
import type { EarnedReward } from "@/lib/server/rewards";
import { celebrate } from "../motion/celebrate";
import { pandaBus } from "@/lib/panda/bus";
import { announceBamboo } from "./BambooCounter";
import { BambooIcon } from "./BambooIcon";

const WHY: Record<EarnedReward["kind"], string> = {
  daily_visit: "for coming back today",
  game_completed: "for playing",
  streak_day: "for your streak",
  daily_plan_done: "for finishing your weekly plan",
  daily_challenge: "for today's challenge",
  badge: "new badge",
};

/** "+10 bamboo for playing" lines that float up once (transform/opacity only), and update the header counter. */
export function RewardFloat({ rewards }: { rewards: EarnedReward[] }) {
  useEffect(() => {
    if (!rewards.length) return;
    announceBamboo({ delta: rewards.reduce((s, r) => s + r.amount, 0) });
    if (rewards.some((r) => r.kind === "badge")) {
      pandaBus.emit({ type: "reward" });
      void celebrate();
    }
  }, [rewards]);
  if (!rewards.length) return null;
  return (
    <ul className="space-y-1" aria-label="Bamboo earned">
      {rewards.map((r, i) => (
        <li key={`${r.kind}-${r.badge ?? i}`} className="reward-float flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300" style={{ animationDelay: `${i * 120}ms` }}>
          <BambooIcon className="h-5 w-5" /> +{r.amount} bamboo {r.kind === "badge" && r.badge ? `· new badge: ${badgeTitle(r.badge)}` : WHY[r.kind]}
        </li>
      ))}
    </ul>
  );
}
