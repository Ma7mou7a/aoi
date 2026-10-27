"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BambooIcon } from "./BambooIcon";

export const BAMBOO_EVENT = "ai4b:bamboo";
/** Tell the header counter about new bamboo: a new total, or a delta to add. */
export const announceBamboo = (detail: { total?: number; delta?: number }) => window.dispatchEvent(new CustomEvent(BAMBOO_EVENT, { detail }));

/** Bamboo total in the header; bumps (scale only) whenever it changes. */
export function BambooCounter({ initial }: { initial: number }) {
  const [total, setTotal] = useState(initial);
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => setTotal(initial), [initial]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ total?: number; delta?: number }>).detail;
      setTotal((t) => d.total ?? t + (d.delta ?? 0));
      el.current?.classList.remove("bump");
      void el.current?.offsetWidth;
      el.current?.classList.add("bump");
    };
    window.addEventListener(BAMBOO_EVENT, on);
    return () => window.removeEventListener(BAMBOO_EVENT, on);
  }, []);
  return (
    <Link href="/profile#badges" className="glass flex h-9 items-center gap-1.5 rounded-lg px-2.5 font-semibold tabular-nums transition hover:border-brand" aria-label={`${total} bamboo. See your badges`}>
      <BambooIcon className="h-5 w-5" />
      <span ref={el}>{total}</span>
    </Link>
  );
}
