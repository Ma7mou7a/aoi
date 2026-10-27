# "Trust the Machine?" Game and Camera Focus Check: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seventh skill, measured by a new game, that shows how well the user relies on an AI helper that is sometimes wrong (automation bias, measured from behaviour). Feed it into the AI Collaboration Score. Separately, add an optional in-browser camera check that notes when no face is looking at the screen, used only as one attention cue.

**Architecture:** The game is a new paradigm, `trust_machine`, wired like the six existing ones: a generator, metrics, a simulator, a renderer, and a YAML dimension. It flows through the existing scoring, profiler, selector, validation and coach with no special cases. After each block, per-trial outcomes become new collaboration signals. The camera check is a client-only hook that uses MediaPipe Face Detector with the model file self-hosted under `public/`. It adds `behaviour.faceAway` to trials, which `inferAffect` reports as a cue. It never changes a score and never uploads video.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Vitest, Drizzle/PGlite, `@mediapipe/tasks-vision` (new dependency, pinned exact version).

**Spec:** this conversation (2026-10-27) and `docs/out-of-the-box-ideas.md`. In summary: (1) a game where puzzles come with an AI suggestion that is wrong at a controlled rate; it measures catching wrong help *and* accepting right help, adapts difficulty, and feeds the collaboration score. (2) An optional camera "focus check": face present and facing the screen only, no emotion labels, processed in the browser, nothing stored or uploaded, never the sole basis of any decision. Voice fatigue is out of scope.

## Global Constraints

- Non-clinical copy everywhere. No emotion words in camera UI: say "looking away", never "distracted", "bored" or "tired".
- Camera is off by default and needs the existing `camera` consent kind (`src/db/schema.ts:36`). The camera hook must never start without it.
- No video frames, images or landmarks leave the browser or reach the database. Only the boolean `faceAway` per trial is stored.
- The camera cue never changes `composite`, `validity` or `observation`. It appears only in the `inferAffect` cues and the coach evidence.
- The trust game's AI helper is honest about being a test: the instructions say "the helper is sometimes wrong on purpose". This copy is fixed and goes in the YAML `instructions`.
- New collaboration signals must be added to `SIGNALS` in `src/lib/collab/score.ts` (the single source of truth for code, UI and docs).
- Pin `@mediapipe/tasks-vision` to an exact version. Self-host `blaze_face_short_range.tflite` and the wasm files under `public/mediapipe/`, so there are no runtime CDN requests.
- Keep all existing tests green (104 at the time of writing).

## Review Focus

1. **The user answers before the helper's suggestion appears, or never looks at it.** Score as normal. Reliance metrics count only trials where the suggestion was visible for ≥ 300 ms (test in Task 1).
2. **The helper is wrong on 0 trials in a short block** (randomness). The generator guarantees at least 3 wrong-helper trials per block (test in Task 1).
3. **Camera permission is denied or there is no camera.** The block runs exactly as without a camera; `faceAway` stays undefined, not false (test in Task 5).
4. **The camera is consented but the face detector fails to load (offline).** The hook reports `unavailable` and the game is unaffected (test in Task 5).
5. **A user rejects every suggestion** ("never trust AI"). They must not score high: rejecting correct help counts against them, so the score sits near chance (test in Task 2).

---

### Task 1: Trust-game generator

**Files:**
- Create: `src/lib/tasks/trustMachine.ts`
- Test: `src/lib/tasks/trustMachine.test.ts`

**Interfaces:**
- Produces:
  - `type TrustParams = { trials_per_block: number; practice_trials: number; helper_accuracy: number; near_miss: boolean; max_response_ms: number }`
  - `type TrustItem = { prompt: string; options: [string, string]; answer: 0 | 1; suggestion: 0 | 1; helperWrong: boolean }`
  - `generateTrustMachine(p: TrustParams, seed: number): TrustItem[]`
- Items are two-choice quick-judgement puzzles, e.g. "Which is larger: 37 × 6 or 214?". When `helperWrong` is true, `suggestion = 1 − answer`. With `near_miss`, the two options differ by ≤ 5%.

- [ ] **Step 1: Write the failing tests**

