# AI4Brain: an uncertainty-aware, evidence-linked cognitive growth agent

**CISTAC 1.0 · AI4Brain challenge · Technical report**
Team: *[team name and members]* · Repository: https://github.com/ChaimaGhazali/aoi

## 1. Summary

AI4Brain is a non-clinical agent that **assesses** six cognitive skills with classic cognitive-science tasks, **understands** the results as a Bayesian profile in which every estimate carries a 90% credible band (the *Brain Twin*), **coaches** with natural-language claims that are each linked to the exact trials behind them, and **improves** the user with adaptive difficulty, weekly plans and goals.

Three design choices set it apart:

1. **Transparent statistics, not a black box.** Scoring and profiling are explicit formulas over configuration, so every number can be explained. The language model only writes language, constrained to an evidence pack and re-checked in code.
2. **Measured, not claimed.** We ran 500 simulated users with known abilities through the real pipeline. After calibration the 90% bands contain the true ability **89–96%** of the time, mean error is **±5–11%**, adaptive block selection is **12% more accurate** than random order at equal effort, **99%** of invalid play is flagged with **2%** false alarms, 7-day forecasts have calibrated bands (TADPOLE-style CPA 0.007), and slower but equally accurate users are not penalised (bias under 2 points outside processing speed).
3. **Generalisable by configuration.** A skill is a YAML file. A new skill reusing any of the six task types is added with one command and no code change, which is how we prepare for the surprise element.

## 2. Cognitive dimensions and tasks

The brief refers to a list of dimensions in Section 3 that does not appear in the published document. We chose six skills that are widely studied, measurable in a browser in about a minute, and covered by classic paradigms with trial-level data:

| Skill | Task | Main measures | Reference |
|-|-|-|-|
| Working memory | Letter N-back (1/2/3-back) | d′ (log-linear corrected), hit RT | Kirchner 1958; Owen et al. 2005 |
| Attention & inhibition | Colour-word Stroop | interference cost (RT), incongruent accuracy | Stroop 1935; MacLeod 1991 |
| Processing speed | Symbol-digit coding (key reshuffled per block; hidden key at level 3) | correct/min, accuracy | Smith 1982; Salthouse 1996 |
| Cognitive flexibility | Number task switching (parity / magnitude) | switch cost (RT, errors) | Rogers & Monsell 1995; Monsell 2003 |
| Visuospatial memory | Corsi blocks with an in-block span staircase (backward at level 3) | span, total score | Corsi 1972; Kessels et al. 2000 |
| Reasoning | **Generated** Raven-style 3×3 matrices (Latin-square / progression rules, one-attribute distractors) | accuracy | Raven 2000; Matzen et al. 2010 |

Each skill has a **measurement card** (definition, what it is *not*, task, levels, scoring, uncertainty, data-quality checks, known biases, references) generated from its configuration and shown in the app (`/skills`, `docs/measurement-cards.md`). Every trial stores the stimulus, response, correctness, response time and behaviour signals (window focus loss, answer changes), which covers the brief's score, response time, error rate and behaviour. Assessment is **non-biometric only**. Like jsPsych, the research standard for browser experiments, each stimulus onset is time-stamped at the animation frame that paints it (`requestAnimationFrame`), so response times are measured from what the user actually saw. We kept our own renderers rather than embedding jsPsych because every block must feed the live profile and the adaptive selector inside one typed app.

## 3. From trials to the Brain Twin

**Block score.** Each task's metrics are normalised linearly to 0–1 and combined with configured weights into a composite *c* (e.g. working memory: 0.8·d′ + 0.2·speed). The composite is mapped onto the 0–1 ability scale through the difficulty level's range: *observation = lo + (hi − lo)·c*. A strong 3-back block therefore counts for more than an equally good 1-back block, so making a task harder never lowers a user's estimate.

**Data quality.** A block is flagged when it has too few valid trials, accuracy not above chance (binomial margin), long runs of identical answers, many anticipations (faster than a configured minimum RT) or timeouts, or repeated focus loss. A flagged block still counts, but with **2.5×** the noise; a block at the floor or ceiling of its level counts with 1.5×.

