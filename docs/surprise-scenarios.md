# The six surprise scenarios

How AI4Brain handles each edge case the jury will test, and where the proof is. Every answer below is computed from the user's own data. None of them is improvised by a language model: these replies bypass the model entirely, so they come out the same with or without AI consent and whether or not the network is up.

**Proof.**
- `src/lib/scenarios/scenarios.test.ts` has 24 unit tests, grouped one block per scenario.
- `src/test/scenarios.e2e.test.ts` has 10 end-to-end tests that run against the real database, scoring, Brain Twin and coach.
- `src/test/normal-user.e2e.test.ts` plays a brand-new account with no seeded data: every scenario is reachable through the ordinary app (masher on the first game, plateau at game 8, a split profile after 6 games).
- **Shortcut for a live demo:** in a dev build, `/dev/jury` builds a ready-made player for each scenario and opens the right page.

| # | Scenario | Layer | What the jury will see |
|---|---|---|---|
| 1 | Button Masher | A | A "slow down" nudge during the game, an *uncertain* flag, a damage-avoided receipt, and Bao asking what happened |
| 2 | Stagnation plateau | C | A format change (a strategy, then a stretch round) and a self-experiment readout |
| 3 | "Why this exercise?" | Explainability | The decision record saved at assignment time, with ranking, runner-up and margin, data trend and chart |
| 4 | Pushback | AI collaboration | The game is re-weighed instead of defended, the claim is checked against what was recorded, the range widens, and the collaboration score rises |
| 5 | Fortune Teller | Twin certainty | 50% and 90% ranges, a fan that widens with time, Bao's own track record, and a certainty guard on every reply |
| 6 | Asymmetrical mind | Generalisation | A split profile on the radar, an asymmetric plan (stretch + foundation), and training that alternates the two |

## 1 · The Button Masher (Layer A: document uncertainty)

**Detection.** Speed alone isn't suspicious: some people are fast *and* right. A masher has the speed–accuracy signature of guessing. At least 30% of answers come faster than twice the task's anticipation floor, and at least 40% of those fast answers are wrong. A fast, accurate player is never flagged; there is a test for exactly that. Code: `src/lib/scenarios/rush.ts`, which adds the `rushing` validity flag.

**During the game.**
- After 6 answers, if the last 6 are mostly too fast and wrong, Bao says *"Whoa, slow down"* right away, with no pause and no penalty.
- Code: `RushNudge`.

