"use client";

import { prefersReducedMotion } from "./CountUp";

/** A short burst of confetti in the brand colours. Loaded on demand; nothing under reduced motion. */
export async function celebrate() {
  if (prefersReducedMotion()) return;
  const { default: confetti } = await import("canvas-confetti");
  const colors = ["#00b5e2", "#e87722", "#3f9b4f", "#ffffff"];
  confetti({ particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.7 }, colors, disableForReducedMotion: true });
}
