import type { Dimension } from "../dimensions/schema";

/**
 * Brain Twin state for one dimension: a Normal belief over ability on a 0..1 scale (shown as %).
 * Updated with a 1-D Kalman filter: drift between sessions widens the band, every block narrows it.
 */
export type Posterior = {
  mean: number;
  sd: number;
  nObservations: number;
  nTrials: number;
  /** ISO time of the last update; drift is applied from here. */
  updatedAt: string;
};

/** z for a two-sided 90% interval. */
export const Z90 = 1.6449;
/** The band can never get tighter than this: task scores are never that precise. */
export const MIN_SD = 0.03;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function priorFor(dim: Dimension, now = new Date()): Posterior {
  return { mean: dim.profile.prior.mean, sd: dim.profile.prior.sd, nObservations: 0, nTrials: 0, updatedAt: now.toISOString() };
}

/** Widen the band for time passed since the last update (ability can change; we're less sure). */
export function applyDrift(p: Posterior, dim: Dimension, now = new Date()): Posterior {
  const days = Math.max(0, (now.getTime() - new Date(p.updatedAt).getTime()) / 86_400_000);
  const q = dim.profile.uncertainty.drift_sd_per_day;
  const sd = Math.min(dim.profile.prior.sd, Math.sqrt(p.sd ** 2 + q * q * days));
  return { ...p, sd: Math.max(sd, p.sd), updatedAt: now.toISOString() };
}

/** Precision-weighted Normal–Normal update with one block observation. */
export function updatePosterior(p: Posterior, observation: number, observationSd: number, nTrials: number, now = new Date()): Posterior {
  const priorPrec = 1 / p.sd ** 2;
  const obsPrec = 1 / observationSd ** 2;
  const prec = priorPrec + obsPrec;
  return {
    mean: clamp01((p.mean * priorPrec + observation * obsPrec) / prec),
    sd: Math.max(MIN_SD, Math.sqrt(1 / prec)),
    nObservations: p.nObservations + 1,
    nTrials: p.nTrials + nTrials,
    updatedAt: now.toISOString(),
  };
}

export function credibleInterval(p: Pick<Posterior, "mean" | "sd">, z = Z90): [number, number] {
  return [clamp01(p.mean - z * p.sd), clamp01(p.mean + z * p.sd)];
}

/** SD after a hypothetical observation with noise `obsSd`: how much one more block would tighten the band. */
export function expectedPosteriorSd(sd: number, obsSd: number): number {
  return Math.max(MIN_SD, Math.sqrt(1 / (1 / sd ** 2 + 1 / obsSd ** 2)));
}

export const toPercent = (x: number) => Math.round(x * 100);
