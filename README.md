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

## AI coach

`/coach` gives feedback in which every statement links to the exact blocks and trials behind it.

1. **Evidence pack** (`src/lib/coach/evidence.ts`): skill estimates with bands, the last 6 blocks, and trial groups (e.g. "5 matches you caught"). Each item gets a short reference (`R1`, `T3`); database ids never reach the model.
2. **Draft:** with the user's `llm_coaching` consent, Claude (`claude-opus-5-5`, structured JSON output, server-side refusal fallback) writes 2–4 claims, each citing references. Without consent or API access, a deterministic rule-based coach writes the draft from the same pack.
3. **Checks** (`src/lib/coach/claims.ts`, `safety.ts`): references are resolved to database ids, and claims that cite nothing valid are dropped. Every text passes a clinical-term filter: diagnostic language drops the claim, and medical-sounding words are rewritten. Questions about health conditions always get a non-clinical answer first. Dropped claims and filtered terms are stored for auditing and shown to the user.

Set `ANTHROPIC_API_KEY` to enable the AI coach (see `.env.example`).

## AI Collaboration Score

`score = round(100 × Σ w_c × s_c)`, where `s_c = (Σ signal values + 0.5 × 2) / (n_c + 2)` for each of five components: clarification 20%, critical verification 25%, iteration 20%, autonomy 20%, responsible use 15%. The signals come from real interactions: opening evidence, marking claims right or off, predicting before a debrief, follow-up questions, acting on advice. In the opt-in **spot-the-error mode**, some debriefs carry one deliberate number error that the user can catch by checking the evidence, and it is always revealed afterwards. Full formula, signal table and limitations: [docs/collaboration-score.md](docs/collaboration-score.md).

## Privacy & data (`/settings`)

Consents can be changed at any time; each change is stored as a new row, so there is a full history. Users can also choose how long data is kept (30, 90, 180 or 365 days; older data is purged when that setting changes and at every session start), download all their data as JSON, and delete everything with one click. Camera and microphone are never used.

## Ethics

Non-clinical by design: no diagnostic terms, and no decision is based on camera or voice alone. Users are only ever compared with themselves.
