import { describe, expect, it } from "vitest";
import { buildCsp, checkSameOrigin, expectedOrigin, securityHeaders } from "./web";

describe("expected origin", () => {
  it("prefers APP_ORIGIN, then forwarded headers, then the request URL", () => {
    expect(expectedOrigin(new Headers(), "http://localhost:3000/api/x", "https://ai4brain.example")).toBe("https://ai4brain.example");
    expect(expectedOrigin(new Headers({ "x-forwarded-proto": "https", "x-forwarded-host": "app.example" }), "http://10.0.0.5:3000/x")).toBe("https://app.example");
    expect(expectedOrigin(new Headers({ host: "localhost:3100" }), "http://localhost:3100/x")).toBe("http://localhost:3100");
  });
});

describe("CSRF: same-origin check for state-changing requests", () => {
  const base = { expected: "http://localhost:3000" };
  it("lets safe methods through", () => {
    expect(checkSameOrigin({ ...base, method: "GET", origin: "https://evil.example", secFetchSite: "cross-site" })).toEqual({ ok: true });
  });

  it("accepts same-origin browser requests", () => {
    expect(checkSameOrigin({ ...base, method: "POST", origin: "http://localhost:3000", secFetchSite: "same-origin" })).toEqual({ ok: true });
  });

  it("rejects cross-site and same-site (sibling subdomain) requests", () => {
    expect(checkSameOrigin({ ...base, method: "POST", origin: "https://evil.example", secFetchSite: "cross-site" }).ok).toBe(false);
    expect(checkSameOrigin({ ...base, method: "DELETE", origin: null, secFetchSite: "same-site" }).ok).toBe(false);
    expect(checkSameOrigin({ ...base, method: "PATCH", origin: "https://evil.example", secFetchSite: null }).ok).toBe(false);
    expect(checkSameOrigin({ ...base, method: "POST", origin: "null", secFetchSite: null }).ok).toBe(false);
  });

  it("allows non-browser clients that send neither header (curl, scripts)", () => {
    expect(checkSameOrigin({ ...base, method: "POST", origin: null, secFetchSite: null })).toEqual({ ok: true });
  });
});

describe("security headers", () => {
  it("builds a nonce-based CSP that forbids framing, plugins and foreign scripts", () => {
    const csp = buildCsp("abc123", { dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    // JS eval stays forbidden; 'wasm-unsafe-eval' only lets WebAssembly compile (Focus Guard).
    expect(csp).not.toContain(" 'unsafe-eval'");
  });

  it("allows what Next's dev server needs only in development", () => {
    const csp = buildCsp("n", { dev: true, https: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("sends HSTS only over HTTPS, and always the other hardening headers", () => {
    const h = securityHeaders({ https: true });
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=63072000; includeSubDomains/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("same-origin");
    expect(h["Permissions-Policy"]).toContain("camera=(self)");
    expect(h["Permissions-Policy"]).toContain("geolocation=()");
    expect(h["Permissions-Policy"]).toContain("microphone=(self)");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(securityHeaders({ https: false })["Strict-Transport-Security"]).toBeUndefined();
  });
});
