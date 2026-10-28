/**
 * Minimal, strict CBOR (RFC 8949) decoder: just what WebAuthn needs (attestation objects and COSE
 * keys). Unsigned/negative integers up to 2^53, byte and text strings, arrays, maps, tags (skipped),
 * true/false/null. Indefinite lengths, floats and anything else are rejected rather than guessed.
 */
export type Cbor = number | string | boolean | null | Uint8Array | Cbor[] | Map<Cbor, Cbor>;

const MAX_DEPTH = 16;

export function decodeCborPrefix(buf: Uint8Array, start: number, depth = 0): { value: Cbor; end: number } {
  if (depth > MAX_DEPTH) throw new Error("CBOR nested too deep");
  let p = start;
  const need = (n: number) => {
    if (p + n > buf.length) throw new Error("CBOR truncated");
  };
  need(1);
  const first = buf[p++];
  const major = first >> 5;
  const info = first & 31;

  const readLength = (): number => {
    if (info < 24) return info;
    if (info === 31) throw new Error("CBOR indefinite lengths are not supported");
    const bytes = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (!bytes) throw new Error("CBOR invalid length");
    need(bytes);
    let n = 0;
    for (let i = 0; i < bytes; i++) n = n * 256 + buf[p++];
    if (n > Number.MAX_SAFE_INTEGER) throw new Error("CBOR integer too large");
    return n;
  };

  switch (major) {
    case 0:
      return { value: readLength(), end: p };
    case 1:
      return { value: -1 - readLength(), end: p };
    case 2:
    case 3: {
      const n = readLength();
      need(n);
      const bytes = buf.slice(p, p + n);
      p += n;
      return { value: major === 2 ? bytes : new TextDecoder("utf-8", { fatal: true }).decode(bytes), end: p };
    }
    case 4: {
      const n = readLength();
      const arr: Cbor[] = [];
      for (let i = 0; i < n; i++) {
        const r = decodeCborPrefix(buf, p, depth + 1);
        arr.push(r.value);
        p = r.end;
      }
      return { value: arr, end: p };
    }
    case 5: {
      const n = readLength();
      const map = new Map<Cbor, Cbor>();
      for (let i = 0; i < n; i++) {
        const k = decodeCborPrefix(buf, p, depth + 1);
        const v = decodeCborPrefix(buf, k.end, depth + 1);
        map.set(k.value, v.value);
        p = v.end;
      }
      return { value: map, end: p };
    }
    case 6: {
      readLength(); // tag number: ignored, the tagged value is returned as-is
      return decodeCborPrefix(buf, p, depth + 1);
    }
    default: {
      if (info === 20) return { value: false, end: p };
      if (info === 21) return { value: true, end: p };
      if (info === 22) return { value: null, end: p };
      if (info === 31) throw new Error("CBOR indefinite lengths are not supported");
      throw new Error(`CBOR simple/float value ${info} not supported`);
    }
  }
}

/** Decode exactly one value; trailing bytes are an error. */
export function decodeCbor(buf: Uint8Array): Cbor {
  const { value, end } = decodeCborPrefix(buf, 0);
  if (end !== buf.length) throw new Error("CBOR has trailing bytes");
  return value;
}
