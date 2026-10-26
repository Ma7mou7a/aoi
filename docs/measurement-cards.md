# Measurement cards

Generated from `dimensions/*.yaml` by `npm run cards`. The app shows the same cards at `/skills`. AI4Brain is a non-clinical learning tool: every score describes task performance compared with the user's own history, never a diagnosis or a norm.

## Attention & inhibition

**Definition.** The ability to stay focused on what matters and hold back an automatic response. Measured as how much slower and less accurate you get when the word meaning conflicts with the ink colour you must name.

**What it is not.** Not a measure of attention-related conditions and not a diagnosis. It describes interference on this specific task.


**Task: Colour-word Stroop.** A colour word appears in coloured ink. Press the key for the INK colour, not the word. Be fast but accurate.

| Level | Settings | Ability range (fitted) |
|-|-|-|
| 1 | incongruent_rate: 0.25, deadline_ms: 2500 | -0.36 → 1.27 |
| 2 | incongruent_rate: 0.5, deadline_ms: 1800 | -0.34 → 1.26 |
| 3 | incongruent_rate: 0.75, deadline_ms: 1200 | -0.28 → 1.24 |

**Scoring** (block score = weighted sum, each metric scaled to 0–100%):

- interference cost ms × 50%: lower is better: 0 or less → 100%, 300 or more → 0%
- incongruent accuracy × 35%: 0.5 or less → 0%, 1 or more → 100%
- median rt ms × 15%: lower is better: 450 or less → 100%, 1400 or more → 0%

**Uncertainty.**

- Starts at 50% ± 33 points (90% band) before any data.
- One full block (32 valid trials) is a noisy reading with SD 0.172 on the 0–1 scale; fewer valid trials → noisier (√n rule).
- Unreliable blocks (near chance, response streaks, too fast, timeouts) count 2.5× noisier; blocks at the floor/ceiling of a level count 1.5× noisier.
- Between sessions the band widens by 0.03 per day, because ability can change.
- Each block's score is mapped to ability through its level's fitted range (level ranges and obs_sd fitted on 250 simulated users, 2026-10-26; refit on pilot data).

**Data quality checks.**

- Responses faster than 200 ms count as anticipations (errors); slower than 2500 ms as timeouts.
- At least 24 valid trials needed.
- Accuracy must beat chance (25%) by 1.645 binomial SDs.
- More than 10 identical answers in a row is flagged.

**Known biases.**

- Reading fluency: the effect depends on fluent reading of the colour words; non-native English readers may show less interference. A language setting is planned.
- Colour vision: users with colour-vision differences are offered a high-contrast palette; colours are never the only cue in the UI.
- Response mapping: the first block includes extra practice so key-learning is not scored as inhibition.
- Fatigue and motivation lower accuracy late in a session.

**References.**

- Stroop, J. R. (1935). Studies of interference in serial verbal reactions. J. Exp. Psychol., 18(6), 643-662.
- MacLeod, C. M. (1991). Half a century of research on the Stroop effect: an integrative review. Psychol. Bull., 109(2), 163-203.

## Cognitive flexibility

**Definition.** The ability to switch between rules or ways of thinking. Measured as the extra time and errors when you must switch from one rule to another, compared with repeating the same rule.

**What it is not.** Not a personality trait and not a diagnostic measure. It describes rule-switching on this task.

**Design note.** We use trial-by-trial task switching instead of Trail Making B because it gives one data point per trial, which the adaptive profiler needs, and because it works the same way on phones and laptops.

**Task: Number task switching.** A number appears in a coloured frame. Blue frame: is it ODD or EVEN? Orange frame: is it SMALLER or LARGER than 5? The rule can change at any time.

| Level | Settings | Ability range (fitted) |
|-|-|-|
| 1 | switch_rate: 0.25, cue_lead_ms: 600 | -1.05 → 1.39 |
| 2 | switch_rate: 0.5, cue_lead_ms: 300 | -0.77 → 1.21 |
| 3 | switch_rate: 0.5, cue_lead_ms: 0 | -0.86 → 1.26 |

