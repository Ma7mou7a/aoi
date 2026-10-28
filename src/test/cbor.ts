/** Test-only CBOR encoder (the app only decodes), enough to build WebAuthn fixtures. */
export type CborValue = number | string | boolean | null | Uint8Array | CborValue[] | Map<CborValue, CborValue> | { [k: string]: CborValue };

function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n];
  if (n < 0x100) return [(major << 5) | 24, n];
  if (n < 0x10000) return [(major << 5) | 25, n >> 8, n & 0xff];
  return [(major << 5) | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

export function encodeCbor(v: CborValue): Uint8Array {
  const out: number[] = [];
  const enc = (x: CborValue) => {
    if (x === null) out.push(0xf6);
    else if (x === true) out.push(0xf5);
    else if (x === false) out.push(0xf4);
    else if (typeof x === "number") out.push(...(x >= 0 ? head(0, x) : head(1, -1 - x)));
    else if (typeof x === "string") {
      const b = new TextEncoder().encode(x);
      out.push(...head(3, b.length), ...b);
    } else if (x instanceof Uint8Array) out.push(...head(2, x.length), ...x);
    else if (Array.isArray(x)) {
      out.push(...head(4, x.length));
      x.forEach(enc);
    } else if (x instanceof Map) {
      out.push(...head(5, x.size));
      for (const [k, val] of x) {
        enc(k);
        enc(val);
      }
    } else {
      const entries = Object.entries(x);
      out.push(...head(5, entries.length));
      for (const [k, val] of entries) {
        enc(k);
        enc(val);
      }
    }
  };
  enc(v);
  return Uint8Array.from(out);
}
