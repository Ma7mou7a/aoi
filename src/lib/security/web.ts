/**
 * Web hardening shared by the middleware (Edge runtime: no Node APIs here) and route handlers.
 */

/** The app's own origin: APP_ORIGIN if configured, else what the proxy or the request says. */
export function expectedOrigin(h: Headers, requestUrl: string, appOrigin = process.env.APP_ORIGIN): string {
  if (appOrigin) return appOrigin.replace(/\/$/, "");
  const url = new URL(requestUrl);
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || url.host;
  return `${proto}://${host}`;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for state-changing requests. Browsers send Origin (and Sec-Fetch-Site) on every
 * cross-origin POST/PATCH/DELETE, so a forged request from another site always carries a foreign
 * value and is refused. Requests with neither header come from non-browser clients, which can't
 * carry the victim's cookies by accident, so they pass. SameSite=Lax cookies are the second layer.
 */
export function checkSameOrigin(req: { method: string; origin: string | null; secFetchSite: string | null; expected: string }): { ok: true } | { ok: false; reason: string } {
  if (SAFE.has(req.method.toUpperCase())) return { ok: true };
  if (req.secFetchSite && req.secFetchSite !== "same-origin" && req.secFetchSite !== "none") return { ok: false, reason: `sec-fetch-site: ${req.secFetchSite}` };
  if (req.origin !== null && req.origin !== req.expected) return { ok: false, reason: `origin ${req.origin}` };
  return { ok: true };
}

/**
 * Content Security Policy with a per-request nonce: only scripts carrying the nonce (Next's own, and
 * the theme script in the layout) run, and 'strict-dynamic' lets them load their chunks. Inline
 * styles stay allowed because React style props and the animation library set them; styles can't run code.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; https: boolean }) {
  const directives = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets Focus Guard's on-device face model (WebAssembly) compile; it allows no JS eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

/** Response headers for every page and API response. HSTS only over HTTPS (it is ignored on HTTP anyway). */
export function securityHeaders(opts: { https: boolean }): Record<string, string> {
  return {
    ...(opts.https ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    // Microphone only for the optional voice questions; everything else that could identify or track is off.
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
  };
}

/** Upper bound on any API request body, enforced from Content-Length before a route runs. Routes set tighter limits. */
export const MAX_API_BODY_BYTES = 512 * 1024;
