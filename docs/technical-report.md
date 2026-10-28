# AI4Brain: an uncertainty-aware, evidence-linked cognitive growth agent

**CISTAC 1.0 · AI4Brain challenge · Technical report**
Team: *[team name and members]* · Repository: https://github.com/ChaimaGhazali/aoi

## 1. Summary

AI4Brain is a non-clinical agent that **assesses** six cognitive skills with classic cognitive-science tasks, plus how well the user relies on AI advice. It **understands** the results as a Bayesian profile in which every score carries a 90% band showing how sure we are (the *Brain Twin*). It **coaches** through Bao, a panda who explains every game in plain words, cites the exact trials behind each claim and can start the right game in one tap. It **improves** practice with adaptive difficulty, weekly plans and goals. We speak of practice gains on these tasks, never of a "better brain".

Four design choices set it apart:

1. **Transparent statistics, not a black box.** Scoring and profiling are explicit formulas over configuration, so every number can be explained. The language model only writes language, constrained to an evidence pack and re-checked in code: it cannot invent a number.
2. **Measured, not claimed.** We ran 500 simulated users with known abilities through the real pipeline. After calibration:
   - the 90% bands contain the true ability **89–94%** of the time
   - mean error on the cognitive skills is **±6–10%**
   - adaptive game selection gives **10% lower error** than random order at equal effort
   - **98%** of invalid play is flagged, with about **1%** false alarms
   - 7-day forecast bands hold the truth 94% of the time
   - slower but equally accurate users are not penalised (bias under 2 points outside processing speed)
3. **An experience people come back to, without dark patterns.**
   - a 60-second first game before any signup
   - results in three plain lines
   - a coach that acts: play, progress, "what if I play every day?"
   - bamboo rewards for consistency and curiosity, never for high scores
4. **Generalisable by configuration.** A skill is a YAML file. A new skill reusing any of the seven task types is added with one command and no code change. This is how we prepare for the surprise element.

## 2. Cognitive dimensions and tasks

The brief refers to a list of dimensions that does not appear in the published document. We chose six skills that are widely studied, measurable in a browser in about a minute, and covered by classic paradigms with trial-level data. AI reliance is a seventh, collaboration skill.

| Skill | Task | Main measures | Reference |
|-|-|-|-|
| Working memory | Letter N-back (1/2/3-back) | d′ (log-linear corrected), hit RT | Kirchner 1958; Owen et al. 2005 |
| Attention & inhibition | Colour-word Stroop | interference cost (proportional), incongruent accuracy | Stroop 1935; MacLeod 1991 |
| Processing speed | Symbol-digit coding (key reshuffled per block) | correct/min, accuracy | Smith 1982; Salthouse 1996 |
| Cognitive flexibility | Number task switching (parity / magnitude) | switch cost (RT, errors) | Rogers & Monsell 1995 |
| Visuospatial memory | Corsi blocks with an in-block span staircase | span, total score | Corsi 1972; Kessels et al. 2000 |
| Reasoning | **Generated** Raven-style 3×3 matrices | accuracy | Raven 2000; Matzen et al. 2010 |
| *AI reliance* | **Second opinion**: answer, see an AI helper's answer, decide | appropriate reliance on disagreements | Schemmer et al. 2023 |

Each skill has a **measurement card** (definition, what it is *not*, task, levels, scoring, uncertainty, data-quality checks, known biases, references). The cards are generated from the configuration and shown in the app (`/skills`, `docs/measurement-cards.md`).

Every trial stores the stimulus, response, correctness, response time and behaviour signals (window focus loss, answer changes). Assessment is **non-biometric only**. As in jsPsych, each stimulus onset is time-stamped at the frame that paints it, so response times are measured from what the user actually saw.

## 3. From trials to the Brain Twin

**Game score.** Each task's metrics are normalised to 0–1 and combined with configured weights into a composite *c*. The composite is mapped onto the 0–1 ability scale through the difficulty level's range, *observation = lo + (hi − lo)·c*. So a strong 3-back game counts for more than an equally good 1-back game.

**Data quality.** A game is flagged when it has:
- too few valid trials
- accuracy not above chance
- long runs of identical answers
- many anticipations or timeouts
- repeated focus loss

A flagged game still counts, but with **2.5×** the noise.

**Bayesian update.** Each skill's ability is a Normal belief (prior 50% ± 33 points). A game is an observation with noise *σ·√(n_ref/n_valid)*, combined by a precision-weighted (1-D Kalman) update. Between sessions the variance grows by *q²·days* (*q* = 0.02/day), so the twin follows real change and does not become over-confident. Snapshots are append-only, which gives the required history.

