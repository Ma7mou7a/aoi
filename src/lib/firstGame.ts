import type { TrialRecord } from "./scoring/types";

/**
 * The 60-second first game (/start) is played before signup. Its trials wait in sessionStorage so,
 * right after signup, they can be submitted as the new account's first real game (the server scores
 * them again). They expire after 30 minutes and are cleared on sign-in, so they never land in an
 * existing account.
 */
export type FirstGame = {
  dimensionId: string;
  taskId: string;
  level: number;
  params: Record<string, unknown>;
  startedAt: string;
  trials: TrialRecord[];
  savedAt: number;
};

export const FIRST_GAME_KEY = "ai4b_first_game";
const MAX_AGE_MS = 30 * 60_000;

export function saveFirstGame(s: Storage, g: Omit<FirstGame, "savedAt">, now = Date.now()) {
  try {
    s.setItem(FIRST_GAME_KEY, JSON.stringify({ ...g, savedAt: now }));
  } catch {
    // Storage full or blocked: the first game just won't carry over.
  }
}

export function clearFirstGame(s: Storage) {
  try {
    s.removeItem(FIRST_GAME_KEY);
  } catch {}
}

export function takeFirstGame(s: Storage, now = Date.now()): FirstGame | null {
  let raw: string | null = null;
  try {
    raw = s.getItem(FIRST_GAME_KEY);
  } catch {
    return null;
  }
  clearFirstGame(s);
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as FirstGame;
    if (typeof g.savedAt !== "number" || now - g.savedAt > MAX_AGE_MS || !Array.isArray(g.trials)) return null;
    return g;
  } catch {
    return null;
  }
}
