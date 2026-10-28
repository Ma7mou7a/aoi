import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GENESIS, linkEntry, verifyChain, type ChainRow } from "./hashChain";

const key = randomBytes(32);

function build(n: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev = GENESIS;
  for (let i = 1; i <= n; i++) {
    const content = { seq: i, at: new Date(Date.UTC(2026, 9, 1, 0, i)), userId: i % 2 ? "u1" : "u2", type: "sign_in", details: { device: "Chrome on Windows", n: i } };
    const linked = linkEntry(key, prev, content);
    rows.push({ ...content, ...linked, redactedAt: null });
    prev = linked.hash;
  }
  return rows;
}

describe("tamper-evident hash chain", () => {
  it("verifies an untouched chain", () => {
    expect(verifyChain(key, build(10))).toEqual({ ok: true, checked: 10 });
  });

  it("detects an edited entry", () => {
    const rows = build(10);
    rows[4] = { ...rows[4], type: "sign_out" };
    expect(verifyChain(key, rows)).toMatchObject({ ok: false, brokenAt: 5, reason: "content_changed" });
  });

  it("detects an edited detail even if the attacker recomputes the content hash with a plain hash", () => {
    const rows = build(5);
    rows[1] = { ...rows[1], details: { device: "Firefox on Linux", n: 2 } };
    expect(verifyChain(key, rows).ok).toBe(false);
  });

  it("detects a deleted entry", () => {
    const rows = build(10);
    rows.splice(3, 1);
    expect(verifyChain(key, rows)).toMatchObject({ ok: false, brokenAt: 5 });
  });

  it("detects reordering", () => {
    const rows = build(6);
    [rows[2], rows[3]] = [rows[3], rows[2]];
    expect(verifyChain(key, rows).ok).toBe(false);
  });

  it("detects a chain re-sealed without the audit key", () => {
    const forged = build(4).map((r) => ({ ...r }));
    const wrongKey = randomBytes(32);
    let prev = GENESIS;
    for (const r of forged) {
      Object.assign(r, linkEntry(wrongKey, prev, r));
      prev = r.hash;
    }
    expect(verifyChain(key, forged).ok).toBe(false);
  });

  it("stays verifiable after a user's entries are redacted (right to erasure)", () => {
    const rows = build(8).map((r) => (r.userId === "u1" ? { ...r, userId: null, details: null, redactedAt: new Date() } : r));
    expect(verifyChain(key, rows)).toEqual({ ok: true, checked: 8 });
  });

  it("detects a change to the stored content hash of a redacted entry", () => {
    const rows = build(4);
    rows[1] = { ...rows[1], userId: null, details: null, redactedAt: new Date(), contentHash: "0".repeat(64) };
    expect(verifyChain(key, rows).ok).toBe(false);
  });

  it("checks a window that starts mid-chain from its first stored prevHash", () => {
    const rows = build(10).slice(5);
    expect(verifyChain(key, rows, rows[0].prevHash)).toEqual({ ok: true, checked: 5 });
  });
});
