/** POST one game step to the AI Lab API. */
export async function labStep<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/ai-lab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json as T;
}

export const BTN = "rounded-xl border border-slate-300 px-4 py-3 text-left font-medium transition hover:border-brand disabled:opacity-50 dark:border-slate-600";
export const PRIMARY_BTN = "rounded-xl bg-brand px-5 py-3 font-medium text-white disabled:opacity-50 dark:text-slate-950";
