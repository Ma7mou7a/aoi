"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BambooCounter } from "./rewards/BambooCounter";

/** Signed-out visitors see the public pages; the app pages would only send them back home. */
const PUBLIC_LINKS = [
  { href: "/try", label: "Try the tasks" },
  { href: "/skills", label: "Science" },
  { href: "/validation", label: "Validation" },
];

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/play", label: "Assess" },
  { href: "/play?mode=training", label: "Train" },
  { href: "/coach", label: "Coach" },
  { href: "/skills", label: "Science" },
  { href: "/settings", label: "Settings" },
];

/** Small mark: half folds, half circuit. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="none" stroke="var(--brand)" strokeOpacity="0.5" />
      <path d="M15.5,6 C10,6 6,10 6,15.5 C6,21 10,26 15.5,26 Z" fill="#c7d7e8" />
      <path d="M9,11 q3,-2 4,1 q-3,2 0,4 M8.5,18 q3,-1 4,2 M11,23 q2,-2 4,-1" fill="none" stroke="#5f7f9f" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M16.5,6 C22,6 26,10 26,15.5 C26,21 22,26 16.5,26 Z" fill="#0a2d66" />
      <path d="M17,10 h4 l2,2 M17,15 h6 M17,20 h3 l2,2" fill="none" stroke="#62e4ff" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="23" cy="12" r="1.3" fill="#62e4ff" /><circle cx="23.5" cy="15" r="1.3" fill="var(--accent)" /><circle cx="22" cy="22" r="1.3" fill="#62e4ff" />
    </svg>
  );
}

function NavLinks({ onNavigate, signedIn }: { onNavigate?: () => void; signedIn: boolean }) {
  const path = usePathname();
  const mode = useSearchParams().get("mode");
  const active = (href: string) => {
    const [p, q] = href.split("?");
    if (p === "/play") return path === "/play" && (q ? mode === "training" : mode !== "training");
    return path === p || path.startsWith(`${p}/`);
  };
  return (
    <>
      {(signedIn ? LINKS : PUBLIC_LINKS).map((l) => (
        <Link key={l.href} href={l.href} onClick={onNavigate} aria-current={active(l.href) ? "page" : undefined}
          className={`relative px-1 py-1 font-display text-[15px] tracking-wider uppercase transition-colors after:absolute after:inset-x-1 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-transform ${
            active(l.href) ? "text-foreground after:scale-x-100 after:bg-brand" : "text-slate-500 hover:text-foreground after:scale-x-0 dark:text-slate-300"
          }`}>
          {l.label}
        </Link>
      ))}
    </>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"), []);
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  };
  return (
    <button onClick={flip} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className="glass grid h-9 w-9 place-items-center rounded-lg text-foreground transition hover:border-brand">
      {theme === "light" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      )}
    </button>
  );
}

export function SiteHeader({ signedIn, bamboo }: { signedIn: boolean; bamboo?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-3 z-40 mx-auto mt-3 max-w-6xl px-4">
      <div className="glass flex items-center justify-between gap-4 rounded-2xl px-4 py-2.5 shadow-[0_22px_70px_rgba(0,40,85,0.25)]">
        <Link href="/" className="flex items-center gap-2" aria-label="AI4Brain home">
          <LogoMark />
          <span className="font-display text-2xl leading-none tracking-wide">
            <span className="text-brand">AI4</span>BRAIN
          </span>
        </Link>
        <nav className="hidden items-center gap-5 lg:flex" aria-label="Main">
          <Suspense><NavLinks signedIn={signedIn} /></Suspense>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn && bamboo != null && <BambooCounter initial={bamboo} />}
          <ThemeToggle />
          {!signedIn && (
            <Link href="/signin" className="glass hidden rounded-lg px-3 py-2 font-display text-[15px] tracking-wider uppercase transition hover:border-brand sm:block">
              Sign in
            </Link>
          )}
          <Link href={signedIn ? "/play" : "/start"} className="hidden rounded-lg bg-brand px-4 py-2 font-display text-[15px] tracking-wider text-white uppercase dark:text-slate-950 shadow-[0_0_24px_rgba(0,181,226,0.35)] transition hover:bg-brand-2 sm:block">
            {signedIn ? "Start playing" : "Get started"}
          </Link>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu" className="glass grid h-9 w-9 place-items-center rounded-lg lg:hidden">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} /></svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="glass mt-2 flex flex-col gap-2 rounded-2xl p-4 lg:hidden" aria-label="Main">
          <Suspense><NavLinks signedIn={signedIn} onNavigate={() => setOpen(false)} /></Suspense>
          {!signedIn && <Link href="/signin" onClick={() => setOpen(false)} className="px-1 py-1 font-display text-[15px] tracking-wider text-brand uppercase">Sign in</Link>}
        </nav>
      )}
    </header>
  );
}
