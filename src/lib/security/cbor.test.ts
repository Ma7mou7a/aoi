import { describe, expect, it } from "vitest";
import { encodeCbor } from "@/test/cbor";
import { decodeCbor, decodeCborPrefix } from "./cbor";

describe("minimal CBOR decoder (WebAuthn subset)", () => {
  it("round-trips the types WebAuthn uses", () => {
    const value = new Map<unknown, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Uint8Array.from([1, 2, 3])],
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["list", [true, false, null, 500, 70000]],
    ]);
    const decoded = decodeCbor(encodeCbor(value as never)) as Map<unknown, unknown>;
    expect(decoded.get(3)).toBe(-7);
    expect(decoded.get(-1)).toBe(1);
    expect(Buffer.from(decoded.get(-2) as Uint8Array)).toEqual(Buffer.from([1, 2, 3]));
    expect(decoded.get("fmt")).toBe("none");
    expect(decoded.get("list")).toEqual([true, false, null, 500, 70000]);
  });

  it("reports how many bytes a value used (the COSE key sits mid-buffer in authenticator data)", () => {
    const a = encodeCbor({ a: 1 });
    const buf = Buffer.concat([Buffer.from(a), Buffer.from([0xff, 0xff])]);
    expect(decodeCborPrefix(buf, 0).end).toBe(a.length);
  });

  it("rejects truncated or unsupported input instead of guessing", () => {
    expect(() => decodeCbor(Uint8Array.from([0x59, 0x01]))).toThrow();
    expect(() => decodeCbor(Uint8Array.from([0x9f]))).toThrow(/indefinite/i); // indefinite-length array
    expect(() => decodeCbor(Uint8Array.from([0x01, 0x02]))).toThrow(/trailing/i);
  });

  it("caps nesting depth", () => {
    const deep = Uint8Array.from([...Array(100).fill(0x81), 0x01]);
    expect(() => decodeCbor(deep)).toThrow(/deep/i);
  });
});
