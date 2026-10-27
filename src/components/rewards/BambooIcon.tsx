/** A small bamboo stalk icon (used instead of an emoji, so it matches Bao's style in both themes). */
export function BambooIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="9.5" y="2" width="5" height="20" rx="2.5" fill="var(--bamboo)" />
      <path d="M9.5 8.5h5M9.5 15h5" stroke="var(--bamboo-dark)" strokeWidth="1.4" />
      <path d="M14.5 6c3-1.5 5-1 6-3-2.5-.5-5 0-6 2.2z" fill="var(--bamboo)" />
    </svg>
  );
}
