# Defence Q&A: the hard questions and our answers

Short, honest answers for the 5-minute question round. Each one points to where the evidence lives.

## Validity

**"You validated your model against a simulator you wrote yourselves. Isn't that circular?"**
Partly, and we say so. The simulation tests the *pipeline*: given behaviour that depends on a known ability, does scoring + Bayesian updating recover that ability, are the bands honest, does adaptivity help, are cheaters caught? It cannot prove the tasks measure cognition in real people. Three things limit the circularity. (1) Calibration was fitted on 250 users and every number reported on 250 *other* users. (2) The study found real bugs in our own design: bands were over-confident (62–77% coverage) until we fitted per-level maps, and the chance test flagged 32% of honest matrix players until we relaxed it. A rigged test doesn't fail you. (3) Calibration lives in config, so a pilot with real people refits it with no code change: that is the next step (`docs/validation.md`, Limitations).

**"Are these tasks valid measures of anything?"**
They are standard paradigms with decades of literature (N-back, Stroop, Corsi, task switching, symbol-digit, Raven-style matrices; references on every measurement card). Our claim is narrower than "measures intelligence": each score describes performance on that task compared with the user's own history. We never compare with norms; the coach filter even removes sentences that do.

**"Why is cognitive flexibility weaker (r = 0.68)?"**
Switch costs are a difference of two noisy reaction times, so they are noisy by nature: the "reliability paradox" (Hedge et al. 2018). The band is correspondingly wider (we show it), and more trials per block or adding mixing cost would tighten it.

## Design choices

**"Why not jsPsych?"**
jsPsych is the research standard for running browser experiments, and our tasks follow the same model (stimulus, response, RT, trial log). We use its key timing technique too: stimulus onset is time-stamped at the animation frame that paints it, not when the code requests it. But our product loop needs every block to update a live Bayesian profile and choose the next block adaptively, inside one Next.js app with typed trial records going straight to scoring, the database and the coach. Embedding a second experiment runtime would add integration cost without improving any criterion. Porting the tasks as jsPsych plugins is a possible later step for researchers.

**"Is it fair to older or slower people?"**
We tested exactly that (validation E6). Raw-millisecond scoring put a slower but equally accurate person's attention 14 points too low. We switched to proportional costs (cost ÷ the person's own baseline speed) and d′ for working memory: the bias is now under 2 points. Processing speed still reflects speed, because that is what it measures. It cost some accuracy for typical users, and we chose fairness.

**"Can you forecast growth?"**
Yes, with honest bands: scored like the TADPOLE Alzheimer's forecasting challenge, our 90% forecast bands contain the truth 94% of the time. Our first version over-trusted short noisy trends, so we added a Bayesian prior on the slope. Honestly: at one week its point estimate is no better than "no change" (8.0% vs 7.3% error); what it adds is a range that is right about as often as it says, plus the trend with its uncertainty. That is why we show a range, never a single promised number.

**"Browser reaction times are imprecise."**
True for every web-based test (a few ms of jitter). Mitigations: frame-accurate onset, RT carries little weight in most scores (e.g. 20% for N-back), anticipations under a minimum RT count as errors, and users are only compared with themselves on the same device type (device is logged).

**"Why not train a model?"**
No labelled data exists for this, and the brief rewards explainability. Transparent statistics can be explained line by line, validated, and recalibrated from config. The LLM is used only for language, and its claims are verified in code.

**"Why a Kalman filter?"**
It is the simplest model that gives both an estimate and an honest uncertainty, updates in O(1) per block, and handles change over time through the drift term. The drift rate itself was tuned by simulation (0.02/day: the smallest value keeping 90% coverage while users improve).

## The AI coach

**"How do you stop the LLM from hallucinating?"**
It can only speak through references (R1, T3) to an evidence pack we build. The server resolves every reference and drops any claim without valid evidence before the user sees it. Then every number in the claim, digits and number words alike, must match the evidence that claim cites. In a live test, the model wrote that the user made "virtually no errors after a switch" with a number not in the evidence; the claim was removed automatically. Every claim opens its exact trials.

**"Why not RAG with LangChain over a document store?"**
Our corpus is 13 reviewed findings, not thousands of papers, so retrieval adds risk without benefit. The server picks the relevant cards deterministically (skills played, the situation, the question). The model cites them as S#, and the rule is "science explains, your data decides": a claim citing only science is dropped. One model call plus checks in our own code is easier to explain, test and demo than an orchestration framework.

**"What if it says something medical?"**
A clinical-term filter on every word: diagnostic terms drop the claim, medical words are rewritten, sentences comparing the user with norms are removed, and any health question gets a fixed non-clinical answer first. Tested live, e.g. "Could my low attention score mean I have ADHD?"

**"Which model? What if the API is down?"**
Claude when an Anthropic key is configured, otherwise an open-weight model (gpt-oss-120b) on Groq; both use strict JSON-schema output. Same checks either way. Without consent or without an API, a deterministic rule-based coach writes from the same evidence pack.

## Data and ethics

