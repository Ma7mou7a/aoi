/**
 * Focus Guard, the pure part: is this camera frame "looking away", and which trials overlapped a moment
 * of looking away? The browser side (useFocusGuard) feeds it MediaPipe face landmarks; nothing here
 * sees an image, and only one boolean per trial ever leaves the device.
 */

/** What one frame of the face model tells us. No face = null pose. */
export type GazeFrame = {
  pose: { yawDeg: number; pitchDeg: number } | null;
  /** Strongest sideways or vertical eye-look blendshape, 0..1 (iris near the eye corner or lid). */
  eyeAway: number;
};

/** Tolerance cone: a person reading the screen stays well inside it. */
export const GAZE_LIMITS = { yawDeg: 28, pitchDeg: 22, eyeAway: 0.65 } as const;
/** Looking away must last this long to count, so blinks and glances at the keyboard are ignored. */
export const AWAY_MIN_MS = 400;
/** A game is flagged when more than this share of its scored trials overlapped looking away. */
export const AWAY_FLAG_SHARE = 0.25;

export function isLookingAway(f: GazeFrame): boolean {
  if (!f.pose) return true; // no face in view
  return Math.abs(f.pose.yawDeg) > GAZE_LIMITS.yawDeg || Math.abs(f.pose.pitchDeg) > GAZE_LIMITS.pitchDeg || f.eyeAway > GAZE_LIMITS.eyeAway;
}

/**
 * Head yaw and pitch (degrees) from MediaPipe's 4×4 facial transformation matrix (column-major).
 * Rotation part R: yaw = atan2(-r20, sqrt(r00² + r10²)), pitch = atan2(r21, r22).
 */
export function poseFromMatrix(m: ArrayLike<number>): { yawDeg: number; pitchDeg: number } {
  const r = (row: number, col: number) => m[col * 4 + row];
  const deg = 180 / Math.PI;
  const yaw = Math.atan2(-r(2, 0), Math.hypot(r(0, 0), r(1, 0)));
  const pitch = Math.atan2(r(2, 1), r(2, 2));
  return { yawDeg: yaw * deg, pitchDeg: pitch * deg };
}

const EYE_AWAY = ["eyeLookOutLeft", "eyeLookOutRight", "eyeLookInLeft", "eyeLookInRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight"];

/** Strongest eye-look blendshape. Looking down to the keyboard is normal, so "down" counts at half weight. */
export function eyeAwayScore(blendshapes: Array<{ categoryName: string; score: number }>): number {
  let best = 0;
  for (const b of blendshapes) {
    if (!EYE_AWAY.includes(b.categoryName)) continue;
    best = Math.max(best, b.categoryName.startsWith("eyeLookDown") ? b.score * 0.5 : b.score);
  }
  return best;
}

export type Interval = { start: number; end: number };

/**
 * Turns a stream of per-frame verdicts into away intervals (epoch ms), keeping only those that last
 * at least AWAY_MIN_MS. Call push() per frame and close() at the end.
 */
export function createAwayTracker(minMs = AWAY_MIN_MS) {
  const intervals: Interval[] = [];
  let since: number | null = null;
  const end = (t: number) => {
    if (since !== null && t - since >= minMs) intervals.push({ start: since, end: t });
    since = null;
  };
  return {
    push(t: number, away: boolean) {
      if (away && since === null) since = t;
      else if (!away) end(t);
    },
    close(t: number) {
      end(t);
      return intervals;
    },
    intervals: () => intervals,
  };
}

/** Looking away this long during a game brings up the "eyes back on the game" alert. */
export const ALERT_AFTER_MS = 1500;

/**
 * Decides when to show the alert: on after ALERT_AFTER_MS of continuous looking away, off the moment
 * the player looks back. A blink or a glance at the keyboard never triggers it.
 */
export function createAlertGate(afterMs = ALERT_AFTER_MS) {
  let since: number | null = null;
  return (t: number, away: boolean): boolean => {
    if (!away) {
      since = null;
      return false;
    }
    since ??= t;
    return t - since >= afterMs;
  };
}

/** Default time a trial is "live" when it has no response time (a missed or timed-out trial). */
export const TRIAL_WINDOW_MS = 2000;

/**
 * Marks each trial whose live window [shownAt, shownAt + rt] overlaps an away interval. Trials without
 * a shownAt are left as they are.
 */
export function markLookedAway<T extends { shownAt?: string; rtMs: number | null }>(trials: T[], intervals: Interval[]): Array<T & { lookedAway?: boolean }> {
  if (!intervals.length) return trials;
  return trials.map((t) => {
    if (!t.shownAt) return t;
    const start = Date.parse(t.shownAt);
    if (!Number.isFinite(start)) return t;
    const end = start + (t.rtMs ?? TRIAL_WINDOW_MS);
    const away = intervals.some((i) => i.start < end && i.end > start);
    return away ? { ...t, lookedAway: true } : t;
  });
}