**Bayesian update.** Each skill's ability is a Normal belief (prior 50% ± 33 points, 90% band). A block is an observation with noise *σ·√(n_ref/n_valid)*, combined by a precision-weighted (1-D Kalman) update. Between sessions the variance grows by *q²·days* (*q* = 0.03/day), so the twin can follow real change and does not become over-confident. Snapshots are append-only, which gives the required history.

**Forecast.** A weighted linear trend over the twin's own history (weights 1/σ²) is extended from today's estimate, with a band that combines today's uncertainty, the uncertainty of the trend and drift, and a cap on plausible growth. Every week a 7-day forecast is stored; once it is due, the dashboard shows whether the real estimate landed inside it (**the twin's track record**). Forecasts are labelled "a forecast, not a promise".

## 4. Adaptive assessment and learning

**Which block next (assessment).** For every playable skill, task and level, the selector computes the expected reduction of the band, *σ − (σ⁻² + σ_obs⁻²)^−½*, with the observation noise inflated where the user is expected to hit a level's floor or ceiling, and it picks the largest. Repeats are lightly penalised, and assessment stops once every band is narrow enough. Each choice comes with a plain-language reason ("Your attention estimate is still ±33% wide; one Stroop block at level 2 should narrow it to about ±18%").

**Training.** The training mode focuses on the weakest skill at the level where the expected success is closest to the task's target (≈75%), then follows a 1-up/1-down staircase.

**Weekly plan.** Twelve blocks are allocated by *priority = 0.6·(band width / prior width) + 0.4·(room to grow)*, with unmeasured skills first. Each item has a target level and a reason. The plan is rebuilt weekly, or on demand, and stores the profile snapshots it was built from.

**Goals.** Score goals count as reached only when the **whole 90% band** is above the target. Until then the app shows the probability that the user is already there (e.g. "6% likely you're already at 70%+"). Consistency goals count sessions. After each block the user sees concrete wins compared only with their own history (a new personal best at that level, a new highest estimate, a 3/5/7/14/30-day streak).

**Dashboard.** The dashboard shows a radar of the current profile with the band as a shaded ring, small-multiple progress curves with bands and the dashed forecast, a skill × day heatmap (practice or performance view), a day streak, a 7-day forecast sentence, goals, the plan and stat tiles. Every chart has a table view. Colours come from a palette validated for colour-vision deficiency in light and dark mode.

## 5. AI coach

**Architecture.**

