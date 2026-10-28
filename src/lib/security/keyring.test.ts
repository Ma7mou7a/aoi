import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEV_KEY_VERSION, loadKeyring } from "./keyring";

const k = () => randomBytes(32).toString("base64");

describe("master keyring from the environment", () => {
  it("uses a single AI4B_MASTER_KEY as version 1", () => {
    const key = k();
    const r = loadKeyring({ AI4B_MASTER_KEY: key, AI4B_AUDIT_KEY: k(), NODE_ENV: "production" });
    expect(r.current).toBe(1);
    expect(r.keys.get(1)!.toString("base64")).toBe(key);
    expect(r.dev).toBe(false);
  });

  it("supports several versions for rotation; the newest is current unless pinned", () => {
    const env = { AI4B_MASTER_KEYS: `1:${k()}, 3:${k()},2:${k()}`, AI4B_AUDIT_KEY: k() };
    expect(loadKeyring(env).current).toBe(3);
    expect(loadKeyring({ ...env, AI4B_MASTER_KEY_VERSION: "2" }).current).toBe(2);
    expect(() => loadKeyring({ ...env, AI4B_MASTER_KEY_VERSION: "7" })).toThrow(/version 7/);
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => loadKeyring({ AI4B_MASTER_KEY: "c2hvcnQ=" })).toThrow(/32 bytes/);
    expect(() => loadKeyring({ AI4B_MASTER_KEY: k(), AI4B_AUDIT_KEY: "c2hvcnQ=" })).toThrow(/32 bytes/);
  });

  it("falls back to a fixed development key outside production, flagged as dev", () => {
    const r = loadKeyring({ NODE_ENV: "development" });
    expect(r.dev).toBe(true);
    expect(r.current).toBe(DEV_KEY_VERSION);
    expect(r.keys.get(DEV_KEY_VERSION)).toHaveLength(32);
    expect(r.auditKey).toHaveLength(32);
    // Stable across restarts, otherwise dev data would become unreadable.
    expect(loadKeyring({}).keys.get(DEV_KEY_VERSION)!.equals(r.keys.get(DEV_KEY_VERSION)!)).toBe(true);
  });

  it("refuses to run production on the development key unless explicitly allowed", () => {
    expect(() => loadKeyring({ NODE_ENV: "production" })).toThrow(/AI4B_MASTER_KEY/);
    expect(() => loadKeyring({ NODE_ENV: "production", AI4B_MASTER_KEY: k() })).toThrow(/AI4B_AUDIT_KEY/);
    expect(loadKeyring({ NODE_ENV: "production", AI4B_ALLOW_DEV_KEY: "1" }).dev).toBe(true);
  });

  it("keeps the development key available for reading after a real key is added", () => {
    const r = loadKeyring({ AI4B_MASTER_KEY: k(), AI4B_AUDIT_KEY: k(), NODE_ENV: "development" });
    expect(r.current).toBe(1);
    expect(r.keys.has(DEV_KEY_VERSION)).toBe(true);
  });
});
