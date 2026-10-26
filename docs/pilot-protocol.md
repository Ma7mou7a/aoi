# Pilot protocol: a first test with real people

The competition winners we studied (CrossSense, Neurotrack) all tested with real users. This is the smallest pilot that gives AI4Brain real-world evidence before the pitch. It needs about 10–30 volunteers, two short sessions each, and no special equipment.

## What it answers

1. **Test–retest reliability:** do two sessions a few days apart give similar estimates per skill? (The literature warns this is weak for difference-score tasks: Hedge et al. 2018.)
2. **Calibration on real data:** are the per-level `ability_range` and `obs_sd` fitted on simulations close to what real players produce? `npm run validate` can refit them from real blocks.
3. **Usability:** can people use it without help? Measured with the System Usability Scale (SUS, 10 questions, score out of 100; above 68 is above average).
4. **Coach trust:** do people open the evidence, and do they catch the planted error in spot-the-error mode?

## Who and how

- **Participants:** adult volunteers (classmates, family), 10 minimum and 30 ideal. Everyone gives consent in the app. Nobody is under 18. No health information is collected.
- **Session 1 (about 15 min):** onboarding, then the full assessment (about 18 blocks, chosen by the agent), then a coach debrief. Note any moment the person hesitates or asks for help (think-aloud).
- **Session 2, 3–7 days later (about 10 min):** the assessment again, then the SUS questionnaire and three questions:
  - "Did the bands make sense to you?"
  - "Did you open the evidence behind a coach claim?"
  - "Would you use this weekly?"
- **Device:** note desktop or phone; the app logs this automatically.

## Analysis

- **Reliability:** the correlation between session-1 and session-2 estimates per skill. Report it alongside the expected number of retest gains (Scharfen et al. 2018: scores rise up to the third session).
- **Calibration:** export blocks (Settings → Download my data, or a database export), refit with the validation script's fitting code, and report how much the level ranges moved.
- **SUS:** mean and range.
- **Coach:** the share of people who opened evidence, and the share who caught the planted error.

## Ethics

- Anonymous: display names only, and data deletable in one click (already built).
- Non-clinical framing in the consent text (already built). No feedback is given about health.
- Participants may stop at any time; partial data is deleted on request.

## Reporting (one slide, one report paragraph)

"Pilot, N = __: test–retest r = __ (attention) … __ (reasoning); SUS __/100; __% opened coach evidence; __% caught the planted error. Calibration refitted on real blocks: level ranges moved by at most __ points."
