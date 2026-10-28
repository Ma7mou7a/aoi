import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, "http://localhost:3000"), { method: init.method ?? "GET", headers: { host: "localhost:3000", ...init.headers } });

describe("middleware: headers, CSRF and body limits", () => {
  it("gives every page a fresh CSP nonce and the hardening headers", () => {
    const a = middleware(req("/settings"));
    const b = middleware(req("/settings"));
    const csp = a.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{20,}'/);
    expect(csp).not.toBe(b.headers.get("content-security-policy"));
    expect(a.headers.get("x-content-type-options")).toBe("nosniff");
    expect(a.headers.get("x-frame-options")).toBe("DENY");
    // The nonce is passed to the app (layout) through a request header.
    expect(a.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
  });

  it("refuses cross-site state-changing API calls", async () => {
    const res = middleware(req("/api/me", { method: "DELETE", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/another site/i);
  });

  it("lets same-origin API calls through and marks them no-store", () => {
    const res = middleware(req("/api/consents", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses oversized request bodies before any route runs", () => {
    const res = middleware(req("/api/coach", { method: "POST", headers: { origin: "http://localhost:3000", "content-length": String(10 * 1024 * 1024) } }));
    expect(res.status).toBe(413);
  });
});
