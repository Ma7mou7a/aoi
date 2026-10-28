import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateDataKey, isSealed, open, openJson, seal, sealJson, unwrapKey, wrapKey } from "./envelope";

const kek1 = randomBytes(32);
const kek2 = randomBytes(32);
const ring = new Map([[1, kek1], [2, kek2]]);

describe("envelope encryption (AES-256-GCM)", () => {
  it("seals and opens text, with a fresh random IV every time", () => {
    const dek = generateDataKey();
    const a = seal(dek, "Chaima", "user-1|users.display_name");
    const b = seal(dek, "Chaima", "user-1|users.display_name");
    expect(a).not.toBe(b);
    expect(a).not.toContain("Chaima");
    expect(isSealed(a)).toBe(true);
    expect(open(dek, a, "user-1|users.display_name")).toBe("Chaima");
  });

  it("refuses to open a value moved to another user or column (bound by the AAD)", () => {
    const dek = generateDataKey();
    const v = seal(dek, "secret", "user-1|coach_messages.content");
    expect(() => open(dek, v, "user-2|coach_messages.content")).toThrow();
    expect(() => open(dek, v, "user-1|users.display_name")).toThrow();
  });

  it("detects any change to the ciphertext", () => {
    const dek = generateDataKey();
    const v = seal(dek, "hello there", "a");
    const body = v.slice("enc:v1:".length);
    const flipped = body[10] === "A" ? "B" : "A";
    expect(() => open(dek, `enc:v1:${body.slice(0, 10)}${flipped}${body.slice(11)}`, "a")).toThrow();
  });

  it("fails with the wrong key", () => {
    const v = seal(generateDataKey(), "x", "a");
    expect(() => open(generateDataKey(), v, "a")).toThrow();
  });

  it("passes legacy plaintext through unchanged (rows written before encryption)", () => {
    expect(open(generateDataKey(), "Demo", "a")).toBe("Demo");
    expect(isSealed("Demo")).toBe(false);
  });

  it("seals JSON values as an {$enc} object and opens them back", () => {
    const dek = generateDataKey();
    const memory = { goal: "reasoning", recentTopics: ["memory"] };
    const sealed = sealJson(dek, memory, "u|m");
    expect(JSON.stringify(sealed)).not.toContain("reasoning");
    expect(openJson(dek, sealed, "u|m")).toEqual(memory);
    expect(openJson(dek, memory, "u|m")).toEqual(memory); // legacy plaintext JSON
    expect(openJson(dek, null, "u|m")).toBeNull();
  });

  it("wraps a data key under a versioned master key and unwraps it", () => {
    const dek = generateDataKey();
    const wrapped = wrapKey(dek, 2, kek2, "user-1");
    expect(wrapped.startsWith("kw:v1:2:")).toBe(true);
    expect(unwrapKey(wrapped, ring, "user-1").equals(dek)).toBe(true);
    expect(() => unwrapKey(wrapped, ring, "user-2")).toThrow();
    expect(() => unwrapKey(wrapped, new Map([[1, kek1]]), "user-1")).toThrow(/master key version 2/);
  });
});
