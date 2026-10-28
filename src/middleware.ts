import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, checkSameOrigin, expectedOrigin, MAX_API_BODY_BYTES, securityHeaders } from "@/lib/security/web";

/**
 * Runs before every page and API route:
 * - a fresh CSP nonce per request (Next applies it to its own scripts; the layout reads x-nonce);
 * - strict security headers (HSTS over HTTPS);
 * - CSRF: state-changing API calls must come from this origin;
 * - an upper bound on request bodies (routes then enforce tighter, per-route limits while reading).
 */
export function middleware(request: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const origin = expectedOrigin(request.headers, request.url);
  const https = origin.startsWith("https://");
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (isApi) {
    const check = checkSameOrigin({ method: request.method, origin: request.headers.get("origin"), secFetchSite: request.headers.get("sec-fetch-site"), expected: origin });
    if (!check.ok) return withHeaders(NextResponse.json({ error: "Blocked: this request came from another site." }, { status: 403 }), https);
    if (Number(request.headers.get("content-length") ?? "0") > MAX_API_BODY_BYTES) {
      return withHeaders(NextResponse.json({ error: "That request is too large." }, { status: 413 }), https);
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, { dev, https });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (isApi) response.headers.set("Cache-Control", "no-store");
  return withHeaders(response, https);
}

function withHeaders(response: NextResponse, https: boolean) {
  for (const [k, v] of Object.entries(securityHeaders({ https }))) response.headers.set(k, v);
  return response;
}

export const config = {
  // Everything except static assets (which carry no personal data and are immutable).
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