**Scoring** (block score = weighted sum, each metric scaled to 0–100%):

- switch cost ms × 45%: lower is better: 0 or less → 100%, 500 or more → 0%
- switch cost errors × 30%: lower is better: 0 or less → 100%, 0.2 or more → 0%
- accuracy × 25%: 0.5 or less → 0%, 1 or more → 100%

**Uncertainty.**

- Starts at 50% ± 33 points (90% band) before any data.
- One full block (40 valid trials) is a noisy reading with SD 0.265 on the 0–1 scale; fewer valid trials → noisier (√n rule).
- Unreliable blocks (near chance, response streaks, too fast, timeouts) count 2.5× noisier; blocks at the floor/ceiling of a level count 1.5× noisier.
- Between sessions the band widens by 0.03 per day, because ability can change.
- Each block's score is mapped to ability through its level's fitted range (level ranges and obs_sd fitted on 250 simulated users, 2026-10-26; refit on pilot data).

**Data quality checks.**

- Responses faster than 200 ms count as anticipations (errors); slower than 3000 ms as timeouts.
- At least 28 valid trials needed.
- Accuracy must beat chance (50%) by 1.645 binomial SDs.
- More than 10 identical answers in a row is flagged.

**Known biases.**

- Cue learning: the first block is practice so cue-reading is not scored as flexibility.
- Speed-accuracy trade-off: both switch cost in time and switch cost in errors are scored.
- Fatigue increases switch costs late in a session.

**References.**

- Rogers, R. D., & Monsell, S. (1995). Costs of a predictable switch between simple cognitive tasks. J. Exp. Psychol. Gen., 124(2), 207-231.
- Monsell, S. (2003). Task switching. Trends Cogn. Sci., 7(3), 134-140.

## Processing speed

**Definition.** How quickly you can take in simple information and act on it correctly. Measured as how fast and accurately you match symbols to digits using a key.

**What it is not.** Not general intelligence and not a medical measure. Speed depends heavily on device, input method and how rested you are.


**Task: Symbol-digit coding.** A key at the top pairs 9 symbols with the digits 1-9. For each symbol shown, press its digit as fast as you can.

| Level | Settings | Ability range (fitted) |
|-|-|-|
| 1 | symbols: 6, key_visible: true | -0.34 → 1.45 |
| 2 | symbols: 9, key_visible: true | -0.28 → 1.35 |
| 3 | symbols: 9, key_visible: false, key_preview_s: 10 | -0.29 → 2.12 |

**Scoring** (block score = weighted sum, each metric scaled to 0–100%):

- correct per minute × 70%: 15 or less → 0%, 75 or more → 100%
- accuracy × 30%: 0.7 or less → 0%, 1 or more → 100%

**Uncertainty.**

- Starts at 50% ± 33 points (90% band) before any data.
- One full block (40 valid trials) is a noisy reading with SD 0.138 on the 0–1 scale; fewer valid trials → noisier (√n rule).
- Unreliable blocks (near chance, response streaks, too fast, timeouts) count 2.5× noisier; blocks at the floor/ceiling of a level count 1.5× noisier.
- Between sessions the band widens by 0.03 per day, because ability can change.
- Each block's score is mapped to ability through its level's fitted range (level ranges and obs_sd fitted on 250 simulated users, 2026-10-26; refit on pilot data).

**Data quality checks.**

- Responses faster than 150 ms count as anticipations (errors); slower than 5000 ms as timeouts.
- At least 10 valid trials needed.
- Accuracy must beat chance (11%) by 1.645 binomial SDs.
- More than 8 identical answers in a row is flagged.

**Known biases.**

