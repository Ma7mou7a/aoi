# UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn AI4Brain from "good concept, zero UX" into a demo-winning experience: a coach that talks and acts, Bao the panda, plain-words results, a 60-second first visit, bamboo rewards, a daily challenge and a 3D Brain Twin, without weakening the science or the ethics.

**Architecture:** Pure logic first (intent, lines, actions, pace, memory, rewards, daily seed, brain geometry), each in its own small module with Vitest tests. Then server wiring:
- `generateCoachMessage` takes a new draft contract and a template fallback.
- `recordRun` awards rewards.
- `nextBlock` serves daily seeds.

Then UI: panda components driven by a tiny event bus, the coach chat rebuilt from small components, and the result card, onboarding, landing page and dashboard. 3D is a lazy-loaded React Three Fiber point cloud with an SVG fallback.

**Tech Stack:** Next.js 15 (app router), React 19, TypeScript, Tailwind 4, Drizzle + PGlite, Zod, Vitest. New: `three`, `@react-three/fiber@9`, `motion`, `canvas-confetti` (+ `@types/three`, `@types/canvas-confetti`).

**Spec:** `docs/superpowers/specs/2026-10-27-ux-overhaul-design.md`. Read it before starting. Section numbers below (§4.1 …) refer to it.

## Global Constraints

- **English only.** Plain words on user-facing main screens: "score" (not "estimate"), "how sure we are" (not "band" / "credible interval"), "game" (not "block"), "game score" (not "composite"). `/validation`, `/skills` and `docs/` keep technical terms.
- **Only compare the user with themselves.** No leaderboards, no friend comparison, no norms.
- **Reward effort and consistency, never raw score level.**
- **No health or "brain improvement" claims.** Say "your scores on these games".
- **Every number in any coach text must pass `finaliseDraft`'s number check.** The clinical filter runs on every coach string, including fallback lines.
- **Consents stay opt-in** and nothing is pre-ticked. AI consent may be asked in chat with this exact copy: "Want me to use AI to answer in my own words? I'd send a summary of your scores (never your name) to an AI model. You can change this any time in Settings."
- **Bao is `quiet` (blink only) during `assessment` blocks.** Per-trial reactions happen only in `training` mode, `/try`, `/start` and `/daily` when signed out.
- **Every animation and 3D effect honours `prefers-reduced-motion`** and has a static fallback.
- **Pin new dependencies to exact versions** (`npm i -E`). Check versions with `npm view <pkg> version`. The repo lives on `H:` and the npm cache is on `H:` (the C: drive is full), so don't change the npm cache config.
- **All UTC.** Reward day, streak, daily seed and gift all use `new Date().toISOString().slice(0, 10)`.
- **Keep all existing tests green** (132 at the start). `npm run typecheck`, `npm run lint` and `npm run build` must pass at the end of each task that touches UI or server code.
- Tests are colocated as `*.test.ts` next to the module, in the style of `src/lib/motivation.test.ts`. Run one file with `npx vitest run <path>`.
- Commit after each task, ending the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A brand-new user with zero games asks "how am I doing?" or "what if I play every day?"** The coach must answer warmly with a **Play** action and no forecast numbers, and must not crash on an empty pack. Test in Task 6.
2. **A health question ("do I have ADHD?") through the new intent flow, on both the LLM and the fallback path.** The reply must start with `NON_CLINICAL_NOTE`, and it must not contain the term. Test in Task 6.
3. **The model returns `play` for a misspelled or unknown skill, or 5 actions.** Unknown ones are dropped, the list is capped at 3, and the reply is still shown. Test in Task 3.
4. **The first game is stored in `/start`, then the person signs in with an existing key instead of signing up.** The stored game must be cleared, not imported into the old account. If it's older than 30 minutes, it's ignored. Test in Task 11.
5. **The same day's gift or daily challenge is claimed twice** (double click, two tabs, or replaying `/daily`). Bamboo is awarded once. The streak freeze bridges one missed day but not two. Test in Task 12.

---

## File Structure

```
src/lib/coach/intent.ts        intent + skill + pace parsing from free text (pure)
src/lib/coach/actions.ts       raw model actions → validated client actions (pure)
src/lib/coach/memory.ts        CoachMemory type, updateMemory, memoryToPrompt, shouldOfferBet (pure)
src/lib/coach/fallback.ts      template coach: intent → CoachDraft using lines + pack (pure)
src/lib/coach/claims.ts        (modify) new draft schema; P# refs; reply instead of summary
src/lib/coach/evidence.ts      (modify) pace items in pack + prompt
src/lib/coach/llm.ts           (modify) SYSTEM prompt for the new contract
src/lib/server/coach.ts        (modify) orchestrates intent, memory, pace, consent ask, research mode
src/lib/profiler/pace.ts       forecast at N games/week (pure)
src/lib/panda/lines.ts         line bank + pickLine (pure)
src/lib/panda/bus.ts           typed event emitter + reaction throttle (pure)
src/lib/words.ts               plain labels, sureText, gamesToSure, plainDid (pure)
src/lib/firstGame.ts           sessionStorage carry-over with expiry (pure over a Storage)
src/lib/rewards/index.ts       streakWithFreeze, streakBonus, gardenStalks, earnedBadges, REWARD_AMOUNTS (pure)
src/lib/daily.ts               dailySeed, dailyChallenge(date), shareText (pure)
src/lib/three/brainPoints.ts   procedural brain point cloud + regionStyle (pure)
src/lib/server/rewards.ts      award, getRewards, badge facts query
src/components/panda/          Panda.tsx, PandaSay.tsx, usePandaReactions.ts, PandaCorner.tsx
src/components/coach/          CoachChat.tsx (rewritten), CoachBubble.tsx, ActionButtons.tsx, QuickChips.tsx, BetCard.tsx, AiConsentCard.tsx
src/components/rewards/        BambooCounter.tsx, DailyGift.tsx, BambooGarden.tsx, BadgeShelf.tsx, RewardFloat.tsx
src/components/three/          BrainTwin3D.tsx (dynamic wrapper), BrainTwinScene.tsx, useCanRender3D.ts
src/components/motion/         CountUp.tsx, celebrate.ts
src/app/start/page.tsx, src/app/daily/page.tsx, src/app/template.tsx
src/app/api/rewards/route.ts, src/app/api/rewards/gift/route.ts
drizzle/0005_ux_overhaul.sql   (generated)
docs/demo-script.md
```

---

### Task 1: Intent classifier and skill words

**Files:**
- Create: `src/lib/coach/intent.ts`
- Test: `src/lib/coach/intent.test.ts`

**Interfaces:**
- Produces:
  - `type Intent = "debrief" | "play" | "progress" | "forecast" | "goal" | "explain" | "chat" | "help"`
  - `type Pace = 2 | 4 | 7`
  - `SKILL_WORDS: Array<{ words: string[]; skill: string }>`. The table is in spec §4.1. "visualisation" maps to `visuospatial_memory`, plus `alsoSkill: "reasoning"`.
  - `classifyIntent(text: string): { intent: Intent; skill?: string; alsoSkill?: string; pace?: Pace }`
  - `parsePace(text: string): Pace | undefined`

