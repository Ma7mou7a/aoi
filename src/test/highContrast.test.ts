import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { contrastRatio } from "@/lib/contrast";
import { migrateTestDb } from "@/test/db";
import { newRequest } from "@/test/nextHeaders";

vi.mock("next/headers", () => import("@/test/nextHeaders"));

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
function tokens(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block missing`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

describe("contrast ratio (WCAG 2.x formula)", () => {
  it("matches known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  });
});

describe.each(['[data-theme="dark"][data-contrast="high"]', '[data-theme="light"][data-contrast="high"]'])("high-contrast theme %s", (selector) => {
  const t = tokens(selector);
  it.each([
    ["foreground", "background"],
    ["hc-muted", "background"],
    ["brand", "background"],
    ["chart-ink", "chart-surface"],
    ["chart-ink-2", "chart-surface"],
  ])("%s on %s reaches 7:1 (AAA)", (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(7);
  });

  it("drops decorative glow and grid", () => {
    expect(css.slice(css.indexOf(`${selector} {`))).toMatch(/--glow: transparent/);
  });
});

describe("high-contrast setting is saved per user", () => {
  beforeAll(migrateTestDb);

  it("PATCH /api/me stores it and the user comes back with it", async () => {
    const { POST: onboard } = await import("@/app/api/onboard/route");
    const { PATCH } = await import("@/app/api/me/route");
    const { getCurrentUser } = await import("@/lib/server/user");
    newRequest({}, { fresh: true });
    await onboard(new Request("http://localhost/api/onboard", { method: "POST", body: JSON.stringify({ displayName: "H", consents: { data_processing: true, behavioural_signals: false, llm_coaching: false, age_18_plus: true } }) }));
    expect((await getCurrentUser())?.preferences.highContrast).toBeFalsy();
    const res = await PATCH(new Request("http://localhost/api/me", { method: "PATCH", body: JSON.stringify({ highContrast: true }) }));
    expect(await res.json()).toMatchObject({ highContrast: true });
    expect((await getCurrentUser())?.preferences.highContrast).toBe(true);
    // Other preferences are untouched.
    await PATCH(new Request("http://localhost/api/me", { method: "PATCH", body: JSON.stringify({ researchMode: true }) }));
    expect((await getCurrentUser())?.preferences).toMatchObject({ highContrast: true, researchMode: true });
  });
});