**"Isn't the second-opinion game deceptive? The AI is wrong on purpose."**
The instructions say exactly that before every block: "the helper is right most of the time but sometimes wrong on purpose". Practice trials show whether the helper was right. Nothing is hidden about the design, only which trials, which is what makes it a test. It measures a skill the brief asks for (collaborating well with AI) without ever deceiving the user about their results.

**"Doesn't it just measure arithmetic?"**
No, and we tested it. The score only uses disagreements, conditional on whether your first answer was right (Schemmer et al. 2023). In simulation it correlates with reliance skill (r = 0.61) and not with arithmetic (r = 0.07). Final accuracy, the naive alternative, leans on arithmetic (r = 0.26). Always following the AI or always ignoring it both score at chance.

**"Why is AI reliance so uncertain?"**
Only about 13 of 28 trials are disagreements, so one block carries limited information. The twin knows it: the band stays wide (coverage 90–95%), and the estimate firms up over about 6–10 blocks (r = 0.76 → 0.81). We tested seven block designs in simulation and kept the one that gave the most disagreements without making the helper worse than the player. The weekly plan gives it blocks because its band is the widest.

**"Why ask people to guess their own score?"**
Knowing how well you did is the skill that tells you when to trust yourself and when to trust an AI. Feedback on such self-judgements improved them, and the gain carried over to a different task (Carpenter et al. 2019). It takes five seconds, it's optional, and it happens before the score is shown, so the guess isn't anchored on it.

**"The helper says how sure it is. Isn't that making the game easy?"**
That's the point of that level: using an AI's honest confidence is calibrated trust (Lee & See 2004). It is a training level, though. We tested letting assessment pick it, and recovery after 10 blocks fell from r 0.84 to 0.78, because following an honest cue is a shortcut. As training-only it leaves measurement unchanged.

**"How do people log in? There's no email."**
On purpose. At signup you get a private 16-character sign-in key (copy it or save it as a file); we store only its hash. The key opens your Brain Twin on any browser or device, you can replace it in Settings, and sign-out is one click. No email or password means nothing personal to leak.

**"What data leaves the device?"**
Only with consent, and only an anonymous evidence pack (skill names, estimates, block metrics, trial-group counts) to the LLM provider. No name, user ID or raw trials. Voice dictation, if enabled, uses the browser's speech service, which is disclosed in Settings.

**"Isn't spot-the-error mode deceptive?"**
It is opt-in with a clear description, the evidence is never altered, and every planted error is revealed and corrected immediately. It measures (and trains) a skill the brief explicitly asks about: critical verification of AI.

**"Emotion detection is sensitive."**
Ours uses no face or voice. It infers fatigue or frustration only from behaviour (slowing, error streaks, focus loss), shows the cues, calls it a guess, and only suggests a break or eases the next block by one level.

## Generalisation (the surprise element)

**"Add a new dimension now."**
`npm run new-dimension -- --id <id> --name "<Name>" --from <existing>`, then restart: the selector, profiler, coach, dashboard, plan, validation and cards all pick it up (`docs/adding-a-dimension.md`). A new task *type* needs a generator, metrics, a simulator case and a renderer, each following an existing example (about 1–2 hours).

*Dry run (27 Oct):* `--id selective_attention --from attention_inhibition` took 0.8 s; `npm run dims:check` reported 7 dimensions valid; all 115 tests and `npm run validate` passed unchanged (the new skill got 92% band coverage). **Still to do by the team:** rehearse it live once under time pressure, including restarting the server and playing one block of the new skill.

**Rehearsal script (about 5 minutes):**
1. `npm run new-dimension -- --id <id> --name "<Name>" --from <closest skill>`
2. Edit the YAML: definition, "what it is not", levels and references (the measurement card is generated from it).
3. `npm run dims:check`, then restart `npm run dev`.
4. Show it in `/skills` (card), `/play` (the selector offers it), the dashboard radar (new axis) and the plan.
5. Optional: `npm run validate -- --users 100` to show the new skill's band coverage.

## Numbers to know by heart

| | |
|-|-|
| Band coverage (target 90%) | 89–94% per skill, 92% average |
| Mean error after 18 blocks | ±6–10% on the cognitive skills, ~7% average |
| Adaptive vs random | 10.1% vs 11.2% RMSE after 18 blocks (−10%) |
| Invalid play caught | 98% overall: 82–100% of random play, 100% of same key, silent, too fast; false alarms 0–2% (under 1% average) |
| Forecast calibration | 90% bands hold 94%, 50% bands 56% (TADPOLE CPA 0.04 / 0.06); point error 8.0% vs 7.3% for no-change |
| Fairness | slower, equally accurate users: bias < 2 points (was −14 for attention before the fix) |
| Unit tests | 269 |
| Second-opinion game | blind strategies 0.49–0.51 (chance 0.5) vs 0.79 for skilled; score vs reliance r = 0.61, vs arithmetic r = 0.07; twin r = 0.81 after 10 blocks (0.82 over five seeds) |
| Science cards | 13 reviewed findings, cited only next to the user's own evidence |
| Collaboration score weights | 25 verification · 20 clarification · 20 iteration · 20 autonomy · 15 responsible use |