- [ ] **Step 1: Write the failing tests**

```ts
describe("classifyIntent", () => {
  it.each([
    ["I want to improve my memory", "play", "working_memory"],
    ["let's play something", "play", undefined],
    ["can I train my focus?", "play", "attention_inhibition"],
    ["visualisation", "play", "visuospatial_memory"],
    ["how am I doing?", "progress", undefined],
    ["show my progress in speed", "progress", "processing_speed"],
    ["what if I play every day", "forecast", undefined],
    ["if I keep going will my reasoning get better", "forecast", "reasoning"],
    ["set a goal for memory", "goal", "working_memory"],
    ["what does false alarm mean", "explain", undefined],
    ["debrief my last game", "debrief", undefined],
    ["explain my last game", "debrief", undefined],
    ["hi", "chat", undefined],
    ["what can you do", "help", undefined],
    ["memroy game pls", "play", "working_memory"], // typo tolerance: edit distance ≤ 1 on words ≥ 5 letters
  ])("%s → %s / %s", (text, intent, skill) => {
    const r = classifyIntent(text);
    expect(r.intent).toBe(intent);
    expect(r.skill).toBe(skill);
  });
  it("visualisation also suggests reasoning", () => expect(classifyIntent("visualisation").alsoSkill).toBe("reasoning"));
  it("parses pace", () => {
    expect(parsePace("every day")).toBe(7);
    expect(parsePace("3 times a week")).toBe(4);
    expect(parsePace("twice a week")).toBe(2);
    expect(parsePace("hello")).toBeUndefined();
  });
});
```

Add rows until there are ≥ 40 phrasings, covering every intent and every skill row of the §4.1 table.

- [ ] **Step 2: Run** `npx vitest run src/lib/coach/intent.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `intent.ts`.**
  - Lower-case the text and strip punctuation.
  - Match intent keywords in priority order: `forecast` (what if / will I / keep / pace / every day / per week) > `goal` > `debrief` (last game / debrief / how did I do) > `progress` (how am I / progress / doing / stats) > `explain` (what does / mean / why) > `play` (play / train / improve / practice / game, or a bare skill word) > `help` (what can you / help) > `chat`.
  - For pace, take the number nearest to 2, 4 or 7. "twice" counts as 2, "daily" and "every day" as 7.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(coach): intent classifier and everyday skill words`.

### Task 2: Line bank with no-repeat picker

**Files:**
- Create: `src/lib/panda/lines.ts`
- Test: `src/lib/panda/lines.test.ts`

**Interfaces:**
- Produces:
  - `type LineKey = Intent | "consent_ask" | "consent_yes" | "consent_no" | "bet" | "trial_correct" | "trial_wrong" | "block_start" | "block_end" | "milestone" | "gift" | "greeting" | "sleep" | "no_data" | "need_more_games"`
  - `LINES: Record<LineKey, string[]>`. Slots are written as `{name}`, `{skill}`, `{streak}`, `{games}`.
  - `pickLine(key: LineKey, ctx: Record<string, string | number | undefined>, recent: string[], rand: () => number): { id: string; text: string }`
  - The `id` is `"<key>:<index>"`.

- [ ] **Step 1: Write the failing tests:**
  - `every key has ≥ 6 variants`
  - `never returns one of the last 5 ids in recent`: loop 200 picks, feeding back ids
  - `fills slots`: `{name}` becomes "Sam"
  - `skips variants whose slot is missing from ctx`: when ctx has no `streak`, no returned text contains `{`
  - `no line contains clinical terms`: run every line through `filterClinical` from `src/lib/coach/safety.ts` and expect `blocked === false`
  - `no line says "brain improvement"/"smarter"/"IQ"`
- [ ] **Step 2: Run** `npx vitest run src/lib/panda/lines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `LINES` and `pickLine`.**
  - The voice is warm, short and playful, in Bao's first person. Example: `play`: "Ooh, {skill}! I'll grab my bamboo and watch."
  - The `consent_ask` line is the exact copy from Global Constraints (one variant repeated is not allowed, so write 6 variants that each contain that sentence's content).
  - The picker filters out recent ids and variants with missing slots, then picks with `rand`. If everything is filtered out, it ignores `recent`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(panda): line bank with no-repeat picker`.

### Task 3: Coach draft contract and action validation

**Files:**
- Create: `src/lib/coach/actions.ts`, test `src/lib/coach/actions.test.ts`
- Modify: `src/lib/coach/claims.ts` (schema, `COACH_JSON_SCHEMA`, `finaliseDraft`, `ruleBasedDraft`), `src/lib/coach/coach.test.ts` (fixture field names)

**Interfaces:**
- Produces in `claims.ts`, a new `coachDraftSchema`:
  - `{ intent: Intent, reply: string, claims: Claim[] (max 3), actions: RawAction[], mood: "cheer"|"think"|"proud"|"calm"|"wave" }`
  - `summary` is renamed to `reply`. `next_step` is removed.
  - `FinalMessage` gains `actions: ClientAction[]` and `mood`. `nextStep` stays in the type, always `""`, and is stored as null.
  - `COACH_JSON_SCHEMA` mirrors this, with `actions.items` as a `oneOf` over the five action shapes, objects closed and all fields required.
- Produces in `actions.ts`:
  - `RawAction` (the spec §4.1 `Action` union, with `skill: string`)
  - `ClientAction = { label: string; kind: "link" | "forecast"; href?: string; forecast?: { skill: string; gamesPerWeek: Pace } }`
  - `resolveActions(raw: RawAction[], dims: Array<{ id: string; name: string }>): ClientAction[]`
- Labels and hrefs:

  | Action | Label | Href / payload |
  |-|-|-|
  | `play` | `▶ Play: <name>` | `/play?focus=<id>&mode=<mode>` |
  | `show_progress` | `Show my progress` | `/dashboard#<id>` (or `/dashboard`) |
  | `forecast` | `What if I play <n>×/week?` | kind `forecast` |
  | `set_goal` | `Set a goal` | `/dashboard#goals` |
  | `daily_challenge` | `Today's challenge` | `/daily` |

- [ ] **Step 1: Write the failing tests in `actions.test.ts`:**
  - drops unknown skills and unknown types
  - caps at 3
  - builds `/play?focus=working_memory&mode=training`
  - dedupes identical actions
  - an empty input gives `[]`
