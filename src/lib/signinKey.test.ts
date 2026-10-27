import { describe, expect, it } from "vitest";
import { generateSigninKey, hashSigninKey, KEY_CHARS, normaliseSigninKey } from "./signinKey";

describe("sign-in keys", () => {
  it("are 16 Crockford base32 characters in groups of four", () => {
    const k = generateSigninKey();
    expect(k).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(k.replace(/-/g, "")).toHaveLength(KEY_CHARS);
    expect(generateSigninKey()).not.toBe(k);
  });
  it("accept sloppy typing: case, spaces, dashes and look-alike letters", () => {
    const k = generateSigninKey(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const plain = k.replace(/-/g, "");
    expect(normaliseSigninKey(k.toLowerCase())).toBe(plain);
    expect(normaliseSigninKey(` ${k.replace(/-/g, " ")} `)).toBe(plain);
    expect(normaliseSigninKey("oooo-iiii-llll-0000")).toBe("0000111111110000");
    expect(normaliseSigninKey("too-short")).toBeNull();
  });
  it("hash to a stable, non-reversible lookup value", () => {
    expect(hashSigninKey("ABCD")).toBe(hashSigninKey("ABCD"));
    expect(hashSigninKey("ABCD")).not.toContain("ABCD");
    expect(hashSigninKey("ABCD")).toHaveLength(64);
  });
});
