"use client";

/**
 * A soft two-note chime for Focus Guard's "eyes back on the game" alert, synthesised with Web Audio
 * (no sound file to load). Quiet, short and pleasant on purpose: a nudge, not an alarm. The player has
 * already clicked Start, so the browser allows audio.
 */
let ctx: AudioContext | null = null;

export function playFocusChime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t0 + i * 0.16;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    }
  } catch {
    // No audio on this device: the banner alone does the job.
  }
}

const MUTE_KEY = "focusGuardMuted";

export function isChimeMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChimeMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}
