import { describe, expect, it } from "vitest";
import { addressKey, clientAddress, createLimiter } from "./rateLimit";

function setup() {
  let now = 0;
  const limiter = createLimiter({ windowMs: 15 * 60_000, maxFailures: 10, freeFailures: 3, baseDelayMs: 250, maxDelayMs: 8000, clock: () => now });
  return { limiter, tick: (ms: number) => (now += ms) };
}

describe("sign-in rate limit with progressive delay", () => {
  it("lets the first few mistakes through with no delay", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("1.2.3.4")).toEqual({ allowed: true, delayMs: 0 });
      limiter.fail("1.2.3.4");
    }
  });

  it("doubles the delay after each further failure, up to a cap", () => {
    const { limiter } = setup();
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      const c = limiter.check("ip");
      if (c.allowed) delays.push(c.delayMs);
      limiter.fail("ip");
    }
    expect(delays).toEqual([0, 0, 0, 250, 500, 1000, 2000, 4000, 8000, 8000]);
  });

  it("locks out after too many failures until the window passes", () => {
    const { limiter, tick } = setup();
    for (let i = 0; i < 10; i++) limiter.fail("ip");
    const c = limiter.check("ip");
    expect(c.allowed).toBe(false);
    if (!c.allowed) expect(c.retryAfterMs).toBeGreaterThan(0);
    tick(15 * 60_000 + 1);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("keeps addresses apart, and a success clears the slate", () => {
    const { limiter } = setup();
    for (let i = 0; i < 10; i++) limiter.fail("a");
    expect(limiter.check("b").allowed).toBe(true);
    for (let i = 0; i < 5; i++) limiter.fail("b");
    limiter.succeed("b");
    expect(limiter.check("b")).toEqual({ allowed: true, delayMs: 0 });
  });

  it("forgets old entries so memory stays bounded", () => {
    const { limiter, tick } = setup();
    for (let i = 0; i < 1000; i++) limiter.fail(`ip${i}`);
    tick(16 * 60_000);
    limiter.fail("new");
    expect(limiter.size()).toBe(1);
  });
});

describe("client address used as the rate-limit key", () => {
  const h = (xff?: string, realIp?: string) => new Headers({ ...(xff ? { "x-forwarded-for": xff } : {}), ...(realIp ? { "x-real-ip": realIp } : {}) });

  it("behind one trusted proxy, uses the hop that proxy added and ignores what the client wrote", () => {
    expect(clientAddress(h("6.6.6.6, 9.9.9.9, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientAddress(h("6.6.6.6, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
  });

  it("a client can't pick a fresh address per request behind a proxy", () => {
    const keys = new Set(["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((fake) => clientAddress(h(`${fake}, 203.0.113.7`), 1)));
    expect([...keys]).toEqual(["203.0.113.7"]);
  });

  it("without a configured proxy, trusts neither x-real-ip nor the first hop", () => {
    expect(clientAddress(h("6.6.6.6, 198.51.100.4"), 0)).toBe("198.51.100.4");
    expect(clientAddress(h(undefined, "6.6.6.6"), 0)).toBe("local");
    expect(clientAddress(h(), 1)).toBe("local");
  });

  it("groups IPv6 addresses by /64 so one host can't rotate through its block", () => {
    expect(addressKey("2001:db8:abcd:12:1::5")).toBe("2001:db8:abcd:12::/64");
    expect(addressKey("2001:db8:abcd:12:ffff:ffff:ffff:ffff")).toBe("2001:db8:abcd:12::/64");
    expect(addressKey("[2001:DB8::1]:443")).toBe("2001:db8:0:0::/64");
    expect(addressKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("keeps IPv4 as is, including IPv4-mapped IPv6 and a trailing port", () => {
    expect(addressKey("203.0.113.7")).toBe("203.0.113.7");
    expect(addressKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(addressKey("203.0.113.7:51234")).toBe("203.0.113.7");
  });
});

describe("server-wide flood cap", () => {
  it("refuses once too many failures pile up across all addresses, then recovers", () => {
    let now = 0;
    const flood = createLimiter({ windowMs: 60_000, maxFailures: 120, freeFailures: 120, baseDelayMs: 0, maxDelayMs: 0, clock: () => now });
    for (let i = 0; i < 119; i++) flood.fail("all");
    expect(flood.check("all")).toEqual({ allowed: true, delayMs: 0 });
    flood.fail("all");
    expect(flood.check("all").allowed).toBe(false);
    now += 60_001;
    expect(flood.check("all").allowed).toBe(true);
  });
});
