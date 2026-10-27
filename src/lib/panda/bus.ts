/**
 * Bao's event bus: games, results and the coach emit small events; the panda decides how to react.
 * No dependency, no React: a set of listeners. `reactTo` is the pure throttle that keeps Bao from
 * reacting to every trial (and keeps him still during assessment blocks).
 */

export type PandaState = "idle" | "wave" | "watch" | "think" | "cheer" | "proud" | "oops" | "sleep" | "celebrate" | "quiet" | "calm";

export type PandaEvent =
  | { type: "trial:correct" | "trial:wrong" | "block:start" | "block:end" | "milestone" | "reward" }
  | { type: "coach:mood"; mood: PandaState };

/** "quiet" during assessment blocks (blink only), "lively" in practice. */
export type ReactMode = "quiet" | "lively";

export type ThrottleState = { trialsSinceOops: number; correctCount: number };
export const INITIAL_THROTTLE: ThrottleState = { trialsSinceOops: 5, correctCount: 0 };

const OOPS_EVERY = 5;
const CHEER_EVERY = 3;

export function reactTo(s: ThrottleState, e: PandaEvent, mode: ReactMode): { pose: PandaState | null; next: ThrottleState } {
  switch (e.type) {
    case "trial:correct": {
      const next = { correctCount: s.correctCount + 1, trialsSinceOops: s.trialsSinceOops + 1 };
      return { pose: mode === "lively" && next.correctCount % CHEER_EVERY === 0 ? "cheer" : null, next };
    }
    case "trial:wrong":
      if (mode === "lively" && s.trialsSinceOops >= OOPS_EVERY) return { pose: "oops", next: { ...s, trialsSinceOops: 1 } };
      return { pose: null, next: { ...s, trialsSinceOops: s.trialsSinceOops + 1 } };
    case "milestone":
    case "reward":
      return { pose: "celebrate", next: s };
    case "coach:mood":
      return { pose: e.mood, next: s };
    case "block:start":
      return { pose: mode === "quiet" ? "quiet" : "watch", next: INITIAL_THROTTLE };
    case "block:end":
      return { pose: "proud", next: s };
  }
}

export function createPandaBus() {
  const listeners = new Set<(e: PandaEvent) => void>();
  return {
    emit(e: PandaEvent) {
      for (const fn of listeners) fn(e);
    },
    on(fn: (e: PandaEvent) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

/** The one bus the app shares. */
export const pandaBus = createPandaBus();