1. The server builds an **evidence pack**: skill estimates with bands, the last six blocks with metrics and reliability, and grouped trial facts ("5 matches you caught"). Each item gets a short reference (R1, T3); no names or database IDs leave the server.
2. The LLM (Claude `claude-opus-5-5` when an Anthropic key is set, otherwise `gpt-oss-120b` on Groq; both with strict JSON-schema output) receives the pack and a short policy (non-clinical, cite references, mention uncertainty, compare only with the user's own history) and returns **structured JSON**: a summary, 2–4 claims each with "why" and references, and a next step.
3. The server maps references back to blocks and trials and **drops any claim without valid evidence**. A **clinical-term filter** removes any claim with diagnostic language and rewrites medical-sounding words, and a **norm filter** removes any sentence comparing the user with other people or averages. A question about a health condition always gets a fixed non-clinical answer first.
4. **Science explains, your data decides.** Alongside the pack, the server selects up to 8 relevant **science cards** from `science/findings.yaml`: 13 reviewed, non-clinical findings (practice effects, the reliability of difference scores, spacing, the difficulty sweet spot, chunking, switch preparation and others), each with its citation and link. The model may cite them as S# to explain *why* something happened or *what tends to help*, but every claim must still cite the user's own R#/T# evidence. A claim backed only by science is dropped, unknown S# references are logged, and findings can never be used to compare the user with others. In the app, each claim shows its sources as "Science: …" chips that open the finding and the paper.
5. Without the user's consent to AI coaching, or if the API fails, a **deterministic rule-based coach** writes the claims from the same pack and goes through the same checks.

**Why this design.** The LLM is good at language but must not invent facts or medicalise results. Forcing citations and verifying them in code turns explainability from a promise into a check the user can perform: every claim has a "See the evidence" button that opens the exact trials.

## 6. AI Collaboration Score

*score = round(100 · Σ w_c · s_c)*, where *s_c = (Σ v_i + 0.5·2) / (n_c + 2)* is a Bayesian-smoothed mean of the signal values *v_i* ∈ [0, 1] for each component *c*. The weights follow the brief: clarification 20%, critical verification 25%, iteration 20%, autonomy 20%, responsible use 15%. There are 16 signals, each emitted by a concrete action. Examples:

- opening the evidence (0.8), confirming a claim after checking it (1.0) or without checking (0.3);
- predicting before a debrief whether the last session went better, the same or worse (correct 1.0, wrong 0.6, skipped 0.2);
- follow-up questions, acting on the coach's suggested next step;
- in-scope vs health questions, reviewing privacy settings.

**Spot-the-error mode** (opt-in) makes critical verification measurable. About a third of debriefs carry one deterministic number change in a claim's "why"; the evidence is never altered. The client cannot see which claim is affected, and every planted error is revealed and corrected after the user answers. The formula and its limits are documented in `docs/collaboration-score.md`.

## 7. Bonus features

- **Predictive growth:** the forecasts with bands and the track record (Section 3).
- **Emotion-aware (from behaviour only):** fatigue (slowing within a block, session length, focus loss) and frustration (miss streaks, a drop against an earlier block, abandoned blocks) are inferred with simple, documented rules, shown with their cues as a dismissible guess, and used only to suggest a break or ease the next training block by one level. No camera or microphone input is ever used for this.
- **Voice coaching:** coach messages can be read aloud with the browser's speech synthesis; questions can be dictated (with microphone consent), and the transcript is reviewed before sending. No audio is stored.

## 8. Validation with simulated users

**Set-up.** Each simulated user has a known latent ability per skill (*N*(0.5, 0.18), clamped). Task simulators turn ability into trial-level behaviour (hit and false-alarm rates, interference, switch costs, spans, coding speed, puzzle accuracy). Each user does 18 blocks through the **real** selector, scoring and profiler. Calibration is fitted on 250 users and every result is reported on the other 250 (`npm run validate`, `docs/validation.md`, `/validation`).

**Calibration (per level).** The first run showed bands covering the truth only 62–76% of the time, with coverage *falling* as blocks accumulated. The hand-set level ranges were systematically biased, so errors did not average out. We fitted a measurement model per difficulty level, *c = a + b·ability + ε*, on blocks played at **random** levels (so every level gets data) and inverted it into the level's range. The residual noise became each skill's *σ*. The fit is written back into the YAML, so pilot data can refit it with no code change.

| Skill | r | Mean abs. error | 90% coverage (hand-set → fitted) |
|-|-|-|-|
| Working memory | 0.87 | 7.2% | 66% → **96%** |
| Attention & inhibition | 0.77 | 9.5% | 64% → **92%** |
| Processing speed | 0.90 | 5.8% | 62% → **93%** |
| Cognitive flexibility | 0.68 | 10.5% | 62% → **89%** |
| Visuospatial memory | 0.93 | 5.3% | 76% → **91%** |
| Reasoning | 0.90 | 6.0% | 67% → **92%** |

**Adaptive vs random selection** (RMSE across six skills, equal budget): 12.4% vs 13.6% after 6 blocks and **9.2% vs 10.4% after 18 blocks** (−12%). Bands are also narrower (σ 0.097 vs 0.106).

**Robustness** (200 blocks per cell): random answers 93–100% flagged, same-key, no-response and too-fast play 100%, genuine players 0–11% (n-back 11%, matrices 3%; the matrices chance-margin test was relaxed for 8-item blocks, a change this study prompted).

**Growth** (100 users improving working memory by 15 points over a month): the drift rate was swept, and *q* = 0.01/day is the smallest value that keeps final coverage ≥ 90% (92%). Improvement was detected for 67% of users; the estimate is deliberately cautious (3.5 of 11.7 points of true gain).

**Forecasts** (1,200 seven-day forecasts, scored like the TADPOLE Alzheimer's forecasting challenge): mean absolute error 7.7% (a no-change forecast: 7.4%), with 50% and 90% bands covering the truth 48% and 91% of the time (coverage probability accuracy 0.02 and 0.007). A first version extrapolated the raw two-week trend and lost to the no-change baseline (8.5% vs 7.0%), so the slope now has a Bayesian prior that shrinks noisy trends toward zero.

**Fairness** (inspired by the PREPARE challenge winners, who were judged on generalisation across populations): the same users were re-run with +80 ms device lag and with 30% slower, equally accurate responding. Scoring originally used raw milliseconds and overall speed, which put a slower person's attention estimate **14 points too low** (band coverage 54%). Attention and flexibility now use *proportional* costs (cost ÷ the person's own baseline response time) and working memory uses d′ alone, so the slower group's bias is under 2 points with 90–96% coverage. Processing speed still drops, by design: it *is* speed. The price is some accuracy for typical users (attention r 0.90 → 0.77), because in the simulator overall speed carried real signal. We chose fairness and say so.

## 9. Ethics, safety and robustness

- **Non-clinical:** clinical-term filter, fixed answer to health questions, "what it is not" on every card, no norms, comparisons only with the user's own history.
- **Consent and data:** opt-in, granular consents with an append-only history; user-chosen retention (30/90/180/365 days) enforced by purges; JSON export; one-click deletion that cascades through every table and leaves only a salted hash as proof. No email, password, real name, audio or images are collected. Only an evidence pack, with no identifiers, goes to the LLM, and only with consent.
- **No decision from face or voice:** there is no camera; voice is only an input method for questions.
- **Robustness:** cold start from an explicit prior; invalid, abandoned and too-fast blocks are flagged and down-weighted; the posterior SD has a floor; the coach falls back to rules if the API is unavailable.
- Full details: `docs/ethics.md`.

## 10. Engineering

Next.js 15 and TypeScript, Drizzle ORM on PostgreSQL (embedded PGlite for zero-setup demos), Recharts, Zod, the Anthropic SDK and Groq's OpenAI-compatible API. **104 unit tests** cover the scoring, profiler calibration, selector, the six task generators, coach safety, the collaboration score, plans, forecasts, affect and milestones. GitHub Actions runs the config check, typecheck, lint, tests, a 100-user validation smoke test and the build. Trials store their RNG seeds, so every block can be replayed. `npm run new-dimension` scaffolds a skill from any task type. A public `/try` gallery lets anyone play every task without an account.

## 11. Limitations and next steps

- **Simulated, not human, validation.** The study shows the pipeline is internally consistent, calibrated and robust. It does not show that the tasks measure cognition in real people. Next step: a pilot (e.g. 30 people × 2 sessions) to refit `profile.calibration` and the level ranges, and to estimate test–retest reliability.
- **Independent skills.** Real skills correlate. A hierarchical model could share information between them and speed up assessment.
- **Cognitive flexibility** recovers least well (r = 0.68) because switch costs are noisy (the reliability paradox: Hedge et al. 2018). More trials per block or an extra measure (e.g. mixing cost) would help.
- **Language and device.** Stroop requires fluent reading of English colour words, and response times depend on the device. Both are documented biases and mitigated by within-user comparison.
- **The AI Collaboration Score** is a design proposal. Its weights and signal values should be validated against expert ratings.

## References

Corsi 1972 · Hautus 1995 (log-linear d′ correction) · Kessels et al. 2000 · Kirchner 1958 · MacLeod 1991 · Matzen et al. 2010 · Monsell 2003 · Owen et al. 2005 · Raven 2000 · Rogers & Monsell 1995 · Salthouse 1996 · Smith 1982 · Stroop 1935. Full citations are in `docs/measurement-cards.md`.
