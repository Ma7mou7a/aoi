# Out-of-the-box ideas: researched, ranked, and what's built

Each idea has published support, fits the brief, and reuses machinery we already have. Ranked by judging impact per hour of work.

## Built

**Two-source coach: science explains, your data decides.** The coach is grounded in the user's own blocks and trials (R#/T#) *and* a reviewed set of 13 published findings (S#, `science/findings.yaml`, each with a citation and link).
- Every claim must still cite the user's evidence. A claim backed only by science is dropped server-side, and unknown S# references are logged.
- Findings are non-clinical, pass the same clinical and norm filter, and can never be used to compare the user with others.
- A science card is offered only when it is relevant: strategy cards for skills just played, the automation-bias card only when the user asks about the AI, and practice effects only after repeated practice.
- *Live test (Groq gpt-oss-120b):* asked "why do my results jump around?", the coach cited the user's two task-switching blocks plus *Why single blocks jump around* (Hedge et al. 2018). Asked for tips, it cited *Prepare for the switch* (Rogers & Monsell 1995). Nothing was dropped.
- *Why no LangChain:* the corpus is 13 hand-checked cards, not a document store. One model call plus deterministic checks is easier to explain, test and demo.

**Second opinion: a game that measures reliance on AI.** A two-stage judge–advisor task (Schemmer et al. 2023): answer, see an AI helper's answer, decide again. Only disagreements count, conditional on the first answer, so it measures trusting well rather than arithmetic (simulation: r = 0.61 with reliance skill, 0.07 with arithmetic), and blind "always follow" or "always ignore" strategies score at chance. It feeds the AI Collaboration Score with two graded events per block. Limitation: it needs about 6–10 blocks for a firm estimate (r = 0.84 after 10). See `docs/validation.md`, E7.

**Predict-first debrief** (already in the app): before the debrief, the user guesses whether their latest skill went up, stayed the same or went down. This is a cognitive forcing function (Buçinca et al. 2021), and predicting before feedback helps learning (pretesting and prediction-error research, e.g. Memory & Cognition 2021).

## Next, ranked

### 1. Number grounding: a verifier for every figure (small, high impact)
The server checks that each claim cites real evidence, but not that the *numbers in the sentence* match it. Add a deterministic verifier: every number in a claim must appear in the cited block or trial facts (with rounding tolerance), or the claim is dropped or flagged.
- *Research:* Chain-of-Verification (Dhuliawala et al., ACL Findings 2024) reduces hallucinations by checking a draft before answering. Ours checks in code, so no second model is needed and the check can't itself make things up.
- *Pitch line:* "Every number the AI says is checked against your data before you see it."

### 2. "What it would take": counterfactual feedback (small, high impact)
The scoring function is a pure formula, so we can compute exact counterfactuals. For example: "Catching 2 more matches would have taken this block from 60% to 68%", or "a 40 ms smaller slow-down on conflicting words is worth +5 points".
- *Research:* counterfactual explanations give *actionable recourse* in learner models (KTCF, AAAI 2026).
- These counterfactuals are exact, not model-guessed, so they also become new evidence facts the coach can cite.

### 3. Brain Twin Lab: personal N-of-1 experiments (1 day, the "wow" feature)
The user asks a question about themselves, for example: "Do I focus better in the morning?", "Does music help my processing speed?", "Is my phone as good as my laptop?". The app randomises the condition across sessions and uses the same Bayesian machinery to report: "72% likely mornings are better for your attention, by about 4 points (band −3 to +11). 3 more sessions would settle it."
- *Research:* self-experimentation apps with Bayesian N-of-1 analysis (Self-E, Brown University; StudyMe, *Trials* 2022).
- *Guardrails:* only everyday, non-health conditions (time of day, music, device, a short break), and results are only ever about yourself.
- *Why it wins:* it turns the Brain Twin from a mirror into a scientific instrument the user controls. That is AI *for* the brain in the most literal sense, and it shows off the uncertainty model.

### 4. Metacognition score (half a day)
Ask "how sure are you?" after each block, and track how well confidence matches performance (calibration, Brier score) as a seventh, opt-in metric.
- *Research:* feedback on confidence judgements improved metacognitive calibration, and the gain transferred to an untrained task (Carpenter et al. 2019, *J. Exp. Psychol.: General*). A 2020 follow-up suggests part of the gain is a change in confidence habits, so claim it modestly.
- It also feeds the AI Collaboration Score: people who know when they're right are better at judging when the AI is wrong.

### 5. Teach the twin (medium)
After a block, the user explains their strategy to the coach ("I group the blocks into shapes"), and the coach asks one probing question. Explanations earn collaboration-score credit and become evidence in later debriefs ("you said you chunk sequences; your Corsi span rose 1 block since").
- *Research:* the protégé effect: students who believed they were teaching an agent worked harder and learned more, especially lower achievers (Chase, Chin, Oppezzo & Schwartz 2009, Betty's Brain).

## Sources

- Chain-of-Verification: https://arxiv.org/pdf/2309.11495
- Counterfactual recourse in knowledge tracing (KTCF): https://ojs.aaai.org/index.php/AAAI/article/view/41216
- Self-E: https://selfe.cs.brown.edu/ · StudyMe: https://doaj.org/article/dcbae97aa8994dc0bcd7d00294590667 · digital N-of-1 review: https://arxiv.org/pdf/2412.15076
- Carpenter et al. 2019: https://pmc.ncbi.nlm.nih.gov/articles/PMC6390881 · 2020 follow-up: https://link.springer.com/article/10.3758/s13414-020-01972-w
- Protégé effect: https://purl.stanford.edu/zm369yx3532
- Pretesting and prediction error: https://link.springer.com/article/10.3758/s13421-021-01218-6
- Cognitive forcing (Buçinca et al. 2021): https://arxiv.org/pdf/2102.09692
