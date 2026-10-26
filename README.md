# AI4Brain: Cognitive Growth Agent

CISTAC 1.0 entry. A non-clinical agent that continuously assesses six cognitive dimensions, keeps an uncertainty-aware **Brain Twin** profile, coaches with evidence-linked explanations, and adapts exercises and weekly plans.

## Dimensions

Each dimension is one YAML file in [`dimensions/`](dimensions). The file holds its measurement card (definition, citations, biases) and its engine config (tasks, difficulty levels, scoring formula, prior, uncertainty). **To add a dimension, add a file. No code change or migration is needed.**

| Dimension | Task | Paradigm reference |
|-|-|-|
| Working memory | N-back | Kirchner 1958; Owen et al. 2005 |
| Attention & inhibition | Colour-word Stroop | Stroop 1935; MacLeod 1991 |
| Processing speed | Symbol-digit coding | Smith 1982; Salthouse 1996 |
| Cognitive flexibility | Number task switching | Rogers & Monsell 1995; Monsell 2003 |
| Visuospatial memory | Corsi blocks | Corsi 1972; Kessels et al. 2000 |
| Reasoning | Generated pattern matrices | Raven 2000; Matzen et al. 2010 |

**Scoring pipeline (per block):** metrics → each normalised to 0..1 → weighted composite → mapped into the difficulty level's `ability_range` → one observation with noise `obs_sd · √(reference_trials / valid_trials)`. Invalid blocks (near chance, response streaks, too few valid trials) get `× invalid_block_sd_multiplier`. A Normal–Normal Bayesian update then gives the posterior mean ± 90% credible interval, stored as a profile snapshot.

## Getting started

```bash
npm install
npm run db:migrate   # creates the embedded PGlite DB in ./.pglite (no Postgres install needed)
npm run dims:check   # validates every dimensions/*.yaml
npm run dev
```

To use real Postgres instead, run `docker compose up -d` and set `DATABASE_URL` (see `.env.example`).

> **PGlite tip:** stop the dev server with Ctrl+C, not by killing the process. PGlite only writes its data to disk safely on a clean close. If the app logs `PGlite could not open ./.pglite`, rename that folder and run `npm run db:migrate` to start fresh. Use real Postgres for any data you care about.

| Script | Purpose |
|-|-|
| `dims:check` | Validate dimension configs (schema, weights sum to 1, levels ascending, ids unique) |
| `db:generate` / `db:migrate` | Generate SQL from `src/db/schema.ts` / apply it |
| `db:studio` | Browse the database |
| `typecheck`, `lint`, `build` | CI checks |

## Data model

`src/db/schema.ts`. Every user-owned table cascades on user delete (one-click delete), and `deletion_log` keeps only a hash as proof.

- **Ethics:** `users` (retention days), `consents` (append-only history; camera/mic off by default), `deletion_log`
- **Assessment:** `sessions` (non-biometric by default) → `task_runs` (one block, with selection reason, metrics, observation, validity) → `trials` (stimulus, response, RT, outcome, behaviour)
- **Brain Twin:** `profile_snapshots` (append-only history = the twin), `projections` (always with a band)
- **Coach:** `coach_messages` (claims carry evidence trial and run ids; planted flaw; filtered clinical terms)
- **AI Collaboration Score:** `collab_events` (raw signals per component) → `collab_scores` (0–100 + components + weights + formula version)
- **Adaptive learning:** `plans` → `plan_items`, `goals`

## Ethics

Non-clinical by design: no diagnostic terms, and no decision is based on camera or voice alone. Users are only ever compared with themselves.
