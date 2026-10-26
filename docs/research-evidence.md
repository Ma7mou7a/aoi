# Research evidence: what backs AI4Brain, and what it changes

A literature sweep (October 2026) for the report, the pitch and the question round. Each entry: what the paper says, how it supports us, and any action. Claims marked *preprint* or *correlational* should be cited as such.

## 1. Measurement

**The reliability paradox.** Hedge, Powell & Sumner (2018), *Behavior Research Methods* 50(3), 1166–1186. Classic tasks such as Stroop and flanker show robust average effects but low test-retest reliability for individuals (0 to .82 across seven tasks), because people differ little in the effect, and difference scores (incongruent − congruent) strip out between-person variance.
- *Supports:* our per-skill bands are wide where they should be, and flexibility (a switch-cost difference score) is our noisiest skill (r = 0.68). This is the literature's prediction, not a bug.
- *Use in Q&A:* "Why is flexibility weaker?" → cite this paper.

**Hierarchical models rescue reliability.** Rouder & Haaf (2019), *Psychonomic Bulletin & Review* 26, 452–467. Averaging trials attenuates reliability and correlations. Modelling trial-level noise hierarchically recovers them.
- *Supports:* our Bayesian profile (block observations with noise that depends on valid trials, accumulated over blocks) is the same idea in a lightweight form.

**Web testing is comparable to the lab.** Germine et al. (2012), *Psychonomic Bulletin & Review* 19(5), 847–857. Web samples on TestMyBrain.org matched lab samples in means, variance and internal reliability on demanding cognitive tasks.

**Browser timing.** Bridges et al. (2020), *PeerJ* 8:e9414, the "timing mega-study" of 10 packages including jsPsych. Online timing is slightly less precise than lab timing, but response-time precision was under 10 ms for most packages. Anwyl-Irvine et al. (2021), *Behavior Research Methods*: modern web platforms give reasonable accuracy and no single platform is best everywhere.
- *Supports:* our "keep both" jsPsych answer: frame-accurate onset gets us the main benefit, and the remaining few ms of jitter is small next to the RT effects we score (tens to hundreds of ms).

**Practice (retest) effects.** Scharfen, Peters & Holling (2018), *Intelligence* 67, 44–66. A meta-analysis of 122 studies and 153,185 people: scores rise on repeated testing and plateau after about the third administration. Earlier estimates put the first retest gain at 0.23–0.42 SD.
- *Risk:* early gains in the Brain Twin partly reflect learning the task, not the skill.
- *Action (recommended):* treat the first block of each task as familiarisation (down-weight it), and say in the report that early progress includes task learning.

## 2. Adaptivity and learning

**Adaptive design optimisation.** Myung, Cavagnaro & Pitt (2013), *Journal of Mathematical Psychology* (tutorial). Choosing each next trial or block to maximise expected information about the person's parameters lets estimates converge in fewer steps. ADOpy (Yang et al., 2021, *BRM*) is a Python implementation.
- *Supports:* our selector picks the block with the largest expected band reduction: the same principle, and our validation shows it (12% lower error than random choice at 18 blocks).

**Elo-style student models.** Pelánek (2016), *Computers & Education*, doi:10.1016/j.compedu.2016.03.017. Simple online rating updates (Elo, Bayesian variants) are robust and effective for adaptive practice.
- *Supports:* "Why not a big ML model?" Real adaptive-learning systems use simple online estimators. Ours adds an explicit uncertainty band.

**The 85% rule.** Wilson, Shenhav, Straccia & Cohen (2019), *Nature Communications*, doi:10.1038/s41467-019-12552-4. For gradient-based learners, learning is fastest at about 85% accuracy (15.87% error). The authors stress that the existence of a sweet spot matters more than the exact number, and the evidence is from machine and animal learning.
- *Supports:* training near a target success rate. Our target is about 75%.
- *Option:* raise the training target to 0.80–0.85 and cite this paper. Keep the claim modest: "a sweet spot exists".

**Desirable difficulties and spacing.** Bjork & Bjork; Cepeda et al. (2006), *Psychological Bulletin*. Spaced practice beats massed practice. A meta-analysis of spaced retrieval reported g = 0.74 over massed practice.
- *Supports:* the weekly plan spreads about 3 blocks over 4 sessions instead of cramming, and the streak rewards regular short sessions.

**Brain training and transfer.** Simons et al. (2016), *Psychological Science in the Public Interest* 17(3). A review of 132 papers: people improve on the tasks they practise, but there is little evidence that gains transfer to untrained tasks or daily life.
- *Must say in the pitch and report:* we claim to *measure* skills and to improve *task performance* honestly, not to make people smarter. This pre-empts the judges' most likely attack, so put it in Limitations.

## 3. AI collaboration

