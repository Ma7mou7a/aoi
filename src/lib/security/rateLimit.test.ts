import { describe, expect, it } from "vitest";
import { createLimiter } from "./rateLimit";

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
