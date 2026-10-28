import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { encodeCbor } from "./cbor";

/**
 * A software WebAuthn authenticator for tests: real key pairs, real CBOR, real signatures, so the
 * server-side verification is exercised exactly as with a phone or security key.
 */
const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest();

export const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 };

function coseKey(alg: number, publicKey: KeyObject) {
  const jwk = publicKey.export({ format: "jwk" });
  const d = (s?: string) => Uint8Array.from(Buffer.from(s!, "base64url"));
  if (alg === -7) return new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, d(jwk.x)], [-3, d(jwk.y)]]);
  if (alg === -8) return new Map<number, unknown>([[1, 1], [3, -8], [-1, 6], [-2, d(jwk.x)]]);
  return new Map<number, unknown>([[1, 3], [3, -257], [-1, d(jwk.n)], [-2, d(jwk.e)]]);
}

export function fakeAuthenticator(alg: -7 | -8 | -257 = -7) {
  const { publicKey, privateKey } =
    alg === -7 ? generateKeyPairSync("ec", { namedCurve: "P-256" })
    : alg === -8 ? generateKeyPairSync("ed25519")
    : generateKeyPairSync("rsa", { modulusLength: 2048 });
  const credentialId = randomBytes(16);
  let counter = 0;

  return {
    credentialId: b64u(credentialId),
    setCounter: (n: number) => void (counter = n),
    create(opts: { challenge: string; origin: string; rpId: string; flags?: number; type?: string; userHandle?: string }) {
      const clientDataJSON = Buffer.from(JSON.stringify({ type: opts.type ?? "webauthn.create", challenge: opts.challenge, origin: opts.origin, crossOrigin: false }));
      const flags = opts.flags ?? FLAGS.UP | FLAGS.UV | FLAGS.AT;
      const cose = Buffer.from(encodeCbor(coseKey(alg, publicKey) as never));
      const idLen = Buffer.from([credentialId.length >> 8, credentialId.length & 0xff]);
      const authData = Buffer.concat([sha256(opts.rpId), Buffer.from([flags]), Buffer.alloc(4), Buffer.alloc(16), idLen, credentialId, cose]);
      const attestationObject = encodeCbor({ fmt: "none", attStmt: {}, authData: Uint8Array.from(authData) });
      return { id: b64u(credentialId), rawId: b64u(credentialId), type: "public-key", response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ["internal"] } };
    },
    get(opts: { challenge: string; origin: string; rpId: string; flags?: number; type?: string; userHandle?: string }) {
      counter += counter > 0 ? 1 : 0;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: opts.type ?? "webauthn.get", challenge: opts.challenge, origin: opts.origin }));
      const count = Buffer.alloc(4);
      count.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([sha256(opts.rpId), Buffer.from([opts.flags ?? FLAGS.UP | FLAGS.UV]), count]);
      const data = Buffer.concat([authenticatorData, sha256(clientDataJSON)]);
      const signature = sign(alg === -8 ? null : "sha256", data, privateKey);
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: "public-key",
        response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authenticatorData), signature: b64u(signature), userHandle: opts.userHandle ?? null },
      };
    },
  };
}
