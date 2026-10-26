# Defence Q&A: the hard questions and our answers

Short, honest answers for the 5-minute question round. Each one points to where the evidence lives.

## Validity

**"You validated your model against a simulator you wrote yourselves. Isn't that circular?"**
Partly, and we say so. The simulation tests the *pipeline*: given behaviour that depends on a known ability, does scoring + Bayesian updating recover that ability, are the bands honest, does adaptivity help, are cheaters caught? It cannot prove the tasks measure cognition in real people. Three things limit the circularity. (1) Calibration was fitted on 250 users and every number reported on 250 *other* users. (2) The study found real bugs in our own design: bands were over-confident (62–77% coverage) until we fitted per-level maps, and the chance test flagged 32% of honest matrix players until we relaxed it. A rigged test doesn't fail you. (3) Calibration lives in config, so a pilot with real people refits it with no code change: that is the next step (`docs/validation.md`, Limitations).

**"Are these tasks valid measures of anything?"**
They are standard paradigms with decades of literature (N-back, Stroop, Corsi, task switching, symbol-digit, Raven-style matrices; references on every measurement card). Our claim is narrower than "measures intelligence": each score describes performance on that task compared with the user's own history. We never compare with norms; the coach filter even removes sentences that do.

**"Why is cognitive flexibility weaker (r = 0.73)?"**
Switch costs are a difference of two noisy reaction times, so they are noisy by nature. The band is correspondingly wider (we show it), and more trials per block or adding mixing cost would tighten it.

## Design choices

**"Why not jsPsych?"**
jsPsych is the research standard for running browser experiments, and our tasks follow the same model (stimulus, response, RT, trial log). We use its key timing technique too: stimulus onset is time-stamped at the animation frame that paints it, not when the code requests it. But our product loop needs every block to update a live Bayesian profile and choose the next block adaptively, inside one Next.js app with typed trial records going straight to scoring, the database and the coach. Embedding a second experiment runtime would add integration cost without improving any criterion. Porting the tasks as jsPsych plugins is a possible later step for researchers.

**"Browser reaction times are imprecise."**
True for every web-based test (a few ms of jitter). Mitigations: frame-accurate onset, RT carries little weight in most scores (e.g. 20% for N-back), anticipations under a minimum RT count as errors, and users are only compared with themselves on the same device type (device is logged).

**"Why not train a model?"**
No labelled data exists for this, and the brief rewards explainability. Transparent statistics can be explained line by line, validated, and recalibrated from config. The LLM is used only for language, and its claims are verified in code.

**"Why a Kalman filter?"**
It is the simplest model that gives both an estimate and an honest uncertainty, updates in O(1) per block, and handles change over time through the drift term. The drift rate itself was tuned by simulation (0.03/day: the smallest value keeping 90% coverage while users improve).

## The AI coach

**"How do you stop the LLM from hallucinating?"**
It can only speak through references (R1, T3) to an evidence pack we build. The server resolves every reference and drops any claim without valid evidence before the user sees it. Every claim opens its exact trials.

**"What if it says something medical?"**
A clinical-term filter on every word: diagnostic terms drop the claim, medical words are rewritten, sentences comparing the user with norms are removed, and any health question gets a fixed non-clinical answer first. Tested live, e.g. "Could my low attention score mean I have ADHD?"

**"Which model? What if the API is down?"**
Claude when an Anthropic key is configured, otherwise an open-weight model (gpt-oss-120b) on Groq; both use strict JSON-schema output. Same checks either way. Without consent or without an API, a deterministic rule-based coach writes from the same evidence pack.

## Data and ethics

**"What data leaves the device?"**
Only with consent, and only an anonymous evidence pack (skill names, estimates, block metrics, trial-group counts) to the LLM provider. No name, user ID or raw trials. Voice dictation, if enabled, uses the browser's speech service, which is disclosed in Settings.

**"Isn't spot-the-error mode deceptive?"**
It is opt-in with a clear description, the evidence is never altered, and every planted error is revealed and corrected immediately. It measures (and trains) a skill the brief explicitly asks about: critical verification of AI.

**"Emotion detection is sensitive."**
Ours uses no face or voice. It infers fatigue or frustration only from behaviour (slowing, error streaks, focus loss), shows the cues, calls it a guess, and only suggests a break or eases the next block by one level.

## Generalisation (the surprise element)

**"Add a new dimension now."**
`npm run new-dimension -- --id <id> --name "<Name>" --from <existing>`, then restart: the selector, profiler, coach, dashboard, plan, validation and cards all pick it up (`docs/adding-a-dimension.md`). A new task *type* needs a generator, metrics, a simulator case and a renderer, each following an existing example (about 1–2 hours).

## Numbers to know by heart

| | |
|-|-|
| Band coverage (target 90%) | 89–96% per skill, 92% average |
| Mean error after 18 blocks | ±5.5–10%, ~7% average |
| Adaptive vs random | 8.0% vs 9.7% RMSE after 18 blocks (−18%) |
| Invalid play caught | 93–100% (random), 100% (same key, silent, too fast); false alarms 0–8% |
| Unit tests | 94 |
| Collaboration score weights | 25 verification · 20 clarification · 20 iteration · 20 autonomy · 15 responsible use |
