"use client";

import { animate } from "motion";
import { useEffect, useRef } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that counts from `from` to `to`. Writes straight to the DOM (no React state per frame);
 * the final value is in the markup from the start, so screen readers and reduced motion get it at once.
 */
export function CountUp({ from, to, durationMs = 800, suffix = "" }: { from: number; to: number; durationMs?: number; suffix?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || from === to || prefersReducedMotion()) return;
    const controls = animate(from, to, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [from, to, durationMs, suffix]);
  return (
    <span ref={el} className="tabular-nums" aria-label={`${to}${suffix}`}>
      {to}
      {suffix}
    </span>
  );
}
