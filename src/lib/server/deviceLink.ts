import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import qrcode from "qrcode-generator";
import { db, schema } from "@/db";
import { hashToken, newToken } from "@/lib/security/tokens";

/**
 * "Sign in on another device": a signed-in device shows a QR code (a link carrying a 256-bit token in
 * the URL fragment, which browsers never send to servers or in Referer headers) and a 10-character
 * code to type instead. Either works once, for 5 minutes; only hashes are stored; creating a new one
 * cancels the previous one. Redeeming is rate-limited like the sign-in key.
 */
export const DEVICE_LINK_TTL_MS = 5 * 60_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const CODE_CHARS = 10; // 50 bits: plenty for 5 minutes behind a rate limit

const hashCode = (normalised: string) => hashToken(`device-code:${normalised}`);

function newCode() {
  const bytes = randomBytes(CODE_CHARS);
  const raw = [...bytes].map((b) => ALPHABET[b & 31]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function normaliseCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  return s.length === CODE_CHARS && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

export async function createDeviceLink(userId: string, now = new Date()) {
  const token = newToken();
  const code = newCode();
  const expiresAt = new Date(now.getTime() + DEVICE_LINK_TTL_MS);
  await db.transaction(async (tx) => {
    // One live link per user: a new one cancels any earlier unused one.
    await tx
      .update(schema.authChallenges)
      .set({ usedAt: now })
      .where(and(eq(schema.authChallenges.userId, userId), eq(schema.authChallenges.kind, "device_link"), isNull(schema.authChallenges.usedAt)));
    await tx.insert(schema.authChallenges).values({ kind: "device_link", userId, tokenHash: hashToken(token), codeHash: hashCode(normaliseCode(code)!), expiresAt, createdAt: now });
  });
  return { token, code, expiresAt };
}

/** The user id behind a live link, consuming it (atomically: of two concurrent tries only one wins). */
export async function redeemDeviceLink(input: { token?: string; code?: string }, now = new Date()): Promise<string | null> {
  const tokenHash = input.token && input.token.length <= 128 ? hashToken(input.token) : null;
  const normalised = input.code ? normaliseCode(input.code) : null;
  const codeHash = normalised ? hashCode(normalised) : null;
  if (!tokenHash && !codeHash) return null;
  const [row] = await db
    .update(schema.authChallenges)
    .set({ usedAt: now })
    .where(
      and(
        eq(schema.authChallenges.kind, "device_link"),
        isNull(schema.authChallenges.usedAt),
        gt(schema.authChallenges.expiresAt, now),
        or(tokenHash ? eq(schema.authChallenges.tokenHash, tokenHash) : undefined, codeHash ? eq(schema.authChallenges.codeHash, codeHash) : undefined),
      ),
    )
    .returning({ userId: schema.authChallenges.userId });
  return row?.userId ?? null;
}

/** A QR code as a small SVG (dark modules as one path, quiet zone included, no scripts or styles). */
export function qrSvg(text: string) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 4;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  const size = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
