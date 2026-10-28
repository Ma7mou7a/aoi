/**
 * Key management.
 *   npm run keys:new                 print a fresh AI4B_MASTER_KEY and AI4B_AUDIT_KEY (nothing is stored)
 *   npm run keys:rotate              re-wrap every user's data key under the current master key version
 *   npm run keys:status              how many data keys each master key version wraps
 *   npm run audit:verify             check the whole tamper-evident security log
 *
 * Rotating the master key:
 *   1. add the new key as a new version:  AI4B_MASTER_KEYS=1:<old>,2:<new>   (2 becomes current)
 *   2. npm run keys:rotate               (data is not re-encrypted; only the small wrapped keys change)
 *   3. when status shows 0 keys on version 1, remove version 1 from the environment.
 *      From then on, backups taken before step 2 can no longer be decrypted.
 */
import { randomBytes } from "node:crypto";

const cmd = process.argv[2];

async function main() {
  if (cmd === "new") {
    console.log("# Keep these secret (a password manager or your host's secret store), never in git.");
    console.log(`AI4B_MASTER_KEY=${randomBytes(32).toString("base64")}`);
    console.log(`AI4B_AUDIT_KEY=${randomBytes(32).toString("base64")}`);
    return;
  }

  const { closeDb } = await import("../src/db");
  try {
    if (cmd === "rotate") {
      const { rotateAllKeys } = await import("../src/lib/server/vault");
      const r = await rotateAllKeys();
      console.log(`Current master key version: ${r.current}. Re-wrapped ${r.rewrapped} data keys.`);
      if (r.failed.length) {
        console.error(`Could not unwrap ${r.failed.length} keys (is the old master key version still configured?):\n  ${r.failed.join("\n  ")}`);
        process.exitCode = 1;
      }
    } else if (cmd === "status") {
      const { keyVersionCounts } = await import("../src/lib/server/vault");
      const { keyring } = await import("../src/lib/security/keyring");
      console.log(`Current master key version: ${keyring().current}${keyring().dev ? " (DEVELOPMENT key)" : ""}`);
      console.log("Data keys per master key version:", await keyVersionCounts());
    } else if (cmd === "verify") {
      const { verifySecurityLog } = await import("../src/lib/server/audit");
      const v = await verifySecurityLog();
      if (v.ok) console.log(`Security log intact: ${v.checked} entries verified.`);
      else {
        console.error(`Security log BROKEN at entry #${v.brokenAt} (${v.reason}); ${v.checked} entries verified before it.`);
        process.exitCode = 2;
      }
    } else {
      console.error("Usage: tsx scripts/keys.ts new | rotate | status | verify");
      process.exitCode = 1;
    }
  } finally {
    await closeDb();
  }
}

void main();
