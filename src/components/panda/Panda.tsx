"use client";

import { useEffect, useId, useRef } from "react";
import type { PandaState } from "@/lib/panda/bus";

const LABEL: Record<PandaState, string> = {
  idle: "relaxing",
  wave: "waving hello",
  watch: "watching you play",
  think: "thinking",
  cheer: "cheering",
  proud: "looking proud",
  oops: "covering his eyes",
  sleep: "asleep",
  celebrate: "celebrating",
  quiet: "watching quietly",
  calm: "smiling",
};

/**
 * Bao the panda. Pure SVG + CSS keyframes (globals.css, `.bao…`), switched by `data-state`; every
 * animation moves only transform/opacity. In `watch` the pupils follow the pointer, written straight
 * to the DOM (no React state per frame). Under reduced motion every pose is static.
 */
export function Panda({ state, size = 120, className = "" }: { state: PandaState; size?: number; className?: string }) {
  const pupils = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  // A blink offset per instance (same on server and client), so several pandas don't blink in sync.
  const uid = useId();
  const blinkDelay = `${([...uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 300) / 100}s`;

  useEffect(() => {
    const el = pupils.current;
    if (!el) return;
    if (state !== "watch") {
      el.style.transform = state === "think" ? "translate(1.5px, -2.5px)" : "";
      return;
    }
    const onMove = (e: PointerEvent) => {
      const box = svg.current?.getBoundingClientRect();
      if (!box) return;
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height * 0.43);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(3, d / 40) / d;
      el.style.transform = `translate(${(dx * k).toFixed(2)}px, ${(dy * k).toFixed(2)}px)`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [state]);

  return (
    <svg ref={svg} viewBox="0 0 120 120" width={size} height={size} className={`bao ${className}`} data-state={state} role="img" aria-label={`Bao the panda, ${LABEL[state]}`}>
      <g className="bao-all">
        <g className="bao-body">
          <ellipse cx="60" cy="98" rx="30" ry="21" fill="var(--panda-fur)" stroke="var(--panda-line)" strokeWidth="1.2" />
          <ellipse cx="60" cy="104" rx="17" ry="11" fill="var(--panda-belly)" />
          <ellipse cx="44" cy="115" rx="9" ry="5" fill="var(--panda-ink)" />
          <ellipse cx="76" cy="115" rx="9" ry="5" fill="var(--panda-ink)" />
        </g>
        <g className="bao-head">
          <circle cx="33" cy="25" r="11" fill="var(--panda-ink)" stroke="var(--panda-line)" strokeWidth="1.2" />
          <circle cx="87" cy="25" r="11" fill="var(--panda-ink)" stroke="var(--panda-line)" strokeWidth="1.2" />
          <circle cx="60" cy="52" r="33" fill="var(--panda-fur)" stroke="var(--panda-line)" strokeWidth="1.2" />
          <ellipse cx="45" cy="52" rx="9.5" ry="12.5" transform="rotate(28 45 52)" fill="var(--panda-ink)" />
          <ellipse cx="75" cy="52" rx="9.5" ry="12.5" transform="rotate(-28 75 52)" fill="var(--panda-ink)" />
          <g className="bao-eyes" style={{ animationDelay: blinkDelay }}>
            <circle cx="46.5" cy="51" r="5" fill="var(--panda-eye)" />
            <circle cx="73.5" cy="51" r="5" fill="var(--panda-eye)" />
            <g ref={pupils} className="bao-pupils">
              <circle cx="47" cy="51.5" r="2.6" fill="var(--panda-ink)" />
              <circle cx="73" cy="51.5" r="2.6" fill="var(--panda-ink)" />
            </g>
          </g>
          <path className="bao-closed" d="M41.5 52 q5 4 10 0 M68.5 52 q5 4 10 0" fill="none" stroke="var(--panda-eye)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="38" cy="66" r="4.5" fill="var(--panda-blush)" opacity="0.45" />
          <circle cx="82" cy="66" r="4.5" fill="var(--panda-blush)" opacity="0.45" />
          <ellipse cx="60" cy="63.5" rx="4.6" ry="3.2" fill="var(--panda-ink)" />
          <path className="bao-mouth" d="M55 68.5 q5 4.5 10 0" fill="none" stroke="var(--panda-ink)" strokeWidth="1.8" strokeLinecap="round" />
          <ellipse className="bao-mouth-open" cx="60" cy="70" rx="4" ry="3.2" fill="var(--panda-mouth)" />
        </g>
        <g className="bao-paw-left">
          <ellipse cx="35" cy="92" rx="8" ry="10" fill="var(--panda-ink)" />
        </g>
        <g className="bao-paw-right">
          <rect x="84" y="62" width="5" height="44" rx="2.5" fill="var(--bamboo)" />
          <path d="M84 76 h5 M84 90 h5" stroke="var(--bamboo-dark)" strokeWidth="1.4" />
          <path d="M89 66 q8 -4 10 -10 q-8 1 -10 8" fill="var(--bamboo)" />
          <ellipse cx="85" cy="92" rx="8" ry="10" fill="var(--panda-ink)" />
        </g>
        <g className="bao-zzz" aria-hidden fill="var(--brand)" fontFamily="var(--font-display-face), sans-serif" fontSize="12">
          <text x="92" y="20">z</text>
          <text x="100" y="10" fontSize="9">z</text>
        </g>
      </g>
    </svg>
  );
}