**Forecast.** A weighted linear trend over the twin's history is extended from today's score, with a band that combines today's uncertainty, the trend's uncertainty and drift. The slope has a Bayesian prior that shrinks noisy trends toward "no change".

Every week a 7-day forecast is stored. Once it is due, the dashboard shows whether the real score landed inside it: **the twin's track record**. Forecasts are labelled "a forecast, not a promise".

## 4. Adaptive assessment and learning

**Which game next.** For every playable skill, task and level, the selector computes the expected reduction of the band, *σ − (σ⁻² + σ_obs⁻²)^−½*, with the noise inflated where a floor or ceiling is likely, and picks the largest. Each choice comes with a plain reason, e.g. "We're least sure about your attention so far (±33%). One Stroop game at level 2 should bring that down to about ±18%."

**Training** focuses on the weakest skill, at the level where expected success is closest to ≈75%, then follows a 1-up/1-down staircase.

**Weekly plan.** Twelve games are allocated by *priority = 0.6·(band width / prior width) + 0.4·(room to grow)*. Each item has a target level and a reason. The plan is rebuilt weekly and records the snapshots it came from.

**Goals.** A score goal counts as reached only when the **whole 90% band** is above the target. Until then the app shows the probability that the user is already there (e.g. "6% likely you're already at 70%+").

**Dashboard.** A radar with the band as a shaded ring, progress curves with bands and the dashed forecast, a skill × day heatmap, streaks, goals and the plan. Every chart has a table view, and the palette is validated for colour-vision deficiency in light and dark mode.

## 5. AI coach

**Architecture.**

1. **Evidence pack.** The server builds a pack with:
   - skill scores with bands
   - the last six games with metrics and reliability
   - grouped trial facts ("5 matches you caught")
   - exact "what it would take" recalculations ("1 more match caught → 68% instead of 60%")
   - forecasts at 2, 4 and 7 games a week

   Each item gets a short reference (R1, T3, W2, P1). No names or database IDs leave the server.
2. **Structured output.** The LLM (Claude `claude-opus-5-5` when an Anthropic key is set, otherwise `gpt-oss-120b` on Groq; both with strict JSON-schema output) returns:
   - the user's **intent**
   - a short **reply** (at most 3 sentences)
   - 0–3 **claims**, each with a "why" and references
   - up to 3 **action buttons**: play a skill, show progress, "what if I play N games a week?", set a goal, today's challenge
   - Bao's **mood**

   It also receives a short memory of the user (goal, favourite skill, recent topics), so it never repeats itself.
3. **Server checks.** The server maps references back to games and trials, **drops any claim without valid evidence**, and accepts only actions that name real skills.
4. **Number check.** Every number the model writes must match the evidence that claim cites, within rounding, or the claim is dropped. This is a deterministic chain-of-verification (Dhuliawala et al. 2024): no second model, so the check cannot itself hallucinate.
5. **Safety filters.** A **clinical-term filter** and a **norm filter** remove diagnostic language and comparisons with other people. A health question always gets a fixed non-clinical answer first.
6. **Science explains, your data decides.** Up to 8 of 13 reviewed findings (`science/findings.yaml`) can explain *why* something happened. A claim backed only by science is dropped.
7. **Fallback.** Without consent to AI coaching, or if the API fails, a **template coach** answers the same intents: keyword intent detection plus Bao's line bank, with six or more variants per intent and never the same line twice in a row. It goes through the same checks.

**Why this design.** The LLM is good at language but must not invent facts or medicalise results. Forcing citations and verifying them in code turns explainability into a check the user can perform: "Why?" opens the claims, and each claim opens the exact trials.

## 6. The experience layer

User testing of an early version gave a blunt verdict: "good as a concept, zero as user experience". We rebuilt the experience around one companion and three rules: plain words, one clear next step, and no dark patterns.

- **A 60-second first game.** The landing page offers one game (Corsi blocks) before any signup. The result is explained in plain words. Signup is a short conversation with Bao, one consent per step, nothing pre-ticked. The first game then becomes the new account's first real game; the server scores it again.
- **Bao the panda.**
  - Bao reacts while you practise: he cheers every third correct answer and covers his eyes at most once in five trials.
  - **During scored assessment games he only blinks**, so he cannot distract from the measurement.
  - He is drawn in SVG and animates only transform and opacity. A reduced-motion setting makes him static.
- **Plain-words result card.** Three lines: *what you did* ("You caught 78% of the matching letters"), *what it means* (the score counting up, plus a "sure-o-meter" that narrows with each game, e.g. "We're fairly sure it's between 55 and 68; 2 more games and we'll be much surer"), and *what's next*. Technical details are one click away.
- **A coach that acts.**
  - "I want to improve my memory" returns a **Play** button.
  - "What if I play every day?" returns a ranged forecast from the user's own trend ("about 64, likely 57–70, if your recent trend continues").
  - The forecast numbers go through the same number check.
