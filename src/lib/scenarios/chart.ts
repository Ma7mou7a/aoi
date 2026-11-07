import type { RankedSkill } from "../selector";
import type { FanPoint, TrackRecord } from "./certainty";

/** Data for the small chart drawn inside a coach message (no images: rendered from these numbers). */
export type CoachChart =
  | {
      kind: "fan";
      skillName: string;
      color: string;
      horizonDays: number;
      points: FanPoint[];
      track: TrackRecord | null;
    }
  | {
      kind: "decision";
      chosen: string;
      runnerUp?: string;
      ranking: RankedSkill[];
      /** What the ranking score means, e.g. "estimate %" or "band points it would remove". */
      scoreLabel: string;
      /** The chosen skill's recent game scores (oldest first), the progress curve behind the choice. */
      series: Array<{ pct: number; level: number; flagged: boolean }>;
      color: string;
      /** Practice heatmap (games per skill per day, last 7 days), cited by the "Why" audit. */
      heatmap?: Array<{ skill: string; name: string; days: number[]; activeDays: number }>;
    }
  | {
      kind: "plateau";
      skillName: string;
      color: string;
      plateau: boolean;
      /** Last ordinary games, oldest first: the game score and the Brain Twin estimate right after it. */
      series: Array<{ pct: number; twin: number | null; level: number; flagged: boolean }>;
      /** Strategy memory: every strategy tried on a plateau, with its own experiment result. */
      tried: Array<{ name: string; diffPts: number; lowPts: number; highPts: number; verdict: "helped" | "hurt" | "unclear" }>;
    }
  | {
      kind: "reweigh";
      skillName: string;
      color: string;
      before: { pct: number; low: number; high: number };
      after: { pct: number; low: number; high: number };
      collab: { before: number; after: number };
    };

export type Scenario = "why" | "dispute" | "fortune" | "rush" | "plateau" | "asymmetry";
