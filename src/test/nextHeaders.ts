/**
 * Test stand-in for "next/headers": one fake request at a time.
 * In a test file: vi.mock("next/headers", () => import("@/test/nextHeaders"));
 */
type Cookie = { value: string; options?: Record<string, unknown> };
const state = { cookies: new Map<string, Cookie>(), headers: new Headers() };

export const jar = {
  get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)!.value } : undefined),
  set: (name: string, value: string, options?: Record<string, unknown>) => void state.cookies.set(name, { value, options }),
  delete: (name: string) => void state.cookies.delete(name),
  getAll: () => [...state.cookies].map(([name, c]) => ({ name, value: c.value })),
};

export async function cookies() {
  return jar;
}

export async function headers() {
  return state.headers;
}

/** Start a new fake request (cookies persist like a browser unless `fresh` is set). */
export function newRequest(h: Record<string, string> = {}, opts: { fresh?: boolean } = {}) {
  if (opts.fresh) state.cookies.clear();
  state.headers = new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36", ...h });
}

export const cookieOptions = (name: string) => state.cookies.get(name)?.options;