- **Honest motivation.**
  - Bamboo for showing up and playing: a daily gift, streak days, a finished weekly plan, a shared daily challenge.
  - Badges for consistency and curiosity, never for high scores.
  - A weekly streak freeze, and no loss framing or notifications.
  - A daily puzzle that is the same for everyone (seeded by date), with a share card that contains only your own result.
- **Research mode.** The measurement tools (claim ratings, planted errors) are opt-in under Research mode, so everyday users get a conversation rather than a questionnaire.

## 7. AI Collaboration Score

*score = round(100 · Σ w_c · s_c)*, where *s_c = (Σ v_i + 0.5·2) / (n_c + 2)* is a Bayesian-smoothed mean of the signal values *v_i* ∈ [0, 1] of component *c*. The weights follow the brief:

| Component | Weight |
|-|-|
| Clarification | 20% |
| Critical verification | 25% |
| Iteration | 20% |
| Autonomy | 20% |
| Responsible use | 15% |

There are **19 signals**, each emitted by a concrete action. For example:
- opening the evidence
- follow-up questions
- acting on the coach's suggestion
- betting with Bao before a debrief on whether the last game went better or worse
- self-estimates of each score
- in-scope vs health questions
- reviewing privacy settings

The formula and its limits are in `docs/collaboration-score.md`.

**Second-opinion game.** The player decides quickly which of two sums is larger, sees an AI helper's answer, then decides again. The helper is described honestly as "sometimes wrong on purpose". Reliance is scored only on disagreements, conditional on the first answer:
- *relative self-reliance*: keeping a right answer when the helper is wrong
- *relative AI reliance*: switching a wrong answer when the helper is right

The game score is their mean, so "always follow the AI" and "always keep my answer" both land at chance. A 28-trial game (about 2 minutes) gives about 13 disagreements. A training-only level adds an honest "very sure / not sure" cue, which measures calibrated trust (Lee & See 2004).

**How sure are you?** Before each score is shown, the user guesses it. Feedback on such guesses improves calibration and transferred to an untrained task (Carpenter et al. 2019). Each guess is a graded autonomy event.

**Spot-the-error** (Research mode, opt-in) makes critical verification measurable. About a third of debriefs carry one deterministic number change in a claim's "why". The evidence is never altered, and every planted error is revealed after the user answers.

## 8. Bonus features

- **Predictive growth:** forecasts with bands, a self-grading track record, and "what if I play N games a week" forecasts in the coach.
- **Emotion-aware (from behaviour only):** fatigue and frustration are inferred with documented rules from timing, errors and abandoned games. They are shown with their cues as a dismissible guess, and used only to suggest a break or ease the next training game. No camera or microphone input is ever used.
- **Voice coaching:** Bao's replies can be read aloud, and questions can be dictated (with consent; the user reviews the transcript before sending). No audio is stored.

## 9. Validation with simulated users

**Set-up.** Each simulated user has a known ability per skill (*N*(0.5, 0.18), clamped). Task simulators turn ability into trial-level behaviour. Each user plays 18 games through the **real** selector, scoring and profiler. Calibration is fitted on 250 users, and every result is reported on the other 250 (`npm run validate`, `docs/validation.md`, `/validation`).

**Calibration.** The first run's bands covered the truth only 52–82% of the time, because the hand-set level ranges were biased. We fitted a measurement model per level, *c = a + b·ability + ε*, on games played at random levels, and inverted it into the level's range. The fit is written back into the YAML, so pilot data can refit it with no code change.

| Skill | r | Mean abs. error | 90% coverage (hand-set → fitted) |
|-|-|-|-|
| Working memory | 0.84 | 7.1% | 66% → **91%** |
| Attention & inhibition | 0.75 | 9.1% | 69% → **94%** |
| Processing speed | 0.94 | 5.7% | 52% → **92%** |
| Cognitive flexibility | 0.68 | 10.0% | 64% → **93%** |
| Visuospatial memory | 0.92 | 5.7% | 82% → **89%** |
| Reasoning | 0.92 | 6.0% | 62% → **94%** |
| *AI reliance* | 0.37 | 12.6% | 94% → **95%** (needs several games) |

**Adaptive vs random selection** (RMSE over all seven skills, equal budget): 12.9% vs 14.5% after 6 games, and **10.1% vs 11.2% after 18** (10% lower).

