/**
 * Browser side of passkeys (WebAuthn). The server sends options with base64url strings; the browser
 * API wants ArrayBuffers, and its answers go back as base64url. Nothing secret is handled here: the
 * private key stays inside the device's authenticator.
 */

export function b64uToBuffer(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function bufferToB64u(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const passkeysSupported = () => typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";

async function post(url: string, body: unknown = {}) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

type CredentialDescriptor = { type: "public-key"; id: string; transports?: string[] };

/** Create a passkey on this device for the signed-in profile. */
export async function addPasskey(label?: string) {
  const o = await post("/api/passkeys/register/options");
  const cred = (await navigator.credentials.create({
    publicKey: {
      ...o,
      challenge: b64uToBuffer(o.challenge),
      user: { ...o.user, id: b64uToBuffer(o.user.id) },
      excludeCredentials: (o.excludeCredentials as CredentialDescriptor[]).map((c) => ({ ...c, id: b64uToBuffer(c.id), transports: c.transports as AuthenticatorTransport[] })),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was created.");
  const r = cred.response as AuthenticatorAttestationResponse;
  return post("/api/passkeys/register", {
    label,
    credential: {
      id: cred.id,
      rawId: bufferToB64u(cred.rawId),
      type: cred.type,
      response: { clientDataJSON: bufferToB64u(r.clientDataJSON), attestationObject: bufferToB64u(r.attestationObject), transports: r.getTransports?.() ?? [] },
    },
  });
}

/** Sign in with any passkey this device holds for the site (no name or key needed). */
export async function signInWithPasskey() {
  const o = await post("/api/passkeys/login/options");
  const cred = (await navigator.credentials.get({
    publicKey: { challenge: b64uToBuffer(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification, allowCredentials: [] },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was chosen.");
  const r = cred.response as AuthenticatorAssertionResponse;
  return post("/api/passkeys/login", {
    credential: {
      id: cred.id,
      rawId: bufferToB64u(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: bufferToB64u(r.clientDataJSON),
        authenticatorData: bufferToB64u(r.authenticatorData),
        signature: bufferToB64u(r.signature),
        userHandle: r.userHandle ? bufferToB64u(r.userHandle) : null,
      },
    },
  });
}