- Device and input latency matter most here; the device type is logged and the coach compares you only with yourself.
- Motor speed (typing, tapping) is mixed into the score; this is a known limitation of all speed tasks.
- Practice effects are strong: the symbol-digit key is reshuffled every session.
- Age: speed naturally varies with age, so the app never ranks users against each other.

**References.**

- Smith, A. (1982). Symbol Digit Modalities Test (SDMT) manual. Western Psychological Services.
- Salthouse, T. A. (1996). The processing-speed theory of adult age differences in cognition. Psychol. Rev., 103(3), 403-428.

## Reasoning

**Definition.** The ability to find the rule behind a pattern and apply it to something new. Measured with generated 3x3 visual puzzles where you choose the missing piece.

**What it is not.** Not an IQ score. Puzzles are generated, unnormed and only compared with your own past results.


**Task: Generated pattern matrices.** Look at the 3x3 grid. One piece is missing. Choose the option that completes the pattern across rows and columns.

| Level | Settings | Ability range (fitted) |
|-|-|-|
| 1 | rules_per_item: 1, attributes: shape | -0.58 → 0.69 |
| 2 | rules_per_item: 2, attributes: shape/size | -0.04 → 0.78 |
| 3 | rules_per_item: 3, attributes: shape/size/count | 0.13 → 1.03 |

**Scoring** (block score = weighted sum, each metric scaled to 0–100%):

- accuracy × 90%: 0.17 or less → 0%, 1 or more → 100%
- median rt ms × 10%: lower is better: 5000 or less → 100%, 45000 or more → 0%

**Uncertainty.**

- Starts at 50% ± 33 points (90% band) before any data.
- One full block (8 valid trials) is a noisy reading with SD 0.133 on the 0–1 scale; fewer valid trials → noisier (√n rule).
- Unreliable blocks (near chance, response streaks, too fast, timeouts) count 2.5× noisier; blocks at the floor/ceiling of a level count 1.5× noisier.
- Between sessions the band widens by 0.03 per day, because ability can change.
- Each block's score is mapped to ability through its level's fitted range (level ranges and obs_sd fitted on 250 simulated users, 2026-10-26; refit on pilot data).

**Data quality checks.**

- Responses faster than 1500 ms count as anticipations (errors); slower than 60000 ms as timeouts.
- At least 6 valid trials needed.
- Accuracy must beat chance (17%) by 0.5 binomial SDs.
- More than 6 identical answers in a row is flagged.

**Known biases.**

- Puzzle familiarity: people who often solve puzzles start higher; the rule set rotates to limit this.
- Time pressure: no strict deadline, so slow careful users are not penalised for accuracy.
- Culture: shapes and rules are abstract and language-free to reduce cultural loading.
- Guessing: 1 in 6 chance per item; the profiler down-weights near-chance blocks.

**References.**

- Raven, J. (2000). The Raven's Progressive Matrices: change and stability over culture and time. Cogn. Psychol., 41(1), 1-48.
- Matzen, L. E. et al. (2010). Recreating Raven's: software for systematically generating large numbers of Raven-like matrix problems with normed properties. Behav. Res. Methods, 42(2), 525-541.

## Visuospatial memory

**Definition.** The ability to remember where things are and in what order. Measured as the longest sequence of highlighted blocks you can repeat back correctly.

**What it is not.** Not a measure of navigation skill or a diagnostic test. It describes short-term spatial span on this task.


**Task: Corsi blocks (forward).** Blocks light up one after another. When they stop, tap the blocks in the same order.

| Level | Settings | Ability range (fitted) |
|-|-|-|
| 1 | start_span: 3, backward: false | -0.10 → 1.09 |
| 2 | start_span: 4, backward: false | -0.06 → 1.14 |
| 3 | start_span: 4, backward: true | -0.03 → 1.28 |

**Scoring** (block score = weighted sum, each metric scaled to 0–100%):

- span × 70%: 2 or less → 0%, 8 or more → 100%
- total score × 30%: 4 or less → 0%, 60 or more → 100%

**Uncertainty.**

