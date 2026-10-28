import { createHash, hkdfSync } from "node:crypto";

/**
 * Master keys come only from the environment, never from the database, so a copy of the database
 * alone (a stolen backup, a leaked dump) cannot decrypt anything.
 *
 *   AI4B_MASTER_KEY=<base64 32 bytes>                     one key, version 1
 *   AI4B_MASTER_KEYS=1:<base64>,2:<base64>                several versions, for rotation
 *   AI4B_MASTER_KEY_VERSION=2                             which version wraps new data keys (default: newest)
 *   AI4B_AUDIT_KEY=<base64 32 bytes>                      HMAC key for the tamper-evident security log
 *
 * Without keys, development uses a fixed, publicly known key (version 0) and says so loudly.
 * Production refuses to start on it unless AI4B_ALLOW_DEV_KEY=1 is set on purpose (e.g. a local demo).
 * Generate keys with `npm run keys:new`; rotate with `npm run keys:rotate`.
 */

export const DEV_KEY_VERSION = 0;
const DEV_SEED = "ai4brain-development-master-key-NOT-SECRET-do-not-use-in-production";

export type Keyring = { keys: Map<number, Buffer>; current: number; auditKey: Buffer; dev: boolean };
type Env = Record<string, string | undefined>;

function decodeKey(name: string, b64: string): Buffer {
  const key = Buffer.from(b64.trim(), "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded (got ${key.length} bytes). Run "npm run keys:new".`);
  return key;
}

const devKey = (purpose: string) => Buffer.from(hkdfSync("sha256", createHash("sha256").update(DEV_SEED).digest(), "", purpose, 32));

export function loadKeyring(env: Env): Keyring {
  const keys = new Map<number, Buffer>();
  if (env.AI4B_MASTER_KEYS) {
    for (const part of env.AI4B_MASTER_KEYS.split(",")) {
      const [v, b64] = part.trim().split(/:(.*)/s);
      const version = Number(v);
      if (!Number.isInteger(version) || version < 1) throw new Error(`AI4B_MASTER_KEYS: bad version "${v}" (use 1, 2, 3…)`);
      keys.set(version, decodeKey(`AI4B_MASTER_KEYS version ${version}`, b64 ?? ""));
    }
  } else if (env.AI4B_MASTER_KEY) {
    keys.set(1, decodeKey("AI4B_MASTER_KEY", env.AI4B_MASTER_KEY));
  }

  const production = env.NODE_ENV === "production";
  const allowDev = !production || env.AI4B_ALLOW_DEV_KEY === "1";
  if (!keys.size && !allowDev) {
    throw new Error("AI4B_MASTER_KEY is not set. Production refuses to encrypt personal data with the public development key. Run \"npm run keys:new\" and set AI4B_MASTER_KEY and AI4B_AUDIT_KEY.");
  }
  if (keys.size && !env.AI4B_AUDIT_KEY && !allowDev) {
    throw new Error("AI4B_AUDIT_KEY is not set. Run \"npm run keys:new\" and set it next to AI4B_MASTER_KEY.");
  }

  const dev = keys.size === 0;
  // The development key stays readable outside production, so data written before a real key was set still opens.
  if (allowDev) keys.set(DEV_KEY_VERSION, devKey("master"));

  let current = dev ? DEV_KEY_VERSION : Math.max(...[...keys.keys()].filter((v) => v !== DEV_KEY_VERSION));
  if (env.AI4B_MASTER_KEY_VERSION) {
    current = Number(env.AI4B_MASTER_KEY_VERSION);
    if (!keys.has(current)) throw new Error(`AI4B_MASTER_KEY_VERSION=${current}, but no master key version ${current} is configured.`);
  }

  const auditKey = env.AI4B_AUDIT_KEY ? decodeKey("AI4B_AUDIT_KEY", env.AI4B_AUDIT_KEY) : devKey("audit");
  return { keys, current, auditKey, dev };
}

let cached: Keyring | null = null;

/** The process-wide keyring (read once). Warns loudly when the development key is in use. */
export function keyring(): Keyring {
  if (cached) return cached;
  cached = loadKeyring(process.env);
  if (cached.dev && process.env.AI4B_SILENCE_DEV_KEY_WARNING !== "1") {
    console.warn(
      "\n" +
        "┌────────────────────────────────────────────────────────────────────────────┐\n" +
        "│ [security] Using the PUBLIC DEVELOPMENT master key. Encrypted personal data │\n" +
        "│ is only protected for real once AI4B_MASTER_KEY and AI4B_AUDIT_KEY are set. │\n" +
        "│ Run `npm run keys:new` to generate them.                                    │\n" +
        "└────────────────────────────────────────────────────────────────────────────┘\n",
    );
  }
  return cached;
}

/** Tests and the rotation script: forget the cached keyring so a changed environment is read again. */
export function resetKeyring() {
  cached = null;
}