**Robustness** (200 games per cell):
- random answers: 82–100% flagged
- same-key, no-response and too-fast play: 100% flagged
- invalid play overall: 98% flagged
- genuine players: 0–2% flagged (under 1% on average)

A flagged game is down-weighted, not discarded, so a false alarm is the costlier error.

**Growth and forecasts.** Over a month of +15 points of real improvement, *q* = 0.02/day is the smallest drift that keeps coverage ≥ 90%. Across 1,200 seven-day forecasts, scored like the TADPOLE forecasting challenge:
- mean absolute error is 8.0%, against 7.3% for a no-change forecast
- the 50% and 90% bands hold the truth 56% and 94% of the time (coverage probability accuracy 0.06 and 0.04)

The point forecast is no better than "no change" at one week. What the forecast adds is an **honest range**, and we present it that way.

**Fairness** (as in the PREPARE challenge). Raw-millisecond scoring put a slower but equally accurate person's attention **14 points too low**. With costs proportional to the person's own speed, the bias is now under 2 points, with 90–96% coverage. Processing speed still drops, by design: it *is* speed. The price is some accuracy for typical users (attention r 0.90 → 0.77). We chose fairness, and we say so.

**Second-opinion game.** Its score correlates with simulated reliance skill (r = 0.61), not with arithmetic (r = 0.07). Blind strategies land at chance (0.51 and 0.49), against 0.67 and 0.79 for calibrated players of average and high skill. The twin's estimate reaches r = 0.76 after 6 games and 0.81 after 10, with 90–93% band coverage throughout.

## 10. Ethics, safety and robustness

- **Non-clinical.**
  - clinical-term filter
  - a fixed answer to health questions
  - "what it is not" on every card
  - no norms; comparisons only with the user's own history
  - claims limited to practice on these tasks
- **Consent and data.**
  - opt-in, granular consents with an append-only history
  - user-chosen retention (30/90/180/365 days), enforced by purges
  - JSON export
  - one-click deletion through every table, rewards and coach memory included
  - no email, password, real name, audio or images collected
  - only an evidence pack with no identifiers goes to Anthropic or Groq, and only with consent
- **Accounts without personal data.** A random 80-bit sign-in key is shown once, and only its SHA-256 is stored.
- **Motivation without dark patterns.**
  - rewards never change a score
  - badges never depend on score level
  - streaks have a freeze, and there are no notifications or loss framing
  - Bao is silent during measurement
- **No decision from face or voice.** There is no camera; voice is only an input method for questions.
- **Robustness.**
  - cold start from an explicit prior
  - invalid, abandoned and too-fast games are flagged and down-weighted
  - the coach falls back to the template coach if the API is unavailable or returns invalid output

Full details are in `docs/ethics.md`.

## 11. Engineering

Next.js 15 and TypeScript, Drizzle ORM on PostgreSQL (embedded PGlite for zero-setup demos), Recharts, Zod, the Anthropic SDK and Groq's OpenAI-compatible API.

**269 unit tests** cover:
- scoring, profiler calibration and the selector
- task generators
- coach safety, intents and actions
- number and forecast checks
- the collaboration score
- plans and forecasts
- rewards and streak freezes
- the daily challenge

GitHub Actions runs the config check, typecheck, lint, tests, a 100-user validation smoke test and the build. Trials store their RNG seeds, so every game can be replayed. `npm run new-dimension` scaffolds a skill from any task type.

## 12. Limitations and next steps

- **Simulated, not human, validation.** The study shows the pipeline is consistent, calibrated and robust. It does not show that the tasks measure cognition in real people. Next step: a pilot (e.g. 30 people × 2 sessions) to refit the calibration and estimate test–retest reliability.
- **Independent skills.** Real skills correlate, and a hierarchical model could share information between them.
- **AI reliance** needs many games, because only disagreements are informative.
- **Cognitive flexibility** recovers least well (r = 0.68), because switch costs are noisy (Hedge et al. 2018).
- **Language and device.** Stroop needs fluent reading of English colour words, and response times depend on the device. Both are documented biases, mitigated by comparing users only with themselves.
- **The AI Collaboration Score** and the reward design are proposals. They should be validated with real users and expert ratings.

## References

Carpenter et al. 2019 · Corsi 1972 · Dhuliawala et al. 2024 · Hautus 1995 · Hedge et al. 2018 · Kessels et al. 2000 · Kirchner 1958 · Lee & See 2004 · MacLeod 1991 · Matzen et al. 2010 · Owen et al. 2005 · Raven 2000 · Rogers & Monsell 1995 · Salthouse 1996 · Schemmer et al. 2023 · Smith 1982 · Stroop 1935. Full citations are in `docs/measurement-cards.md` and `science/findings.yaml`.
