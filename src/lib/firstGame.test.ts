import { describe, expect, it } from "vitest";
import { clearFirstGame, FIRST_GAME_KEY, saveFirstGame, takeFirstGame, type FirstGame } from "./firstGame";

/** A Storage with the same API as sessionStorage, kept in memory. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const game: Omit<FirstGame, "savedAt"> = {
  dimensionId: "visuospatial_memory",
  taskId: "corsi_blocks",
  level: 2,
  params: { start_span: 4, seed: 42 },
  startedAt: "2026-10-27T10:00:00.000Z",
  trials: [{ trialIndex: 0, isPractice: false, stimulus: { seq: [1, 2, 3] }, response: [1, 2, 3], outcome: "response", correct: true, rtMs: 900 }],
};
const T0 = 1_800_000_000_000;

describe("first game carry-over", () => {
  it("returns the saved game once, then forgets it", () => {
    const s = memoryStorage();
    saveFirstGame(s, game, T0);
    expect(takeFirstGame(s, T0 + 60_000)).toMatchObject({ dimensionId: "visuospatial_memory", level: 2 });
    expect(s.getItem(FIRST_GAME_KEY)).toBeNull();
    expect(takeFirstGame(s, T0 + 60_000)).toBeNull();
  });
  it("ignores a game older than 30 minutes and removes it", () => {
    const s = memoryStorage();
    saveFirstGame(s, game, T0);
    expect(takeFirstGame(s, T0 + 31 * 60_000)).toBeNull();
    expect(s.getItem(FIRST_GAME_KEY)).toBeNull();
  });
  it("is cleared on sign-in so it never lands in an existing account", () => {
    const s = memoryStorage();
    saveFirstGame(s, game, T0);
    clearFirstGame(s);
    expect(takeFirstGame(s, T0)).toBeNull();
  });
  it("treats corrupt data as nothing", () => {
    const s = memoryStorage();
    s.setItem(FIRST_GAME_KEY, "{not json");
    expect(takeFirstGame(s, T0)).toBeNull();
    expect(s.getItem(FIRST_GAME_KEY)).toBeNull();
  });
});
