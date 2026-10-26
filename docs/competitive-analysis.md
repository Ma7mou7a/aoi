# Similar competitions: who won, why, and what we took

A sweep (October 2026) of competitions close to AI4Brain: cognitive assessment, brain health, AI for dementia, and cognition-related data challenges. For each: the winner, the winning idea, and what we adopted or beat.

## The closest competitions

| Competition | Winner | Winning idea | What judges rewarded |
|-|-|-|-|
| **PREPARE Challenge** (NIH / DrivenData, 2024–25, $650k, 979 participants): early prediction of Alzheimer's and related dementias | **RASKA-Team** (1st): ensemble of LightGBM, CatBoost and XGBoost on survey data harmonised across Mexico, India, the UK and the US, with fairness adjustments, **Jackknife+ uncertainty** and SHAP explanations. **ExplainableAD** (2nd): speech model with a demo that **highlights the speech segments that drive the score**. | Simple, well-validated models, plus uncertainty, plus explanation, tested **across populations** | Innovation, scientific rigour, **generalisation across diverse populations**, clear communication, interpretability, fairness, clean reproducible code (separate prize) |
| **TADPOLE Challenge** (2017–19): forecasting Alzheimer's progression | **Team Frog** (Genentech): gradient boosting on a "longitudinal-to-cross-sectional" feature transform; it beat complex disease-progression models | A simple model beats complex ones; forecasts submitted **with confidence intervals** | Accuracy (mAUC, MAE), plus **calibration of the intervals** (coverage probability accuracy, CPA) |
| **Longitude Prize on Dementia** (£1m, won March 2026) | **CrossSense**: AI smart glasses that recognise people and objects and guide daily tasks | Built **with** people living with early dementia (co-design) and tested in real life | Independent real-world evaluation (LSE) of the five finalists |
| **Alzheimer's Association × MATTER pitch** (2023) | **Neurotrack**: 3–5 minute at-home digital cognitive test, plus a cognitive-health programme | Short, repeatable, home-based testing, then score, recommendations and programme | Fit for primary care: quick, validated, actionable |
| **Microsoft Imagine Cup** (China regional, 2017) | **Weetap**: spatial-memory training for seniors with spaced-retrieval scheduling from behavioural modelling | Personalised training schedule | — |
| **ANU AI healthcare hackathon** | 2nd: **CogniTrack**, early cognitive-decline detection from visual biomarkers | — | — |
| **NeurIPS 2025 EEG Foundation Challenge** | KU Leuven (self-reported 1st in Challenge 1): EEG foundation model predicting reaction time | Large pretrained model | Leaderboard score only |

No public event matches "AI4Brain" or CISTAC directly; these are the nearest analogues with published winners.

## What the winners have in common

1. **Uncertainty is part of the answer.** RASKA used Jackknife+ and TADPOLE scored interval calibration. → *We already lead here:* every estimate carries a 90% band validated at 89–96% coverage.
2. **Generalisation and fairness are tested, not assumed.** RASKA won on cross-country fairness. → *We added this* (validation E6).
3. **Explanations point at the evidence.** ExplainableAD highlights the segments behind a score. → *We already do this:* every coach claim links to its exact blocks and trials, plus the score breakdown per block.
4. **Simple models win.** Frog beat complex models, and RASKA used gradient boosting rather than deep nets. → Supports our transparent Bayesian approach.
5. **Real users matter.** CrossSense was co-designed with people with dementia and evaluated in real life. → *Our biggest gap.* See `docs/pilot-protocol.md`.
6. **Short and repeatable.** Neurotrack takes 3–5 minutes at home. → Our blocks take about a minute each; a session takes about 5 minutes.

## What we implemented from this

