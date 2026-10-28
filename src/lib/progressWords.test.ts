import { describe, expect, it } from "vitest";
import { changeText, forecastText, paceText, trackText, trendLabel, unlockText } from "./progressWords";

describe("trendLabel", () => {
  it("calls a trend growing or dipping only when it is clearly bigger than its uncertainty", () => {
    expect(trendLabel(0.04, 0.01).label).toBe("Growing");
    expect(trendLabel(-0.04, 0.01).label).toBe("Dipping");
    expect(trendLabel(0.03, 0.03).label).toBe("Steady");
    expect(trendLabel(-0.02, 0.03).label).toBe("Steady");
  });
  it("words a dip kindly", () => expect(trendLabel(-0.04, 0.01).note).toMatch(/tired|harder level/));
});

describe("changeText", () => {
  const first = { mean: 0.45, sd: 0.1 };
  it("only reports a change that is bigger than the noise", () => {
    expect(changeText(first, { mean: 0.48, sd: 0.08 })).toBe("About the same as your first game (within the range)");
    expect(changeText({ mean: 0.4, sd: 0.04 }, { mean: 0.6, sd: 0.04 })).toBe("+20 since your first game");
    expect(changeText({ mean: 0.6, sd: 0.04 }, { mean: 0.45, sd: 0.04 })).toBe("−15 since your first game");
  });
  it("says nothing without a first game, or with a single game", () => {
    expect(changeText(null, first)).toBeNull();
    expect(changeText(first, { mean: 0.45, sd: 0.1 }, { games: 1 })).toBeNull();
  });
  it("agrees with a clear trend instead of contradicting it", () => {
    expect(changeText(first, { mean: 0.48, sd: 0.08 }, { games: 6, trend: "Growing" })).toBe("Trending up, though still within the range of your first game");
    expect(changeText(first, { mean: 0.42, sd: 0.08 }, { games: 6, trend: "Dipping" })).toBe("Trending down, though still within the range of your first game");
  });
});

describe("forecastText", () => {
  it("gives a narrow range plainly", () => {
    expect(forecastText({ ciLow: 0.52, ciHigh: 0.64 }, 6, 0.04, 0.2)).toBe("Next week: likely 52–64.");
  });
  it("explains a wide range and how many games would narrow it", () => {
    const t = forecastText({ ciLow: 0.33, ciHigh: 0.67 }, 4, 0.12, 0.2);
    expect(t).toMatch(/^Next week: likely 33–67\. That's wide because we've seen only 4 games; \d+ more would narrow it to about ±\d+\.$/);
  });
  it("doesn't promise that games alone will narrow a range that is wide because of the trend", () => {
    const t = forecastText({ ciLow: 0.33, ciHigh: 0.67 }, 7, 0.04, 0.2);
    expect(t).not.toMatch(/0 more/);
    expect(t).toMatch(/^Next week: likely 33–67\. That's wide because your trend is still uncertain; playing on a few more days will narrow it\.$/);
  });
  it("never suggests more than 10 games", () => {
    const t = forecastText({ ciLow: 0.1, ciHigh: 0.9 }, 3, 0.25, 0.5);
    const more = Number(/(\d+) more/.exec(t)![1]);
    expect(more).toBeLessThanOrEqual(10);
  });
});

describe("unlockText", () => {
  it("says exactly what is missing for a forecast", () => {
    expect(unlockText(1, 0)).toBe("Play 2 more games, on another day, to unlock a forecast.");
    expect(unlockText(2, 3)).toBe("Play 1 more game to unlock a forecast.");
    expect(unlockText(4, 0)).toBe("Play again on another day to unlock a forecast.");
    expect(unlockText(0, 0)).toBe("Play 3 more games, on another day, to unlock a forecast.");
  });
});

describe("trackText", () => {
  it("states the record in plain words", () => {
    expect(trackText(3, 3)).toBe("Bao's last 3 forecasts were right 3 times. Every forecast is checked against what really happened.");
    expect(trackText(1, 1)).toBe("Bao's last forecast was right. Every forecast is checked against what really happened.");
    expect(trackText(0, 1)).toBe("Bao's last forecast missed. Every forecast is checked against what really happened.");
    expect(trackText(0, 0)).toBeNull();
  });
});

describe("paceText", () => {
  it("describes the every-day forecast as a range", () => {
    expect(paceText({ gamesPerWeek: 7, fromPct: 48, toPct: 55, lowPct: 46, highPct: 64, perGamePct: 1 })).toBe("If you play every day: about 55 (likely 46–64).");
    expect(paceText({ gamesPerWeek: 2, fromPct: 48, toPct: 50, lowPct: 40, highPct: 60, perGamePct: 1 })).toBe("If you play twice a week: about 50 (likely 40–60).");
  });
});
