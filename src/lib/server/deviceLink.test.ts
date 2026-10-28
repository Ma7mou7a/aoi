import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { migrateTestDb } from "@/test/db";
import { createDeviceLink, DEVICE_LINK_TTL_MS, normaliseCode, qrSvg, redeemDeviceLink } from "./deviceLink";

async function newUser() {
  const [u] = await db.insert(schema.users).values({ displayName: "x" }).returning();
  return u.id;
}

describe("sign in on another device (QR code or short code)", () => {
  beforeAll(migrateTestDb);

  it("creates a single-use link token and a short typeable code", async () => {
    const uid = await newUser();
    const link = await createDeviceLink(uid);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    const rows = await db.select().from(schema.authChallenges);
    expect(JSON.stringify(rows)).not.toContain(link.token);
    expect(JSON.stringify(rows)).not.toContain(link.code.replace("-", ""));
  });

  it("redeems once by token, then never again", async () => {
    const uid = await newUser();
    const { token } = await createDeviceLink(uid);
    expect(await redeemDeviceLink({ token })).toBe(uid);
    expect(await redeemDeviceLink({ token })).toBeNull();
  });

  it("redeems by code, forgiving case and look-alike letters", async () => {
    const uid = await newUser();
    const { code } = await createDeviceLink(uid);
    const sloppy = code.toLowerCase().replace(/0/g, "o").replace(/1/g, "l");
    expect(await redeemDeviceLink({ code: sloppy })).toBe(uid);
  });

  it("expires after five minutes", async () => {
    const uid = await newUser();
    const { token } = await createDeviceLink(uid);
    expect(await redeemDeviceLink({ token }, new Date(Date.now() + DEVICE_LINK_TTL_MS + 1000))).toBeNull();
  });

  it("only the newest link of a user works", async () => {
    const uid = await newUser();
    const first = await createDeviceLink(uid);
    const second = await createDeviceLink(uid);
    expect(await redeemDeviceLink({ token: first.token })).toBeNull();
    expect(await redeemDeviceLink({ token: second.token })).toBe(uid);
  });

  it("is safe under a race: two redemptions of one link, one winner", async () => {
    const uid = await newUser();
    const { token } = await createDeviceLink(uid);
    const results = await Promise.all([redeemDeviceLink({ token }), redeemDeviceLink({ token })]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("normalises codes and rejects junk", () => {
    expect(normaliseCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normaliseCode("short")).toBeNull();
    expect(normaliseCode("ABCDE-FGHJ!")).toBeNull();
  });

  it("draws a QR code as a self-contained SVG", () => {
    const svg = qrSvg("http://localhost:3000/link#abc");
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<script");
  });
});
