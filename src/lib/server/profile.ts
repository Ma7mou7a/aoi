import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getDimensions } from "../dimensions/loader";
import { applyDrift, credibleInterval, priorFor, type Posterior } from "../profiler";

/** Current Brain Twin state: latest snapshot per dimension (or the prior), widened for time passed. */
export async function getPosteriors(userId: string, now = new Date()): Promise<Record<string, Posterior>> {
  const latest = await db
    .selectDistinctOn([schema.profileSnapshots.dimensionId])
    .from(schema.profileSnapshots)
    .where(eq(schema.profileSnapshots.userId, userId))
    .orderBy(schema.profileSnapshots.dimensionId, desc(schema.profileSnapshots.createdAt));
  const byDim = new Map(latest.map((s) => [s.dimensionId, s]));

  return Object.fromEntries(
    getDimensions().map((dim) => {
      const s = byDim.get(dim.id);
      const p: Posterior = s
        ? { mean: s.mean, sd: s.sd, nObservations: s.nObservations, nTrials: s.nTrials, updatedAt: s.createdAt.toISOString() }
        : priorFor(dim, now);
      return [dim.id, applyDrift(p, dim, now)];
    }),
  );
}

export type ProfileView = {
  dimensions: Array<{
    id: string;
    name: string;
    color: string;
    definition: string;
    mean: number;
    sd: number;
    ci: [number, number];
    nObservations: number;
    nTrials: number;
    /** `measured` is false for the starting prior (not a real estimate). */
    history: Array<{ at: string; mean: number; ciLow: number; ciHigh: number; measured: boolean }>;
  }>;
};

export async function getProfileView(userId: string): Promise<ProfileView> {
  const posteriors = await getPosteriors(userId);
  const history = await db
    .select()
    .from(schema.profileSnapshots)
    .where(eq(schema.profileSnapshots.userId, userId))
    .orderBy(asc(schema.profileSnapshots.createdAt));

  return {
    dimensions: getDimensions().map((dim) => {
      const p = posteriors[dim.id];
      return {
        id: dim.id,
        name: dim.name,
        color: dim.color,
        definition: dim.card.definition.trim(),
        mean: p.mean,
        sd: p.sd,
        ci: credibleInterval(p),
        nObservations: p.nObservations,
        nTrials: p.nTrials,
        history: history
          .filter((h) => h.dimensionId === dim.id)
          .map((h) => ({ at: h.createdAt.toISOString(), mean: h.mean, ciLow: h.ciLow, ciHigh: h.ciHigh, measured: h.trigger !== "prior" })),
      };
    }),
  };
}

export async function getSessionForUser(sessionId: string, userId: string) {
  const [s] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)));
  return s ?? null;
}