- Starts at 50% ± 33 points (90% band) before any data.
- One full block (10 valid trials) is a noisy reading with SD 0.107 on the 0–1 scale; fewer valid trials → noisier (√n rule).
- Unreliable blocks (near chance, response streaks, too fast, timeouts) count 2.5× noisier; blocks at the floor/ceiling of a level count 1.5× noisier.
- Between sessions the band widens by 0.03 per day, because ability can change.
- Each block's score is mapped to ability through its level's fitted range (level ranges and obs_sd fitted on 250 simulated users, 2026-10-26; refit on pilot data).

**Data quality checks.**

- Responses faster than 100 ms count as anticipations (errors); slower than 15000 ms as timeouts.
- At least 4 valid trials needed.
- No chance level (sequence recall).
- More than 9 identical answers in a row is flagged.

**Known biases.**

- Screen size: block positions are scaled so the layout is the same on every screen, but small phones are harder to tap.
- Chunking strategies (seeing shapes in the path) can raise span; this is allowed and noted.
- Motor errors (mis-taps) are logged separately from memory errors when the tap lands between blocks.

**References.**

- Corsi, P. M. (1972). Human memory and the medial temporal region of the brain. PhD thesis, McGill University.
- Kessels, R. P. C. et al. (2000). The Corsi block-tapping task: standardization and normative data. Appl. Neuropsychol., 7(4), 252-258.

## Working memory

**Definition.** The ability to hold a small amount of information in mind for a few seconds while updating it with new input. Measured here as how well you can track whether the current item matches the one shown N steps earlier.

**What it is not.** Not long-term memory, not intelligence, and not a diagnostic measure. Scores describe performance on this task today, on this device.


**Task: N-back (letters).** Letters appear one at a time. Press SPACE when the letter is the same as the one shown N letters ago. Do nothing otherwise.

| Level | Settings | Ability range (fitted) |
|-|-|-|
| 1 | n: 1 | -0.53 → 0.97 |
| 2 | n: 2 | -0.15 → 0.99 |
| 3 | n: 3 | -0.14 → 1.26 |

**Scoring** (block score = weighted sum, each metric scaled to 0–100%):

- d prime × 80%: 0 or less → 0%, 3.5 or more → 100%
- median rt ms × 20%: lower is better: 350 or less → 100%, 1200 or more → 0%

**Uncertainty.**

- Starts at 50% ± 33 points (90% band) before any data.
- One full block (24 valid trials) is a noisy reading with SD 0.164 on the 0–1 scale; fewer valid trials → noisier (√n rule).
- Unreliable blocks (near chance, response streaks, too fast, timeouts) count 2.5× noisier; blocks at the floor/ceiling of a level count 1.5× noisier.
- Between sessions the band widens by 0.03 per day, because ability can change.
- Each block's score is mapped to ability through its level's fitted range (level ranges and obs_sd fitted on 250 simulated users, 2026-10-26; refit on pilot data).

**Data quality checks.**

- Responses faster than 150 ms count as anticipations (errors); slower than 2500 ms as timeouts.
- At least 16 valid trials needed.
- Accuracy must beat chance (50%) by 1.645 binomial SDs.
- More than 12 identical answers in a row is flagged.

**Known biases.**

- Practice effects: scores rise with familiarity with the task itself, not only with working-memory growth.
- Fatigue and time of day lower performance; the session time is logged so the coach can mention it.
- Input latency differs between touch screens and keyboards; RT carries only a small weight for this reason.
- Strategy (e.g. verbal rehearsal of letters) helps more at 1-back than at 3-back.

**References.**

- Kirchner, W. K. (1958). Age differences in short-term retention of rapidly changing information. J. Exp. Psychol., 55(4), 352-358.
- Owen, A. M. et al. (2005). N-back working memory paradigm: a meta-analysis of normative functional neuroimaging studies. Hum. Brain Mapp., 25(1), 46-59.
