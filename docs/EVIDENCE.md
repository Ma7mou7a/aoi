# Evidence map

Every claim we make, and where to check it. All tests run with `npm test` (612 tests). The validation study runs with
`npm run validate` (500 simulated users with known abilities, through the real pipeline; results in `docs/validation.md`).

## The six surprise scenarios

| Jury requirement (from the brief) | What AI4Brain does | Code | Proof |
|-|-|-|-|
| **Button masher:** flag the data as highly uncertain, not a drop; the coach asks if the user is distracted or rushing | "Whoa, slow down" during the game; the game is flagged *uncertain* (2.5× noise); a receipt shows the damage avoided; the **fast-guess model** estimates the share of guesses with a 90% range; Bao asks "Were you rushing, or is something going on?" | `scenarios/rush.ts`, `scenarios/engagement.ts`, `UncertainBlockCard.tsx` | `scenarios.test.ts` (block 1), `twin2.test.ts` (fast-guess), `normal-user.e2e.test.ts` (1) |
| **Plateau:** detect it across sessions; the Coach triggers a format change or new strategy | Detected on the scores or on the Brain Twin (4 games at one level that don't move the estimate), across sessions. The engine changes the format (strategy round, then stretch round); **Bao names it in the chat** ("I'm stuck" / "Je stagne") and in the debrief, with a **Reliable Change Index**; **strategy memory** reuses a strategy that helped and swaps one that didn't | `scenarios/plateau.ts`, `server/blocks.ts` (`plateauState`), `server/scenarios.ts` (`plateauReply`, `plateauOpener`), `scenarios/rci.ts` | `scenarios.test.ts` (block 2), `twin2.test.ts` (RCI, strategy memory), `normal-user.e2e.test.ts` (2, 2b) |
| **"Why" audit:** cite heatmaps or progress curves with data-driven reasons | Answered from the **decision record saved when the game was assigned**: the rule, the ranking, the runner-up and its margin, the response-time trend ("805 ms → 866 ms, +8%"), the **practice heatmap** of the last 7 days, and a chart with the progress curve and the heatmap strip | `selector` (`DecisionTrace`), `server/scenarios.ts` (`whyReply`, `practiceHeatmap`), `ScenarioChart.tsx` | `scenarios.e2e.test.ts` (3), `normal-user.e2e.test.ts` (heatmap, French) |
| **Pushback:** reward it through critical verification and iteration; raise the uncertainty instead of defending | Bao checks the claim against what was recorded (camera look-aways, window focus lost, rushing, **fast-guess share**), re-weighs the game (×3 noise if supported, ×2 if not), replays the Kalman filter so **the range widens on purpose**, and credits `pushback_with_context` (critical verification) and `contested_result` (iteration) | `scenarios/dispute.ts`, `server/scenarios.ts` (`disputeReply`) | `scenarios.e2e.test.ts` (4), `normal-user.e2e.test.ts` |
| **Fortune teller:** always uncertainty, never certainty; guardrails; probabilistic language | Never a number: 50% and 90% ranges, a fan chart that widens with time, Bao's own track record; `guardCertainty` rewrites "definitely / exactly / guaranteed" in every reply | `scenarios/certainty.ts`, `server/scenarios.ts` (`fortuneReply`) | `scenarios.test.ts` (block 5), red-team tests |
| **Asymmetrical mind:** no average; radar shows the split; advanced logic + foundational attention | A split is called only when the 90% ranges don't overlap; the radar marks ▲ stretch / ▼ foundation; the plan trains strong skills above and weak skills at the foundation level; training alternates the two | `scenarios/asymmetry.ts`, `plan`, `RadarBand.tsx` | `scenarios.test.ts` (block 6), `normal-user.e2e.test.ts` (6) |

**All six work for an ordinary new account** (no seeded data): `src/test/normal-user.e2e.test.ts`.
**All six also work in French:** a French question gets a French answer (`scenarios/french.ts`).
**None of the six answers uses a language model:** they're computed from data, so they're the same with or without AI consent or network.

## Beyond the brief

| Claim | Proof |
|-|-|
| The Brain Twin's 90% ranges contain the true ability 89–95% of the time | `docs/validation.md` (E1), `npm run validate` |
| Adaptive game choice: 10% lower error than random | `docs/validation.md` (E2) |
| 98% of invalid play is flagged, about 1% false alarms | `docs/validation.md` (E3) |
| Slower but accurate players aren't penalised (bias under 2 points) | `docs/validation.md` (E6) |
| **Bao's bet:** a score range sealed before each game; more than 80% of games land inside the wide range | `scenarios/bet.ts`, `scenarios.test.ts` (calibration test) |
| Every number the coach says matches the evidence it cites | `coach/claims.ts` number check, `coach.test.ts` |
| A new skill is one YAML file, no code change | `npm run new-dimension`, `docs/adding-a-dimension.md` |

## Honest limits

- The validation is on simulated players, not real people. A pilot (about 30 people × 2 sessions) is the next step.
- The outlier-proof update (`robustUpdate`) is a safety net: in our simulations it rarely fires, because each game's score is already bounded by its level's range.
- The plateau rule can't separate slow progress from none in 10 noisy games (it also fires for 50–80% of simulated players improving 3–6 points per game). We say "no progress visible beyond the noise", and a format change is harmless for an improving player.

## Pressure test against the brief

`src/test/pressure.e2e.test.ts` plays each scenario the ways a jury might (fresh accounts, real pipeline) and prints a pass/fail table: **64/64 pass**. It covers:
- **Masher:** every game type, in an assessment.
- **Plateau:** practice in one session, a new session each game, focused assessments, and ordinary "Measure me" sessions.
- **Phrasings:** 8 plateau, 7 why, 7 pushback and 7 fortune-teller phrasings, in English and French.
- **Pushback:** uncertainty up and collaboration score up.
- **Fortune Teller:** never a certain number.
- **Asymmetry:** flawless logic vs failing attention.