- [ ] **Step 2: Update the `coach.test.ts` fixtures** to the new field names (`summary`→`reply`, drop `next_step`, add `intent: "debrief"`, `actions: []`, `mood: "calm"`). Add the test `finaliseDraft keeps a reply with zero claims` (a chat answer).
- [ ] **Step 3: Run** `npx vitest run src/lib/coach`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - `finaliseDraft(draft, pack, science, context, dims)` passes `draft.actions` through `resolveActions`. The reply goes through the same `verified` sentence check and clinical filter that `summary` used.
  - `ruleBasedDraft` returns the new shape (intent `debrief`, `reply` = old summary, a `play` action for the selector's suggested skill when known).
- [ ] **Step 5: Run** `npx vitest run src/lib/coach && npm run typecheck`. Expected: PASS. Typecheck errors in `server/coach.ts` and `CoachChat.tsx` are expected and are fixed in Tasks 6 and 8. If they block, add a minimal adapter (`content = final.content`). Don't redesign here.
- [ ] **Step 6: Commit** `feat(coach): reply + actions + mood contract with server-side action validation`.

### Task 4: Pace forecast and P# evidence

**Files:**
- Create: `src/lib/profiler/pace.ts`, test `src/lib/profiler/pace.test.ts`
- Modify: `src/lib/coach/evidence.ts` (pack + prompt), `src/lib/coach/claims.ts` (P# refs in `finaliseDraft`), `src/lib/coach/coach.test.ts`

**Interfaces:**
- Consumes: `Z90` from `src/lib/profiler/index.ts`. `SLOPE_PRIOR_SD` and `MAX_SLOPE_PER_DAY` from `projection.ts`, reused as per-game values (one game ≈ one day).
- Produces:
  - `type PaceForecast = { gamesPerWeek: Pace; fromPct: number; toPct: number; lowPct: number; highPct: number; perGamePct: number }`
  - `forecastAtPace(history: Array<{ mean: number; sd: number }>, current: { mean: number; sd: number }, gamesPerWeek: Pace, driftSdPerDay: number): PaceForecast | null`. `history` is in block order, measured snapshots only.
  - `MIN_GAMES_FOR_PACE = 3`
  - `EvidencePack.pace: Array<PaceForecast & { ref: string; skill: string; runRef: string }>`. `buildEvidencePack` input gains `pace?: Array<PaceForecast & { skill: string }>`.
- Algorithm:
  - Use the same weighted least squares as `projectGrowth`, with x = block index instead of days, weights 1/sd², and the same shrinkage toward 0 using `SLOPE_PRIOR_SD` per game.
  - Clamp to ±`MAX_SLOPE_PER_DAY` per game.
  - `g = gamesPerWeek`, `to = clamp01(mean + slope·g)`, `sd = √(current.sd² + (g·slopeSe)² + drift²·7)`, band = to ∓ Z90·sd.
  - All percentages are rounded integers.

- [ ] **Step 1: Write the failing tests.**

```ts
it("returns null under 3 games", () => expect(forecastAtPace(h.slice(0, 2), cur, 4, 0.005)).toBeNull());
it("more games/week forecasts at least as high when the trend is up", () => {
  const up = [0.5, 0.53, 0.56, 0.6].map((mean) => ({ mean, sd: 0.06 }));
  expect(forecastAtPace(up, { mean: 0.6, sd: 0.06 }, 7, 0.005)!.toPct).toBeGreaterThanOrEqual(forecastAtPace(up, { mean: 0.6, sd: 0.06 }, 2, 0.005)!.toPct);
});
it("shrinks a noisy trend toward no change", () => {
  const noisy = [0.4, 0.7, 0.45, 0.72].map((mean) => ({ mean, sd: 0.15 }));
  const f = forecastAtPace(noisy, { mean: 0.72, sd: 0.15 }, 7, 0.005)!;
  expect(Math.abs(f.toPct - 72)).toBeLessThanOrEqual(3);
});
it("band widens with more games when the slope is uncertain", () => { /* highPct-lowPct at 7 ≥ at 2 */ });
it("caps the per-game gain at MAX_SLOPE_PER_DAY", () => { /* steep series → perGamePct ≤ 1 */ });
```

  - In `coach.test.ts`: `finaliseDraft accepts a claim citing P1 with its numbers` and `drops a claim with a made-up pace number (e.g. 99%)`.
- [ ] **Step 2: Run** `npx vitest run src/lib/profiler/pace.test.ts src/lib/coach`. Expected: FAIL.
- [ ] **Step 3: Implement `forecastAtPace`.**
- [ ] **Step 4: Wire pace into the evidence pack.**
  - `buildEvidencePack` assigns `P1…` refs, with `runRef` = that skill's latest run ref (no pace item if the skill has no run in the pack).
  - `packToPrompt` adds the section: `IF YOU KEEP PLAYING (forecasts at a pace, cite as P#; say "if your recent trend continues", never certain)` with lines like `- P1 (for R2): working memory at 4 games/week → 64% (likely 57–70%) in 7 days, from 60%`.
  - In `finaliseDraft`: make `lineOf` match `[RTWP]\d+`. A `P#` ref resolves to its `runRef`'s run id and the label `if you keep <n> games a week: <to>% (<low>–<high>%)`. `stripRefs` maps `P\d+` to "the forecast".
- [ ] **Step 5: Run** the tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(coach): pace forecast cited as P# and number-checked`.

### Task 5: Data model: coach memory, actions, rewards table

**Files:**
- Modify: `src/db/schema.ts`, `src/lib/server/privacy.ts` (export + purge), `src/app/api/me/route.ts` (delete table list; PATCH `researchMode`)
- Create: `src/lib/coach/memory.ts`, test `src/lib/coach/memory.test.ts`. Migration generated into `drizzle/`.

**Interfaces:**
- Produces in `schema.ts`:
  - `users.coachMemory: jsonb("coach_memory").$type<CoachMemory>().notNull().default({ recentTopics: [], recentLineIds: [], debriefsSinceBet: 0 })`
  - `users.preferences` type gains `researchMode?: boolean`
  - `coachMessages.actions: jsonb("actions").$type<ClientAction[]>().notNull().default([])` and `coachMessages.mood: text("mood")`
  - `CoachMeta` gains `intent?: Intent` and `bet?: boolean`
  - `rewardKind` pgEnum `["daily_visit","game_completed","daily_plan_done","daily_challenge","streak_day","badge"]`
  - `rewardEvents` table: `id, userId (userRef), kind, amount integer not null, day date not null, ref text not null default '', createdAt`, with a unique index `(user_id, kind, day, ref)`. Using `ref` `''` instead of null keeps the unique index effective.
- Produces in `memory.ts`:
  - `type CoachMemory = { goal?: string; favouriteSkill?: string; recentTopics: string[]; recentLineIds: string[]; aiAsked?: boolean; debriefsSinceBet: number }`
  - `type MemoryEvent = { type: "question"; intent: Intent; skill?: string } | { type: "line"; id: string } | { type: "debrief"; bet: boolean } | { type: "ai_asked" } | { type: "goal"; goal: string } | { type: "played"; skill: string }`
  - `updateMemory(m: CoachMemory, e: MemoryEvent): CoachMemory`
  - `memoryToPrompt(m: CoachMemory, dims: Array<{ id: string; name: string }>): string`
  - `shouldOfferBet(m: CoachMemory, researchMode: boolean): boolean`

- [ ] **Step 1: Write the failing tests in `memory.test.ts`:**
  - `recentTopics` and `recentLineIds` keep the last 5
  - `favouriteSkill` = most frequent among the last 10 `played` events. Store the counts as `recentTopics` entries `play:<skill>`, or add a `playCounts` field. Pick one and type it.
  - `shouldOfferBet` is always true in research mode. Otherwise it's true only when `debriefsSinceBet >= 2`.
  - `{type:"debrief", bet:true}` resets the counter to 0. `bet:false` increments it.
  - `memoryToPrompt` names the goal skill by name and never includes ids or line ids.
- [ ] **Step 2: Run** `npx vitest run src/lib/coach/memory.test.ts`. Expected: FAIL. Then implement `memory.ts` and run again. Expected: PASS.
- [ ] **Step 3: Edit the schema.** Generate the migration with `npx drizzle-kit generate --name ux_overhaul`, check that `drizzle/0005_ux_overhaul.sql` adds only the columns, enum, table and index above, then run `npm run db:migrate`. Expected: it applies without error.
- [ ] **Step 4: Update privacy and the me route.**
  - `exportUserData` adds `rewardEvents`. The user row already carries `coachMemory`.
  - `purgeExpired` deletes `rewardEvents` older than the cutoff.
  - The `DELETE` table list in `api/me/route.ts` adds `reward_events: schema.rewardEvents`.
  - `PATCH /api/me` accepts `{ retentionDays?: number; researchMode?: boolean }`: at least one is required, and `researchMode` is merged into `preferences`.
- [ ] **Step 5: Run** `npm test && npm run typecheck`. Expected: PASS, apart from the known Task 3 adapter errors, if any are left.
- [ ] **Step 6: Commit** `feat(db): coach memory, message actions/mood, reward events`.

### Task 6: Coach server: intents, template fallback, consent ask, research mode

**Files:**
- Create: `src/lib/coach/fallback.ts`, test `src/lib/coach/fallback.test.ts`
- Modify: `src/lib/server/coach.ts`, `src/lib/coach/llm.ts` (SYSTEM), `src/app/api/coach/route.ts`, `src/lib/server/collab.ts` (`toClientMessage` passes `actions` and `mood`)

**Interfaces:**
- Consumes:
  - `classifyIntent` (Task 1)
  - `pickLine` (Task 2)
  - `resolveActions` and the draft schema (Task 3)
  - `forecastAtPace` (Task 4)
  - `CoachMemory`, `updateMemory`, `memoryToPrompt`, `shouldOfferBet` (Task 5)
- Produces:
  - `fallbackDraft(input: { intent: Intent; skill?: string; alsoSkill?: string; pace?: Pace }, pack: EvidencePack, memory: CoachMemory, nextNote: string | undefined, rand: () => number, dims: Array<{ id: string; name: string }>): { draft: CoachDraft; lineIds: string[] }`
  - `generateCoachMessage(userId, opts: { question?: string; prediction?: Prediction | "skip"; forecast?: { skill: string; gamesPerWeek: Pace }; consent?: boolean })`
  - The POST body schema gains `forecast` and `consent: boolean`.
  - The GET response gains `needsAiAsk: boolean` (true when there's no `llm_coaching` consent and `aiAsked` is unset) and `offerBet: boolean`.

- [ ] **Step 1: Write the failing tests in `fallback.test.ts`.** Use a pack built with `buildEvidencePack` from small fixtures, like `coach.test.ts`.
  - `"I want to improve my memory"` → a reply from the `play` lines, and actions containing `/play?focus=working_memory&mode=training`
  - `visualisation` → two play actions: visuospatial_memory and reasoning
  - **empty pack** + `progress` → the `no_data` line + a Play action, and **no numbers in the reply** (Review Focus 1)
  - empty pack + `forecast` → the `need_more_games` line with `{games}` = 3, plus Play
  - pack with ≥ 3 games of a skill + `forecast` pace 7 → a claim citing `P1`, and the action list includes the forecast at 2/week for comparison
  - two consecutive calls with the same input and memory fed through `updateMemory` → different `lineIds[0]`
  - the result passes `finaliseDraft` with nothing dropped
- [ ] **Step 2: Write the failing tests for the clinical path** (Review Focus 2), in `coach.test.ts`:
  - `finaliseDraft` on a fallback draft for "do I have ADHD?" yields content that starts with `NON_CLINICAL_NOTE` and doesn't contain "ADHD".
  - Extract the prefixing currently inline in `generateCoachMessage` into an exported pure `applyClinicalGuard(question: string | undefined, content: string): string` in `claims.ts`, and test that.
- [ ] **Step 3: Run** `npx vitest run src/lib/coach`. Expected: FAIL.
- [ ] **Step 4: Implement `fallback.ts`.**
  - Map intent → line key.
  - Build slot ctx from pack and memory (name, skill name, latest score %, streak).
  - Add actions per intent: play → play(skill or the selector's suggestion), progress → show_progress + play, forecast → forecast at the other two paces, goal → set_goal, chat/help → the chips' actions.
  - For `debrief` reuse `ruleBasedDraft`'s claims.
  - Any number a slot inserts must also be passed in `finaliseDraft`'s `context` string, so the number check accepts it.
- [ ] **Step 5: Rewrite `generateCoachMessage`.**
  1. Load memory and preferences.
  2. If `consent` is set: insert the consent row (`llm_coaching`), set `aiAsked`, and reply with a `consent_yes`/`consent_no` line.
  3. `classifyIntent(question)`. A `forecast` option forces intent `forecast` with that skill and pace. No question means `debrief`.
  4. Compute pace items for the target skill (or the favourite / goal skill) at 2, 4 and 7, using the profile history (same source as `dashboard.ts` `forecasts()`).
  5. Use the LLM if consented, otherwise `fallbackDraft`. On LLM failure use `fallbackDraft`, never `ruleBasedDraft` directly.
  6. Run `finaliseDraft` and `applyClinicalGuard`.
  7. Planted flaws only when `preferences.researchMode` and `planted_flaws` consent.
  8. Record the bet when `prediction` is given and `shouldOfferBet` was true.
  9. `updateMemory` for the question, lines, debrief and played skill, then save.
  10. Store `actions` and `mood`.

  Delete the sentence "I can only answer free-form questions when AI coaching is on". The history limit goes from 6 to 12. The prompt adds `ABOUT THE USER\n${memoryToPrompt(...)}` and `USER INTENT: <intent>`.
- [ ] **Step 6: Update SYSTEM in `llm.ts`.** Keep every existing rule, and add:
  - reply ≤ 3 short sentences, answering the user's actual message first
  - choose `intent`
  - 0–3 claims (0 for chat or help)
  - 0–3 actions using only the skill ids listed in the pack
  - pick a `mood`
  - for forecasts say "if your recent trend continues" and give the range
  - never repeat the wording of the previous coach message in RECENT CONVERSATION
  - give the skill-word table from §4.1
- [ ] **Step 7: Run** `npm test && npm run typecheck`. Expected: PASS, except `CoachChat.tsx` (Task 8).
- [ ] **Step 8: Commit** `feat(coach): conversational intents, template coach with actions, consent in chat, research mode`.

### Task 7: Bao the panda: component, bus, reactions

**Files:**
- Create: `src/lib/panda/bus.ts`, test `src/lib/panda/bus.test.ts`, `src/components/panda/Panda.tsx`, `src/components/panda/PandaSay.tsx`, `src/components/panda/usePandaReactions.ts`, `src/components/panda/PandaCorner.tsx`
- Modify: `src/app/globals.css` (panda keyframes), `src/components/tasks/common.tsx` (`emitTrial`), and the 7 task renderers (one line each, at their `records.current.push` site)

**Interfaces:**
- Produces:
  - `type PandaState = "idle"|"wave"|"watch"|"think"|"cheer"|"proud"|"oops"|"sleep"|"celebrate"|"quiet"|"calm"`
  - `type PandaEvent = { type: "trial:correct" | "trial:wrong" | "block:start" | "block:end" | "milestone" | "reward" } | { type: "coach:mood"; mood: PandaState }`
  - `pandaBus: { emit(e: PandaEvent): void; on(fn: (e: PandaEvent) => void): () => void }`
  - `type ReactMode = "quiet" | "lively"`
  - `reactTo(s: ThrottleState, e: PandaEvent, mode: ReactMode): { pose: PandaState | null; next: ThrottleState }`
    - `ThrottleState = { trialsSinceOops: number; correctCount: number }`, `INITIAL_THROTTLE`
  - `emitTrial(correct: boolean | null): void` in `tasks/common.tsx`
  - `<Panda state size? lookAt? className? />`, `<PandaSay text />`, `<PandaCorner mode: ReactMode />`
  - `usePandaReactions(mode: ReactMode): PandaState`. A pose lasts 400 ms (`cheer`), 1000 ms (`oops`) or 1500 ms (`celebrate`), then returns to `watch` (lively) or `quiet`.

- [ ] **Step 1: Write the failing tests in `bus.test.ts`:**
  - In `quiet` mode, every `trial:*` gives `pose: null`.
  - Lively: `cheer` on the 3rd, 6th, … correct only.
  - Lively: `oops` at most once per 5 trials. The counter counts all trials.
  - `milestone` always gives `celebrate`, even when quiet (it's between blocks).
  - `on()` returns an unsubscribe that stops delivery.
- [ ] **Step 2: Run** `npx vitest run src/lib/panda/bus.test.ts`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3: Build `Panda.tsx`.**
  - An inline SVG on a 120×120 viewBox, with groups `body`, `head`, `ears`, `patches`, `eyes > pupils, lids`, `mouth`, `paws`, `bamboo`.
  - States are switched with a `data-state` attribute plus CSS keyframes in `globals.css`: breathing, blink every 3–6 s via a randomised `animation-delay`, wave, cheer hop, paws over eyes, Zs, celebrate jump.
  - For `watch`, the pupils translate toward `lookAt`, clamped to 3 px.
  - Colours use CSS variables, so it works in both themes.
  - Under `@media (prefers-reduced-motion: reduce)` all animations are off.
  - `role="img"` with `aria-label="Bao the panda, <state>"`.
- [ ] **Step 4: Hook trial events into the renderers.**
  - Add `emitTrial`.
  - Call it right after each renderer's single `records.current.push({...})` (the 7 files listed above).
  - Add `PandaCorner` to `PlaySession`: `mode === "assessment" ? "quiet" : "lively"`. Emit `block:start` and `block:end` when entering the block and result states.
  - Add `TryTask` with `lively`.
- [ ] **Step 5: Corner behaviour.**
  - `PandaCorner` shows `PandaSay` with a `block_start` line when a block starts and a `block_end` line when it ends (via `pickLine`, keeping the last 5 ids in component state).
  - After 60 s without any bus event it switches to `sleep`. Any event wakes it.
- [ ] **Step 6: Check visually.** Run `npm run dev`, open `/try` and play a Stroop practice: Bao cheers or covers his eyes. Open `/play` (assessment): Bao only blinks. Turn on reduced motion in the OS or emulation: Bao is static. Also run `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(panda): Bao with event bus, throttled reactions, quiet during assessment`.

### Task 8: Coach chat UI and Settings research mode

**Files:**
- Rewrite: `src/components/coach/CoachChat.tsx`
- Create: `src/components/coach/CoachBubble.tsx`, `ActionButtons.tsx`, `QuickChips.tsx`, `BetCard.tsx`, `AiConsentCard.tsx`
- Modify: `src/app/coach/page.tsx`, `src/components/SettingsForm.tsx`, `src/app/settings/page.tsx`

**Interfaces:**
- Consumes:
  - `ClientCoachMessage` (now with `actions` and `mood`)
  - the GET `needsAiAsk` and `offerBet`
  - the POST body `{ question?, prediction?, forecast?, consent? }`
  - `Panda` and `pandaBus` (Task 7)
  - `EvidencePanel` (unchanged)

- [ ] **Step 1: Build the components.**
  - **`CoachBubble`:** Bao (size 40, state = `mood`) + the reply, which fades in word by word over ≤ 600 ms (`motion`; instant under reduced motion). Below it are `ActionButtons`, then a "Why?" toggle that shows the claims with `EvidencePanel`.
    - The "Looks right / Something off" buttons and the spot-the-error hint render **only** when `researchMode` is true.
  - **`ActionButtons`:** `link` → `<Link>`. `forecast` → POST `{forecast}` and append the answer.
  - **`QuickChips`:** "How am I doing?", "Let's play", "What if I play every day?", "Debrief my last game". Clicking one sends the text as a question.
  - **`BetCard`:** "I bet you did better than last time. Agree?" with buttons Better / About the same / A bit lower / Skip → POST `{prediction}`. Shown only when `offerBet`.
  - **`AiConsentCard`:** the exact consent copy, with Yes / Not now → POST `{consent}`. Shown when `needsAiAsk`.
  - **`CoachChat`:** the list, a typing indicator (Bao `think`) while busy, input + voice (keep `useDictation` and `useSpeaker`), chips when idle. On a new message, emit `coach:mood`.
  - The input is enabled even without AI consent, because the template coach answers. The placeholder becomes "Ask Bao anything about your games".
- [ ] **Step 2: Settings.** Add a "Research mode" switch with this text: "Shows rating buttons on each coach claim and lets the coach hide a deliberate mistake for you to spot (needs the spot-the-error consent). Used to measure how people check AI." It sends `PATCH /api/me {researchMode}`.
- [ ] **Step 3: Check in the browser.** Run `npm run dev` as the demo user (`npm run seed:demo` prints the link).
  - Ask "I want to improve my memory": a Play button appears and links to N-back.
  - Click "What if I play every day?": a forecast reply with a range.
  - Turn AI consent off in Settings: the chat still answers, with varied wording across 3 identical questions.
  - Research mode off: no rating buttons. On: they appear.
  - Then `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(coach): chat with Bao, action buttons, chips, bet card, consent in chat, research mode toggle`.

### Task 9: Plain-words result card, count-up and celebrations

**Files:**
- Create: `src/lib/words.ts`, test `src/lib/words.test.ts`, `src/components/motion/CountUp.tsx`, `src/components/motion/celebrate.ts`
- Modify: `src/components/BlockResultCard.tsx`, `src/components/SelfEstimate.tsx`, `src/app/page.tsx` (signed-in home), `src/app/dashboard/page.tsx` + `src/components/dashboard/*` (labels only), `package.json`

**Interfaces:**
- Produces:
  - `WORDS` (spec §4.2 mapping)
  - `sureText(ciLowPct: number, ciHighPct: number): string`
  - `gamesToSure(sd: number, obsSd: number, targetSd?: number): number` (default target 0.08, max 10; uses `expectedPosteriorSd` repeatedly)
  - `plainDid(paradigm: string, m: Record<string, number>, trials?: number): string`
  - `<CountUp from to durationMs? />`
  - `celebrate(): void` (canvas-confetti, a no-op under reduced motion)

- [ ] **Step 1: Write the failing tests in `words.test.ts`:**
  - `sureText(40, 80)` → "We're still getting to know you" (width > 30)
  - `sureText(55, 68)` → "We're fairly sure it's between 55 and 68"
  - `gamesToSure` returns 0 when `sd ≤ target`, and is monotonic in `sd`
  - `plainDid("n_back", {hit_rate: 0.78, false_alarm_rate: 0.1}, 24)` contains no "d′", "composite" or "rate"
  - every paradigm in `AVAILABLE_PARADIGMS` gives a non-empty sentence
- [ ] **Step 2: Run** `npx vitest run src/lib/words.test.ts`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3: Install the dependencies.** Run `npm view motion version` and `npm view canvas-confetti version`, then `npm i -E motion@<v> canvas-confetti@<v>` and `npm i -E -D @types/canvas-confetti@<v>`.
- [ ] **Step 4: Rebuild the top of `BlockResultCard`.**
  1. **What you did:** `plainDid`.
  2. **What it means:** "Your <skill> score is now about <CountUp before→after>" + `sureText`, with a "sure-o-meter" bar. The bar is `BandBar` restyled: its width animates from the old band to the new. Caption: "<gamesToSure> more games and we'll be much surer".
  3. **What's next:** the existing continue/end buttons, renamed "Next game" / "Finish", plus "Ask Bao about this game" → `/coach` with chip "Debrief my last game".

  Then:
  - The existing metrics table, validity notes and self-check go into `<details><summary>Details for the curious</summary>`.
  - When `result.wins.length`: `celebrate()` + `pandaBus.emit({type:"milestone"})`.
  - `SelfEstimate` heading: "Guess your score?", with Bao `think`.
- [ ] **Step 5: Words pass.** Replace user-facing "estimate", "band", "block", "composite" and "credible interval" on home, dashboard, play, coach and result with the `WORDS` terms. Don't change `/validation`, `/skills` or docs. Then `grep -rniE "estimate|credible|composite|\bband\b" src/app/page.tsx src/app/dashboard src/components/dashboard src/components/BlockResultCard.tsx src/components/coach`. Expected: no user-visible strings left; code identifiers are fine.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npm run lint`, and play one block in the browser: three plain lines, count-up, details closed. Expected: PASS.
- [ ] **Step 7: Commit** `feat(ux): plain-words result card with sure-o-meter, count-up and celebrations`.

### Task 10: Page motion

**Files:**
- Create: `src/app/template.tsx`
- Modify: the primary buttons and chips in `src/app/globals.css` (press spring via CSS `:active` scale)

- [ ] **Step 1: Add the page transition.** `template.tsx` wraps children in a `motion.div` fade + 8 px rise (200 ms). With reduced motion it renders children as they are.
- [ ] **Step 2: Check.** Navigate home → dashboard → coach: transitions are smooth, with no layout jump. Then `npm run build`. Expected: success.
- [ ] **Step 3: Commit** `feat(ux): page transitions and press feedback`.

### Task 11: First visit in 60 seconds, with carry-over

**Files:**
- Create: `src/lib/firstGame.ts`, test `src/lib/firstGame.test.ts`, `src/app/start/page.tsx`
- Modify: `src/components/TryTask.tsx` (optional `onComplete` + `seed` props), `src/components/Onboarding.tsx` (stepped conversation), `src/components/SigninForm.tsx` (clear on sign-in), `src/app/page.tsx` (signed-out hero), `src/app/api/onboard/route.ts` (accept `goal`)

**Interfaces:**
- Produces:
  - `type FirstGame = { dimensionId: string; taskId: string; level: number; params: Record<string, unknown>; startedAt: string; trials: TrialRecord[]; savedAt: number }`
  - `saveFirstGame(s: Storage, g: Omit<FirstGame, "savedAt">, now?: number): void`
  - `takeFirstGame(s: Storage, now?: number): FirstGame | null` (removes the key, returns null if older than 30 min)
  - `clearFirstGame(s: Storage): void`
  - `FIRST_GAME_KEY = "ai4b_first_game"`
  - `TryTask` props gain `seed?: number`, `fixedLevel?: boolean` and `onComplete?: (r: { score: BlockScore; trials: TrialRecord[]; startedAt: string; level: number; params: Record<string, unknown> }) => void`

- [ ] **Step 1: Write the failing tests** with an in-memory `Storage` fake:
  - save then take returns the game and removes it
  - take after 31 minutes → null and removed
  - `clearFirstGame` removes it
  - take on corrupt JSON → null (Review Focus 4: also covers the sign-in path, which calls `clearFirstGame`)
- [ ] **Step 2: Run** `npx vitest run src/lib/firstGame.test.ts`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3: Build `/start`.**
  - Corsi (`visuospatial_memory`, its first task) at level 2 via `TryTask`, with `PandaCorner lively` watching.
  - On complete: `saveFirstGame` and show the plain result: `plainDid` + "Want me to remember this and start your Brain Twin?" → **Yes** (`/?signup=1#start`) / **Just play more** (`/try`).
- [ ] **Step 4: Rewrite `Onboarding` as steps with Bao speaking each one.**
  1. nickname
  2. "I need to store your game results to build your twin. OK?" (required; the button stays disabled until Yes)
  3. behaviour signals Yes/No
  4. AI coaching Yes/No (consent copy)
  5. sign-in key card (existing `SigninKeyCard`)
  6. goal chips: memory / focus / speed / reasoning / working with AI / just curious → POST `/api/onboard` accepts `goal` and stores it in `coachMemory.goal`

  After the key card:
  - `takeFirstGame(sessionStorage)`.
  - If present: POST `/api/sessions {mode:"assessment"}`, then POST `/api/sessions/<id>/runs` with the stored block, `reason: {rule:"first_game", expectedSdReduction:0, note:"Your first game"}`, `status:"completed"`, `selfEstimate:null`.
  - Ignore any failure silently, then `router.refresh()`.
- [ ] **Step 5: `SigninForm` calls `clearFirstGame(sessionStorage)` before signing in.**
- [ ] **Step 6: Signed-out hero.**
  - Headline "Play a 1-minute game. Bao will tell you what it says about your mind."
  - Primary CTA → `/start`, secondary "Sign in" and "How it works" (`#how`).
  - Bao `wave` in front of the hero art. The hero art becomes `BrainTwin3D` in Task 14; keep `BrainTwinArt` for now.
  - The STATS/PILLARS sections stay below, under `id="how"`.
- [ ] **Step 7: Check in the browser.** In a private window: landing → `/start` → play → Yes → signup steps → home. The dashboard shows 1 game for visuospatial memory. Repeat, but choose "Sign in" with the demo key after `/start`: the demo user does **not** gain a new game. Then `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 8: Commit** `feat(onboarding): 60-second first game, conversational signup with Bao, goal pick, carry-over`.

### Task 12: Bamboo rewards

**Files:**
- Create: `src/lib/rewards/index.ts`, test `src/lib/rewards/rewards.test.ts`, `src/lib/server/rewards.ts`, `src/app/api/rewards/route.ts`, `src/app/api/rewards/gift/route.ts`, `src/components/rewards/{BambooCounter,DailyGift,BambooGarden,BadgeShelf,RewardFloat}.tsx`
- Modify: `src/lib/server/blocks.ts` (`recordRun` awards; `RunResult.rewards`), `src/components/SiteHeader.tsx`, `src/app/page.tsx` (signed-in home), `src/app/profile/page.tsx`, `src/components/BlockResultCard.tsx` (`RewardFloat`)

**Interfaces:**
- Produces (pure):
  - `REWARD_AMOUNTS = { daily_visit: 5, game_completed: 10, daily_plan_done: 20, daily_challenge: 15, badge: 25 }`
  - `streakBonus(streak: number): number` (= 5·min(streak, 7))
  - `streakWithFreeze(activeDays: string[], today?: Date): { streak: number; frozenDays: string[] }`
  - `gardenStalks(total: number): number` (= min(30, ⌊total/50⌋))
  - `type BadgeFacts = { skillsPlayed: string[]; streak: number; questionsAsked: number; caughtErrors: number; dailyDone: number; goalsSet: number; playedAfterTough: boolean }`
  - `BADGES: Array<{ id: string; title: string; text: string }>`, with ids `first_<dimensionId>` ×7, `all_skills`, `streak_3`, `streak_7`, `streak_14`, `first_question`, `caught_error`, `daily_5`, `first_goal`, `kept_going`
  - `earnedBadges(f: BadgeFacts, dimensionIds: string[]): string[]`
- Freeze rule: walking back from today (with today-not-yet-played grace, as in `dayStreak`), a single missing day D is bridged when:
  - D−1 is active
  - ≥ 3 active days fall in the 7 days before D
  - no other day in D's ISO week was frozen

  Two consecutive missing days end the streak.
- Produces (server):
  - `award(userId: string, kind: RewardKind, ref?: string, amount?: number): Promise<boolean>`: `insert … on conflict do nothing`, returns true if inserted
  - `getRewards(userId): Promise<{ total: number; today: number; streak: number; frozenDays: string[]; badges: string[]; gardenStalks: number; giftClaimedToday: boolean }>`
  - `awardForRun(userId, run): Promise<Array<{ kind: RewardKind; amount: number; badge?: string }>>`, called at the end of `recordRun`
  - `RunResult.rewards` = that array

- [ ] **Step 1: Write the failing tests:**
  - `streakBonus(10) === 35`
  - `gardenStalks(1600) === 30`
  - `streakWithFreeze`: a run of 5 days with one gap after 3+ active days → bridged; two-day gap → broken; a second gap in the same ISO week → broken
  - `earnedBadges`: `all_skills` needs all 7; no badge depends on any score; `kept_going` only when `playedAfterTough`
- [ ] **Step 2: Run** `npx vitest run src/lib/rewards`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3: Server.**
  - `awardForRun`, only for a completed, valid run:
    - `game_completed` with ref = run id
    - `streak_day` with ref `''` and amount `streakBonus(streak)` when this is the first completed run today and the streak is ≥ 2
    - `daily_plan_done` when all of today's plan items are done
    - each newly earned badge as `badge` with ref = badge id
    - `daily_challenge` (Task 13)
  - Badge facts come from existing tables: task runs, coach messages with role user, collab events `caught_planted_flaw`, goals, reward events `daily_challenge`, and `affect.easeOff` on the previous run.
  - `GET /api/rewards` → `getRewards`. `POST /api/rewards/gift` → `award(daily_visit)`, returns `{ awarded, rewards }`.
- [ ] **Step 4: Idempotency check** (Review Focus 5). Add the script `scripts/check-rewards.ts` (run with `npx tsx scripts/check-rewards.ts`) against PGlite on a temporary user: call `award(daily_visit)` twice concurrently with `Promise.all`, and expect exactly one row and `[true, false]` in either order. Then delete the temporary user. Run it. Expected: it prints `ok`.
- [ ] **Step 5: UI.**
  - **`BambooCounter`** in the header (signed in): 🎋 + total, with a bump animation on change.
  - **`DailyGift`** on home when `!giftClaimedToday`: a chest. Click → open animation + Bao `celebrate` + `RewardFloat` "+5".
  - **`BambooGarden`** on home: an SVG row of `gardenStalks` stalks with varied heights from a seeded rng. New stalks grow with a CSS scaleY transition.
  - **`BadgeShelf`** on the profile: earned in colour, others greyed with their `text` as a hint.
  - **`RewardFloat`** on the result card for `result.rewards`. A `badge` reward also calls `celebrate()` and emits `milestone`.
  - **Signed-in home** gets, at the top: Bao (`wave`) with a `greeting` line (`{name}`, `{streak}`) and one "Your next game" button (`/play`, labelled with the selector's next skill when known).
- [ ] **Step 6: Check in the browser.** Open the gift once (it disappears after a reload), play a game (+10 floats), and see the garden on home. Then `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 7: Commit** `feat(rewards): bamboo ledger, daily gift, streak freeze, consistency badges, garden`.

### Task 13: Daily Bao challenge

**Files:**
- Create: `src/lib/daily.ts`, test `src/lib/daily.test.ts`, `src/app/daily/page.tsx`
- Modify: `src/lib/server/blocks.ts` (`nextBlock` daily option; daily award check), `src/app/api/sessions/route.ts` (`daily` flag), `src/components/PlaySession.tsx` (`daily` prop, share card on result)

**Interfaces:**
- Produces:
  - `dailySeed(day: string): number` (FNV-1a 32-bit of `"ai4brain-daily-" + day`, `>>> 0`, then `% 2**31`)
  - `DAILY_ORDER: string[]` (the 7 dimension ids, a fixed order)
  - `dailyChallenge(day: string, dims: Dimension[]): { day: string; dimensionId: string; taskId: string; level: number; seed: number }` (dimension = `DAILY_ORDER[daysSinceEpoch % 7]`, its first task, its middle level)
  - `isDailyRun(run: { dimensionId: string; params: Record<string, unknown> }, day: string, dims: Dimension[]): boolean`
  - `shareText(input: { day: string; taskName: string; score: number; detail: string }): string`, giving `Bao's daily · <Mon D> · <task> <5 emoji squares from score> · <detail> · ai4brain`
  - `nextBlock(userId, sessionId, mode, focus?, daily?: boolean)`: when `daily` and this is the first block of the session, it returns the daily spec with `reason.rule = "daily"`, then ends the session after 1 block.

- [ ] **Step 1: Write the failing tests:**
  - same day → same seed
  - different days → different seeds
  - 7 consecutive days cover all 7 dimensions
  - `isDailyRun` is true only for today's dimension + seed
  - `shareText` has no name or id and contains exactly 5 squares
- [ ] **Step 2: Run** `npx vitest run src/lib/daily.test.ts`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3: Server and UI.**
  - `POST /api/sessions` accepts `daily: boolean` (mode is forced to `training`).
  - `awardForRun` awards `daily_challenge` with ref `''` when `isDailyRun(run, today)`. The unique index makes replays award nothing (Review Focus 5).
  - `/daily`, signed in: `PlaySession mode="training" daily`. The result card shows a "Copy my result" button using `navigator.clipboard.writeText(shareText(...))`, with a "Copied!" toast.
  - `/daily`, signed out: `TryTask` with today's seed and level, `fixedLevel`, then the plain result + share + "Start your Brain Twin".
  - The home page shows a "Today's challenge" card when today's daily isn't done yet.
- [ ] **Step 4: Check in the browser.** `/daily` twice: the same puzzle sequence, and bamboo awarded once. Signed out, the same puzzle. Then `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(daily): shared daily challenge with share card`.

### Task 14: 3D Brain Twin

**Files:**
- Create: `src/lib/three/brainPoints.ts`, test `src/lib/three/brainPoints.test.ts`, `src/components/three/useCanRender3D.ts`, `src/components/three/BrainTwinScene.tsx`, `src/components/three/BrainTwin3D.tsx`
- Modify: `src/app/page.tsx` (hero), `src/app/dashboard/page.tsx` ("Your twin" card), `package.json`

**Interfaces:**
- Produces:
  - `REGION_ORDER: string[]` (7 dimension ids)
  - `brainPoints(n: number, seed: number): { positions: Float32Array; region: Uint8Array }`
    - two ellipsoid hemispheres (radii ≈ 1.0 × 0.75 × 0.85, gap 0.06), surface-biased radius plus sine "gyri" displacement
    - region by position: frontal → reasoning (front-top) and cognitive_flexibility (front-lower), parietal → visuospatial_memory, temporal → working_memory, occipital → processing_speed, central band → attention_inhibition, and a sparse halo shell (5% of points, radius 1.25) → ai_reliance
  - `regionStyle(s: { mean: number; sd: number; measured: boolean }): { brightness: number; jitter: number }` (brightness = measured ? 0.25 + 0.75·mean : 0.12; jitter = min(1, sd/0.2)·0.06)
  - `useCanRender3D(): boolean` (WebGL2 or WebGL available, not reduced motion, `navigator.deviceMemory` ≥ 4 or undefined)
  - `<BrainTwin3D mode="landing" | "twin" skills?: Record<string, { mean: number; sd: number; measured: boolean; name: string }> />`, which is a `next/dynamic` import of `BrainTwinScene` with `ssr: false`, falling back to `<BrainTwinArt />`

- [ ] **Step 1: Write the failing tests:**
  - `positions.length === 3n` and `region.length === n`
  - every region index 0–6 appears with ≥ 2% of the points
  - deterministic for the same seed
  - all |coords| ≤ 1.35
  - `regionStyle` brightness rises with mean, jitter rises with sd, and unmeasured is dim
- [ ] **Step 2: Run** `npx vitest run src/lib/three`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3: Install the dependencies.** Run `npm view three version` and `npm view @react-three/fiber@9 version`, then `npm i -E three@<v> @react-three/fiber@<9.x>` and `npm i -E -D @types/three@<matching>`.
- [ ] **Step 4: Build `BrainTwinScene`.**
  - `<Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 3.2], fov: 45 }} frameloop={visible ? "always" : "never"}>`. Visibility comes from an IntersectionObserver on the wrapper.
  - One `<points>` with a `bufferGeometry` (attributes `position`, `region`, and per-point `brightness`/`jitter` filled from `regionStyle` by region) and a `shaderMaterial`:
    - vertex: jitter = `sin(time·1.7 + id)·jitter`, and size attenuation
    - fragment: a round soft point coloured from the brand cyan (`#00b5e2`) to white by brightness
    - additive blending, `depthWrite: false`
  - `useFrame` updates only the `time` uniform and the group rotation (0.08 rad/s plus a pointer tilt ≤ 0.15 rad).
  - Landing: the region under the pointer is found via raycast on the points with `threshold 0.05`, brightened, and its skill name shown in an HTML label outside the canvas.
  - Twin mode: a plain-words legend "Brighter = higher score. Crisper = we're more sure. Grey = not measured yet."
  - On `webglcontextlost`, switch to the fallback.
- [ ] **Step 5: Place it.**
  - Landing hero: replace `BrainTwinArt` with `BrainTwin3D mode="landing"` (Bao stays in front).
  - Dashboard: a new "Your twin" card at the top with `mode="twin"` and skills from `getProfileView`.
- [ ] **Step 6: Check in the browser** at 1440×900:
  - smooth rotation, and hovering shows skill names
  - in the dashboard, a skill with few games looks fuzzier than a well-measured one
  - with reduced motion, the SVG shows instead
  - a mobile emulation at 375×812 renders and doesn't scroll sideways

  Then `npm run build` and confirm the landing First Load JS doesn't include three.js (it must sit in a separate chunk). Also `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 7: Commit** `feat(3d): Brain Twin point cloud with score as brightness and uncertainty as fuzz`.

### Task 15: Demo readiness

**Files:**
- Modify: `scripts/seed-demo.ts`, `README.md`
- Create: `docs/demo-script.md`

- [ ] **Step 1: Seed data.** `seed-demo.ts` also writes, for the demo user:
  - a 6-day streak of runs (if the existing history doesn't already end today)
  - `reward_events` totalling ≈ 600 bamboo: daily visits, games, streak days, 5 badges (`first_working_memory`, `first_attention_inhibition`, `first_visuospatial_memory`, `streak_3`, `first_question`)
  - `coachMemory = { goal: "working_memory", recentTopics: [], recentLineIds: [], debriefsSinceBet: 2 }`
  - `llm_coaching` consent granted

  Run `npm run seed:demo`. Expected: it prints a sign-in link; home shows the garden (12 stalks), streak 6 and the gift.
- [ ] **Step 2: Write `docs/demo-script.md`.** It's the 5-minute path from spec §4.8, with the exact clicks and lines to type ("I want to improve my memory", "What if I play every day?"), what Bao does at each step, and a fallback note per step: no network → the template coach still answers and shows actions; WebGL missing → the SVG twin.
- [ ] **Step 3: README.** Add one row to "What makes it different": **Experience layer**: Bao the panda, a coach that acts (play, forecast at your pace, goals), plain-words results, bamboo rewards for consistency, a daily challenge, and a 3D Brain Twin where fuzz = uncertainty. Also update the test count.
- [ ] **Step 4: Full verification.**
  - Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm run dims:check`. Expected: all pass, with the test count printed.
  - Then walk through `docs/demo-script.md` in the browser at 1440×900 in light and dark, at 375×812, and with reduced motion. Fix anything broken before committing.
- [ ] **Step 5: Commit** `docs: demo script, README experience row, demo seed with rewards and coach memory`.