### E5: TADPOLE-style forecast scoring
Our 7-day growth forecasts are now scored the way TADPOLE scored Alzheimer's forecasts: mean absolute error plus **coverage probability accuracy** (|share of true values inside the band − nominal|).
- **Found:** the first version, which extrapolated the raw two-week trend, *lost* to a no-change forecast (MAE 8.5% vs 7.0%).
- **Fixed:** a Bayesian prior on the slope now shrinks noisy trends toward zero.
- **Result:** 90% bands hold the truth **91%** of the time (CPA **0.007**), 50% bands 48% (CPA 0.02), and point accuracy matches the no-change baseline (7.7% vs 7.4%).

### E6: PREPARE-style fairness audit
We re-ran the same users with +80 ms device lag and with a 30% slower but equally accurate response style.
- **Found:** raw-millisecond scoring underestimated a slower person's attention by **14 points**, with band coverage collapsing to **54%**. Working memory and flexibility were 5 points low.
- **Fixed:** proportional costs (cost ÷ the person's own baseline response time) for Stroop and task switching, and d′ alone for n-back.
- **Result:** bias under 2 points, with 90–96% coverage for the slower group. Processing speed still reflects speed, by design.
- **Trade-off, stated openly:** accuracy for typical users dropped (attention r 0.90 → 0.77), because in our simulator overall speed carried real signal. We chose fairness.

Both run with `npm run validate` and appear at `/validation` and in `docs/validation.md`.

## Where we already outperform the winners

- **Calibrated uncertainty for every estimate, for every user, live.** The winners report uncertainty in a paper. We show it in the product and validate it.
- **Adaptive measurement.** None of the winners chooses the next test to maximise information. Ours does, and it is 12% more accurate at equal effort.
- **Explanations a user can check.** ExplainableAD highlights segments. Our coach's every sentence is verified against the evidence server-side, and unsupported claims are dropped.
- **An AI-collaboration metric.** No comparable entry measures how people work with AI, or resists automation bias.
- **Non-clinical by construction.** The dementia winners operate in clinical territory. We stay out of it, which the brief requires.

## Still to do (borrowed from the winners)

1. **Pilot with real people** (CrossSense, Neurotrack): see `docs/pilot-protocol.md`. Even 10 people × 2 sessions gives test–retest reliability and a usability score, and it is the single biggest credibility gain.
2. **Conformal check of the bands** (RASKA's Jackknife+): once pilot data exists, check band coverage on real people and widen it if needed. This needs no code beyond the existing calibration fit.
3. **A short "check-in" mode** (Neurotrack): one block per skill, about 3 minutes, for a weekly snapshot.
4. **Clean-code bonus thinking** (PREPARE): CI, 98 tests and one-command reproduction already exist. Name them explicitly in the report.

## Sources

- PREPARE Phase 3 winners: https://blog.drivendata.org/blog/prepare-phase3-winners · Phase 2: https://blog.drivendata.org/blog/prepare-phase2-winners
- TADPOLE: https://arxiv.org/abs/2001.09016 · metrics: https://tadpole.grand-challenge.org/Performance_Metrics/ · results: https://tadpole.grand-challenge.org/Results
- Longitude Prize on Dementia: https://www.lse.ac.uk/cpec/news/2026/innovation-by-design-inside-the-longitude-prize-on-dementia · https://www.sussex.ac.uk/news/article/70371-university-of-sussex-scientist-part-of-the-winning-team-for-the-1m-longitude-prize
- Neurotrack: https://matter.health/posts/the-alzheimers-association-and-matter-select-neurotrack-as-winner-of-pitch-competition/
- Weetap: https://news.wku.edu.cn/en/2017/05/18/23626
- ANU hackathon: https://www.anu.edu.au/students/student-life/events-stories/anu-hackathon-produces-innovative-ai-enabled-healthcare-solutions
- EEG Foundation Challenge: https://arxiv.org/pdf/2506.19141 · https://www.vscentrum.be/post/scaling-eeg-foundation-models-on-vsc-an-iclr-2026-benchmark-and-a-neurips-2025-eeg-challenge-win