**Automation bias.** Parasuraman & Manzey (2010), *Human Factors* 52(3), 381–410. Complacency and automation bias (accepting an aid's wrong output: commission errors; missing what it fails to flag: omission errors) are overlapping, attention-driven effects. Lee & See (2004), *Human Factors* 46(1), 50–80: the goal is *calibrated* trust, matching reliance to the system's real reliability.
- *Supports:* our Collaboration Score's verification and autonomy components measure calibrated reliance, and spot-the-error mode directly measures resistance to commission errors.
- *Action:* use these terms in `docs/collaboration-score.md` and in the pitch: "we measure resistance to automation bias".

**Cognitive forcing.** Buçinca, Malaya & Gajos (2021), *Proc. ACM HCI* (CSCW), doi:10.1145/3449287. Explanations alone did not reduce over-reliance on AI. Cognitive forcing functions (making people think before seeing the AI's answer) did, though users liked them less.
- *Supports:* spot-the-error mode is a cognitive forcing function, and evidence links only help if people open them.
- *Idea:* an optional "predict first" step: before the coach's debrief, ask "Which skill do you think improved most?", then show the evidence. This is cheap and backed by the paper, and it feeds the autonomy signal.

**GenAI and critical thinking.** Lee et al. (2025), CHI '25, a survey of 319 knowledge workers: *more confidence in GenAI went with less critical thinking, more self-confidence with more.* Gerlich (2025), *Societies* 15(1):6, 666 participants: more AI use correlated with lower critical-thinking scores, mediated by cognitive offloading (*correlational*).

**Guardrails matter.** Bastani et al. (2025), *PNAS* 122(26), a field experiment with about 1,000 high-school students. An unrestricted GPT-4 tutor improved practice scores, but students did 17% worse once access was removed. A tutor with learning safeguards largely avoided the harm.
- *Supports:* our coach is deliberately constrained (evidence-only, no answers handed over, non-clinical). Use this in the pitch: "AI without guardrails can make people worse; ours is built with them, and it measures whether you still think for yourself."

**"Your Brain on ChatGPT".** Kosmyna et al. (2025), arXiv:2506.08872 (*preprint, n = 54*). EEG showed weaker engagement when essays were written with ChatGPT, which the authors call "cognitive debt". It is a good hook for an *AI4Brain* pitch, but cite it as a preprint.

## 4. Coach grounding

**Citation-grounded generation.** Gao et al. (2023), EMNLP, ALCE benchmark. Even the best LLMs lacked complete citation support about 50% of the time on ELI5.
- *Supports:* why we don't trust the model's citations. The server resolves every reference and drops unsupported claims. Measuring our drop rate would make this concrete.
- *Action:* log the share of claims dropped by the evidence check and report it, as with our Groq live test: 3 claims, 0 dropped.

## 5. Ethics and regulation

**EU AI Act, Article 5(1)(f)** (in force since February 2025): bans AI that infers emotions from *biometric data* in workplaces and education, with medical and safety exceptions.
- *Supports:* our emotion-aware feature uses only behaviour (timing, errors, focus), never face or voice, and only to suggest a break. Say this explicitly in the ethics section: the design stays outside the banned category by construction.

**Attention lapses from RT variability.** Bastian & Sackur (2013), *Frontiers in Psychology*; Esterman et al. (2013). Rising response-time variability predicts mind wandering and more errors.
- *Supports and action:* add the within-block RT coefficient of variation as a fatigue cue next to slowing. It's a small change in `src/lib/affect`.

## 6. Positioning

**Cognitive digital twins.** Recent systematic reviews (e.g. Bacnak et al., Northumbria; a 2025 PMC review, PMC12561581) find the term poorly defined and mostly applied to manufacturing. They name multi-site validation and calibrated uncertainty as gaps.
- *Supports:* our Brain Twin is a concrete, *validated* individual model with calibrated bands. That is the gap these reviews point to.

**Streaks.** The evidence is thin: mostly industry blogs, which describe loss aversion and anxiety at long streaks. Keep streaks gentle (we count back from yesterday, so one missed day isn't punished harshly). Don't make research claims about them.

## Suggested changes, in priority order

1. Limitations: practice effects and no far-transfer claim (Scharfen 2018; Simons 2016). Text only.
2. Collaboration-score doc and pitch: automation bias and calibrated trust wording (Parasuraman & Manzey 2010; Lee & See 2004; Buçinca 2021; Bastani 2025). Text only.
3. Down-weight each task's first block as familiarisation. Small code change, then re-run validation.
4. Add RT variability (CV) as a fatigue cue. Small code change.
5. Optional "predict first" step before the debrief (cognitive forcing). Small UI change.
6. Optional: move the training target from about 75% toward 80–85% (Wilson 2019). Config change, then re-run validation.