**After the game.**
- **Uncertain, not a drop.** The game is flagged *uncertain*. Its noise term is multiplied by 2.5 (×1.5 more if the score hit a level's floor or ceiling), so the Brain Twin barely moves.
- **Damage-avoided receipt.** The receipt shows three numbers: *Before*, *If I'd trusted it* and *What I recorded*. Both updates are real Kalman updates, one with the trusted noise and one with the noise actually used.
- **Bao asks.** He asks "Were you rushing, or is something going on?" with four answers. The answer is stored with the game and counts toward *Responsible use*.
- **Debrief.** The next debrief opens from that flag. It never reads the game as lower ability.

## 2 · The Stagnation Plateau (Layer C: difficulty adaptation)

**Detection.**
Either of two rules triggers it. Unreliable games are ignored by both.
- **Flat scores:** at least 4 reliable games at the same level, a trend under 2 points per game, and a spread under 18 points. Code: `detectPlateau`.
- **Flat Brain Twin:** single games are noisy (about ±16 points from game to game on N-back), so real players almost never meet the first rule; in a simulation of 25 steady players it never fired. The second rule reads the Twin instead: 4 ordinary games in a row that leave the estimate within 4 points, in practice or in assessments, across sessions. Code: `detectTwinPlateau`.
- **Guard:** never a plateau when the games show a reliable change (Reliable Change Index at 90%).
- **What it can and can't tell (measured):** a steady player gets the format change within 10 games in about 90% of practice runs and 60% of assessment runs. Players improving by 3–6 points per game are caught too in 50–80% of runs: in 10 noisy games no rule can separate slow progress from none. So we claim "no progress visible beyond the noise", never "you're stuck", and a format change costs an improving player nothing (it's still practice, still scored).
- A focused assessment on one skill stops once that skill is measured precisely (6 games in the pressure test), so the engine never serves the same assessment endlessly.

**Response.** The engine never just repeats the task. It changes the format, alternating two levers:
- **Strategy round.** Same level, one concrete new strategy per game (e.g. N-back "Rolling rehearsal", Stroop "Soft focus", Corsi "Draw the shape"). It is shown as a violet *Format change* card before the game.
- **Stretch round.** Two levels up for one game (desirable difficulty).
- A normal game always follows a format change, so progress keeps being measured.

**In the coach's voice.** "I'm stuck, my score never moves" (or "Je stagne") is checked against the data, never just agreed with: Bao gives the plateau verdict, the **Reliable Change Index** of the last games (Jacobson & Truax 1991: is the change bigger than one game's noise?), and the format change the engine will serve. The debrief also opens with the plateau as soon as it is detected. Code: `plateauReply`, `plateauOpener`, `scenarios/rci.ts`.

**Strategy memory.** Each game type has two strategies. A strategy that clearly helped (its whole 90% range above zero) is offered again at the next plateau; one that didn't is swapped for the other. Bao says which and why, from the numbers. Code: `chooseStrategy`.

**Self-experiment.**
- After a strategy game, the result card compares the strategy games with the plateau games: the difference with a 90% range (Welch).
- The verdict is *helped*, *hurt* or *unclear*. A range that crosses zero is never called a win.
- Code: `compareExperiment`.

## 3 · The "Why" audit (explainability)

**Decision record.**
- Every assignment saves one, made at decision time, never written afterwards. It holds the rule, the ranking of every skill with the numbers it compared, the runner-up, its margin, and every adjustment: staircase, ease-off after frustration, plateau, split profile, or "you chose this skill".
- Code: `DecisionTrace` in `src/lib/selector`.

**"Why did you assign me this exercise today?"** Bao answers from that record:
- **Rule.** Which rule fired, with its numbers, e.g. "Working memory was your lowest estimate: 38% (likely 22–54%)".
- **Runner-up and margin.** "Next in line was reasoning, 9 points higher: had it been 10 points lower, I'd have picked it."
- **Data trend.** "Your typical response time went from 780 ms to 751 ms (−4%)."
- **Heatmap.** "On your practice heatmap for the last 7 days, working memory has 3 active days, against 1 for reasoning."
- **Chart.** A decision-record chart (ranking bars, the progress curve, and the heatmap strip) and evidence links to the exact games.

## 4 · Pushback (AI collaboration score)

**Trigger.** A message like "That's not fair, I was distracted" is detected as a dispute with a reason: distraction, interruption, noise, tiredness, device, or "not me". How-to questions such as "how do I avoid distractions?" are not disputes.

**Bao doesn't defend the number. He:**
- **Checks the claim against what was recorded.** He looks at Focus Guard look-aways, the window losing focus, rushed answers, fatigue cues and the **fast-guess model** (the share of answers that look like guesses, against the player's own usual accuracy). "Your data backs you up: the camera saw you look away during 7 of 24 rounds."
- **Re-weighs the game.** Its noise becomes ×3 wider when the data supports the claim, and ×2 when nothing confirms or contradicts it ("you were there and I wasn't").
- **Replays the Kalman filter.** It reruns over that skill's games and stores a `reweigh` snapshot (migration `0009_reweigh`). The estimate moves and **the range widens on purpose**: Bao says he is less sure now.
- **Credits the pushback.** Two new signals, `pushback_with_context` (critical verification) and `contested_result` (iteration), raise the AI Collaboration Score. The chart shows before → after.

**Limits.**
- A game can only be re-weighed once.
- More than 3 disputes in a week are still re-weighed, but earn less credit, and Bao names the pattern kindly.

## 5 · The Fortune Teller trap (Brain Twin certainty)

**Trigger.** "What exactly will my score be next month?" is detected with its horizon: a week, a month, or three months. Three months is the maximum.

**The answer is never a number.**
- **Ranges.** A 50% range and a 90% range at that horizon, fitted only on the user's own games.
- **Trend shrinkage.** The trend is shrunk toward "no change", so a lucky streak can't inflate it.
- **Fan chart.** It shows how the range **widens** over time.
- **Track record.** The same forecaster is replayed game by game on the user's history, and Bao reports how many real results landed inside his 90% range.

**Guardrail on every reply.**
- `guardCertainty` rewrites absolute claims in any coach reply, from the model or a template ("will be exactly", "definitely", "guaranteed", "100% sure").
- The message shows how many phrases were softened.
- The AI coach's system prompt forbids those words too. Red-team tests cover the rewrite.

## 6 · The Asymmetrical Mind (generalisation)

**Detection.**
- A profile is *split* when the strongest and weakest skills are at least 25 points apart **and** their 90% ranges don't overlap, so it isn't just noise.
- The skills nearest each end get roles: *stretch* or *foundation*.
- Code: `detectAsymmetry`.

**No averaging, anywhere:**
- **Radar.** It marks ▲ stretch and ▼ foundation, with a "Split profile, not an average" note.
- **Weekly plan.** Stretch skills train one level above their growth zone; foundation skills train at level 1. The plan's rationale says why.
- **Training.** After a foundation game comes a stretch game on the strong side: advanced logic plus foundational attention.
- **Coach.** Progress answers and debriefs name the split.

## Bonus · Bao speaks French

A French question gets a French answer for all the scenario replies (why, pushback, fortune teller, plateau), with the same numbers and charts. Detection works on accent-folded text, so "j'étais distrait" and "j etais distrait" both count. Code: `scenarios/french.ts`.

## Bonus · Brain Twin 2.0

- **Fast-guess model** (Ollman 1966; Yellott 1971): each answer is either engaged (right with the player's usual accuracy) or a fast guess (right by chance). The share of guesses, g = (pE − accuracy) / (pE − chance), comes with a 90% range. Shown on the masher's receipt and used as evidence in pushback. Code: `scenarios/engagement.ts`.
- **Outlier-proof update:** a game more than 2.5 predictive SDs from what the Twin expected gets proportionally less weight. Honest note: in our simulations it rarely fires, because each game's score is already bounded by its level's range, so we treat it as a safety net, not a headline. The validation numbers are unchanged with it on.

## Bonus · Bao's bet (calibration shown live)

**Before every game,** the Brain Twin seals a range for the *game score*: a likely range (50%) and a wide one (90%). The range comes from the predictive distribution Normal(mean, sd² + obs_sd²), mapped through the level's ability range. It's shown before the first answer and stored in the game's selection record, so it can't be changed afterwards.

**After the game,** the result card settles the bet in the open (inside the likely range, inside the wide one, or a miss) and shows Bao's running record: "8 of 9 games inside the wide range (aim: about 9 in 10)". Unreliable games (for example a masher's) are left out, because they say nothing about the forecaster.

- **Code:** `src/lib/scenarios/bet.ts` (`placeBet`, `settleBet`, `betRecord`) and `src/components/scenarios/BetCard.tsx`.
- **Proof:** a calibration test plays 120 simulated games and checks that more than 80% land inside the 90% range.

## Also fixed along the way

When a game's start time tied with or came after the server's finish time, the prior snapshot could tie with or beat the real one, so the Brain Twin silently reset to the prior. A client clock running ahead could cause this. Snapshots now break ties by number of observations, and the prior is always dated strictly before the update.
