/**
 * Runs once when the Next.js server starts. The Node-only work lives in ./instrumentation-node.ts so
 * it is never bundled for the Edge runtime (the middleware).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
