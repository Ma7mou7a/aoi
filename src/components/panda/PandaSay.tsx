/** Bao's speech bubble. Announced politely to screen readers; the tail points at Bao (below-right). */
export function PandaSay({ text, className = "" }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <p
      aria-live="polite"
      className={`relative max-w-[16rem] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${className}`}
    >
      {text}
      <span aria-hidden className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-r border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
    </p>
  );
}