```ts
it("is deterministic per seed", () => expect(generateTrustMachine(P, 7)).toEqual(generateTrustMachine(P, 7)));
it("makes the helper wrong at about 1 - helper_accuracy", () => {
  const items = Array.from({ length: 50 }, (_, s) => generateTrustMachine(P, s)).flat();
  expect(items.filter((i) => i.helperWrong).length / items.length).toBeCloseTo(1 - P.helper_accuracy, 1);
});
it("guarantees at least 3 wrong-helper items per block", () => {
  for (let s = 0; s < 200; s++) expect(generateTrustMachine({ ...P, trials_per_block: 12, helper_accuracy: 0.9 }, s).filter((i) => i.helperWrong).length).toBeGreaterThanOrEqual(3);
});
it("answer is correct arithmetic and suggestion follows helperWrong", () => {
  for (const i of generateTrustMachine(P, 3)) expect(i.suggestion === i.answer).toBe(!i.helperWrong);
});
```
Use `const P = { trials_per_block: 20, practice_trials: 2, helper_accuracy: 0.75, near_miss: false, max_response_ms: 8000 }`.

- [ ] **Step 2: Run to verify they fail.** Run: `node node_modules/vitest/vitest.mjs run src/lib/tasks/trustMachine.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `generateTrustMachine`** with `createRng(seed)` from `src/lib/rng`. Draw `helperWrong` per item, then force wrong items up to 3 at random positions if short.
- [ ] **Step 4: Run to verify they pass.** Same command. Expected: 4 passed.
- [ ] **Step 5: Commit.** `git commit -m "feat(trust): puzzle generator with controlled helper errors"`

### Task 2: Metrics, simulator, paradigm registration

**Files:**
- Modify: `src/lib/dimensions/schema.ts` (`PARADIGMS`, add `"trust_machine"`)
- Modify: `src/lib/scoring/metrics.ts` (add `trust_machine` to the paradigm map)
- Modify: `src/lib/sim/index.ts` (cases in `simulateBlock` and `responses`)
- Modify: `src/lib/tasks/trustMachine.ts` (add `simulateTrustMachine`)
- Test: `src/lib/tasks/trustMachine.test.ts`

**Interfaces:**
- Consumes: `generateTrustMachine`, `TrustItem` (Task 1).
- Produces:
  - Trial stimulus shape: `{ prompt, options, suggestion, helperWrong, shownMs }`; `expected` is `answer`; `response` is 0, 1 or null.
  - Metrics from `computeMetrics("trust_machine", trials)`:
    - `error_catch_rate`: share of helperWrong trials answered correctly;
    - `appropriate_reliance`: share of helper-right trials answered correctly;
    - `reliance_d_prime`: probit(catch) − probit(1 − appropriate), using the same log-linear correction as n-back;
    - `accuracy`;
    - `median_rt_ms`.
  - Trials with `stimulus.shownMs < 300` are excluded from the reliance metrics (Review Focus 1).
  - `simulateTrustMachine(items, ability, rng): TrialRecord[]`: catch probability rises with ability; an "always reject" behaviour is reachable via `simulateBlock(..., "same_key")`.

- [ ] **Step 1: Write the failing tests**

```ts
it("perfect user: catch 1, reliance 1", () => { /* build trials answering every item correctly */ expect(m.error_catch_rate).toBe(1); expect(m.appropriate_reliance).toBe(1); });
it("always-follow user: catch 0, reliance 1", () => { /* response = suggestion */ expect(m.error_catch_rate).toBe(0); expect(m.appropriate_reliance).toBe(1); });
it("always-reject user scores near chance (Review Focus 5)", () => { /* response = 1 - suggestion */ expect(m.reliance_d_prime).toBeLessThan(0.5); });
it("excludes trials where the suggestion was shown under 300 ms", () => { /* set shownMs: 100 on all helperWrong trials */ expect(Number.isNaN(m.error_catch_rate)).toBe(true); });
it("simulated ability raises reliance_d_prime", () => { expect(mean(dHigh)).toBeGreaterThan(mean(dLow) + 0.5); });
```

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the metrics function and `simulateTrustMachine`; register the paradigm** in `PARADIGMS`, the metrics map, and `simulateBlock`/`responses` (response alphabet `[0, 1]`).
- [ ] **Step 4: Run the file, then the full suite.** `node node_modules/vitest/vitest.mjs run`. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(trust): metrics, simulator, paradigm"`

### Task 3: Dimension YAML, calibration, validation

**Files:**
- Create: `dimensions/ai_reliance.yaml`
- Modify: `scripts/validate.ts` only if a run shows the new dimension needs special handling (expected: none)
- Regenerate: `docs/measurement-cards.md`, `docs/validation.md`, `public/validation.json`

**Interfaces:**
- Consumes: the paradigm from Task 2.
- Produces: dimension id `ai_reliance`, name "AI reliance", task id `trust_machine`, three levels:

| Level | helper_accuracy | near_miss |
|-|-|-|
| 1 | 0.70 | false |
| 2 | 0.80 | false |
| 3 | 0.85 | true |

  - Scoring components: `reliance_d_prime` weight 0.7 (linear, min 0, max 3), `accuracy` weight 0.3 (linear, min 0.5, max 1).
  - Validity: `chance_accuracy: 0.5`, `min_rt_ms: 300`.
  - The measurement card's "what it is not" says: not a measure of intelligence or of general trust in technology.

- [ ] **Step 1: Write the YAML** by copying the structure of `dimensions/reasoning.yaml`, including a definition, `what_it_is_not`, references (Parasuraman & Manzey 2010; Lee & See 2004), and the fixed instructions from Global Constraints.
- [ ] **Step 2: Run the config check.** `node node_modules/tsx/dist/cli.mjs scripts/check-dimensions.ts`. Expected: "7 dimensions valid."
- [ ] **Step 3: Fit and validate.** `node node_modules/tsx/dist/cli.mjs scripts/validate.ts --apply`. Expected for `ai_reliance`:
  - E1 coverage ≥ 0.88;
  - E3 genuine false alarms ≤ 0.10;
  - E3 same_key flagged ≥ 0.9.
  If a threshold fails, adjust `chance_margin_z` only and record why in the YAML comment.
- [ ] **Step 4: Regenerate cards and run the full suite.** `node node_modules/tsx/dist/cli.mjs scripts/cards.ts`, then vitest. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(trust): AI reliance dimension, calibrated"`

### Task 4: Renderer and collaboration signals

**Files:**
- Create: `src/components/tasks/TrustMachineTask.tsx`
- Modify: `src/lib/tasks/registry.ts` (`AVAILABLE_PARADIGMS`)
- Modify: `src/components/PlaySession.tsx` and `src/components/TryTask.tsx` (renderer maps)
- Modify: `src/lib/collab/score.ts` (`SIGNALS`)
- Modify: `src/lib/server/blocks.ts` (emit signals after a `trust_machine` run)
- Modify: `src/components/BlockResultCard.tsx` (`METRIC_LABELS`, `detail()`)
- Test: `src/lib/collab/collab.test.ts`

**Interfaces:**
- Consumes:
  - `TrustItem` (Task 1) and the trial shape (Task 2);
  - `stampOnFrame` from `src/components/tasks/common.tsx`;
  - `recordSignals(userId, SignalInput[])` from `src/lib/server/collab.ts`.
- Produces:
  - **New `SIGNALS` entries:**

| Signal | Component | Value | Label |
|-|-|-|-|
| `caught_ai_error` | critical_verification | 1.0 | "Caught a wrong AI suggestion in the trust game" |
| `followed_ai_error` | critical_verification | 0.0 | "Followed a wrong AI suggestion in the trust game" |
| `used_correct_ai_help` | autonomy | 0.9 | "Used correct AI help in the trust game" |
| `rejected_correct_ai_help` | autonomy | 0.4 | "Rejected correct AI help in the trust game" |

  - **Signal emission:** `trustSignals(trials: TrialRecord[]): SignalInput[]`, exported from `src/lib/collab/score.ts`. It emits one signal per scored trial with `shownMs ≥ 300` and caps output at 12 signals per block, keeping the proportions.
  - **Renderer UX:** the puzzle shows first. The helper's suggestion appears 600 ms later as "AI helper suggests: …". Two answer buttons; keys F/J. Store `shownMs` = time from suggestion paint (`stampOnFrame`) to response.

- [ ] **Step 1: Write the failing test** for `trustSignals`:

```ts
it("maps trust-game trials to collaboration signals", () => {
  const s = trustSignals([caughtWrong, followedWrong, usedRight, rejectedRight, tooFast]);
  expect(s.map((x) => x.signal)).toEqual(["caught_ai_error", "followed_ai_error", "used_correct_ai_help", "rejected_correct_ai_help"]);
});
it("caps at 12 signals per block", () => expect(trustSignals(fortyTrials).length).toBe(12));
it("all new signals exist in SIGNALS", () => { for (const k of ["caught_ai_error", "followed_ai_error", "used_correct_ai_help", "rejected_correct_ai_help"]) expect(SIGNALS).toHaveProperty(k); });
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `trustSignals`, the `SIGNALS` entries, the call in `blocks.ts`** after a completed `trust_machine` run, the renderer, and the registry and renderer-map entries.
- [ ] **Step 4: Run vitest, tsc and eslint.** Expected: all pass. Then play one block in the browser at `/try/trust_machine` and confirm in the DB (or `/coach` collab card) that signals were recorded.
- [ ] **Step 5: Commit.** `git commit -m "feat(trust): renderer and collaboration signals"`

### Task 5: Camera focus hook

**Files:**
- Create: `src/components/tasks/useFocusCamera.ts`
- Create: `public/mediapipe/` (model and wasm, copied from the pinned package)
- Modify: `package.json` (`@mediapipe/tasks-vision` exact version)
- Test: `src/components/tasks/focusCamera.test.ts` (pure logic only)

**Interfaces:**
- Produces:
  - `useFocusCamera(enabled: boolean): { status: "off" | "starting" | "on" | "denied" | "unavailable"; isFaceAway: () => boolean | undefined }`.
  - Pure helper `faceAwayFrom(detections: Array<{ boundingBox: { width: number } ; keypoints: Array<{ x: number }> }>, frameWidth: number): boolean`:
    - no detection → true;
    - otherwise true when the nose keypoint's horizontal offset from the eyes' midpoint exceeds 0.35 × the inter-eye distance (head turned).
- Behaviour:
  - Runs detection at most every 200 ms on a hidden `<video>`.
  - `isFaceAway()` returns true when any of the last 3 readings is away.
  - Returns undefined when status is not "on".

- [ ] **Step 1: Write the failing tests** for `faceAwayFrom`: no faces → true; centred face → false; nose offset 0.5 × eye distance → true.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `faceAwayFrom` and the hook.**
  - Denied permission sets "denied" and a failed model load sets "unavailable"; both are silent for the game (Review Focus 3 and 4).
  - Stop all tracks on unmount.
- [ ] **Step 4: Run tests, tsc and eslint.** Expected: pass. Confirm in the browser's Network tab that there are no requests outside localhost.
- [ ] **Step 5: Commit.** `git commit -m "feat(camera): in-browser face-presence hook"`

### Task 6: Wire camera into tasks, affect, settings and coach

**Files:**
- Modify: `src/lib/scoring/types.ts` (`behaviour.faceAway?: boolean`)
- Modify: `src/components/tasks/common.tsx` (a `useTrialBehaviour` helper, or the existing behaviour capture, reads `isFaceAway()` at response time)
- Modify: the 7 renderers only where they build `behaviour` (one line each)
- Modify: `src/lib/affect/index.ts` (cue "looked away from the screen on N trials" when N ≥ 3; it raises fatigue at most one level, like `focusLost`)
- Modify: `src/lib/coach/evidence.ts` (`factsFor`: add "trials where you looked away from the screen")
- Modify: `src/components/SettingsForm.tsx` (camera toggle copy, verbatim: "Focus check (optional): your camera checks only whether a face is looking at the screen. Video never leaves your device and nothing is recorded. It can add a 'looked away' note to your results; it never changes a score.")
- Test: `src/lib/affect/affect.test.ts`, `src/lib/coach/coach.test.ts`

**Interfaces:**
- Consumes: `useFocusCamera` (Task 5); the `camera` consent via the existing consent API.

- [ ] **Step 1: Write the failing tests:**
  - `inferAffect` with 4 `faceAway` trials includes a "looked away" cue;
  - `scoreBlock` composite is identical with and without `faceAway` flags (Global Constraint);
  - the evidence pack includes the "looked away" fact.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.** Renderers call `useFocusCamera(cameraConsent)` once per block, through the shared helper in `common.tsx`.
- [ ] **Step 4: Run the full suite, tsc, eslint and `next build`.** Expected: all pass. In the browser:
  - with consent: turn your head away during a block and confirm the result card shows the cue;
  - without consent: the camera light never turns on.
- [ ] **Step 5: Commit.** `git commit -m "feat(camera): optional focus cue in affect and coach"`

### Task 7: Docs, deck and Q&A

**Files:**
- Modify:
  - `docs/technical-report.md` (Section 2 table row; Section 6 collab inputs; Section 7 bonus: camera)
  - `docs/ethics.md` (camera paragraph)
  - `docs/collaboration-score.md` (new signals)
  - `docs/defence-qa.md` (two Q&As: "isn't the trust game deceptive?" and "why not detect emotion from the face?", citing Barrett et al. 2019 and EU AI Act Art. 5(1)(f))
  - `README.md` (7 skills, test count)
  - `deck/project/slides/collab.html` and `bonus.html`
  - the Claude Doc report

- [ ] **Step 1: Update each file with numbers from the Task 3 validation run** (no estimates).
- [ ] **Step 2: Verify** with a grep for "6 skills" / "six skills" across README, docs and deck. Expected: only historical mentions remain.
- [ ] **Step 3: Commit and push.** `git commit -m "docs: trust game and camera focus check"`, then `git push origin main`, then confirm the GitHub Actions run is green.
