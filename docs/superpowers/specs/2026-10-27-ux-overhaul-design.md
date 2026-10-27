# UX Overhaul: Bao the Panda, a Coach That Acts, Rewards and a 3D Brain Twin

**Date:** 2026-10-27 · **Status:** approved design, awaiting spec review · **Demo:** live on a laptop, in under 2 weeks · **Language:** English only

## 1. Why

A tester found the app "good as a concept, zero as user experience". From the code:

- **The coach was the template coach.** `llm_coaching` is unticked by default at signup (`src/components/Onboarding.tsx`), so the tester got `ruleBasedDraft` (`src/lib/coach/claims.ts`): the same text for the same data, starting with "I can only answer free-form questions when AI coaching is on".
- **Every answer has the same shape** (summary + 2–4 claims + next step), even for "let's play". It reads like a report.
- **Research tools leaked into the everyday UX.** "Looks right / Something off" under every claim, a better/same/worse guess before every debrief, and planted errors. These feel like "the app keeps asking me if it was good".
- **The coach can't act.** It can't start a game, although `/play?focus=<dimensionId>` already exists.
- **Jargon.** Words like "estimate", "band", "d′" and "composite", plus a metrics table on the result screen.
- **No pull to come back.** There's no mascot, gift, streak screen or daily reason to return. (`dayStreak` and `milestones` exist in `src/lib/motivation.ts` but are barely surfaced.)

We compete against medicine students. Our science (calibrated bands, validation, evidence-checked coach) is already strong. The gap is **experience**. This overhaul must not trade away the science or the ethics.

## 2. Goals and success criteria

1. **A stranger reaches a "wow" in 60 seconds:** one game played and a plain-language result, before any signup.
2. **The coach feels like a conversation:**
   - It answers the actual message.
   - It never repeats the same wording twice in a row.
   - It can start a game, show progress, forecast at a chosen pace and set a goal through buttons.
   - It works, interactively, even without AI consent.
3. **Anyone understands what happened** after every game: three plain lines, with no jargon on the main screens.
4. **There's a reason to return:** a daily gift, streak, bamboo garden and daily challenge.
5. **A memorable demo moment:** Bao the panda reacting, a 3D Brain Twin whose glow shows score and uncertainty, and a coach that says "if you keep 4 games a week, you could reach about 64".
6. **Nothing regresses:** all existing tests stay green, number-checking and the clinical filter apply to every new coach text, and consents stay opt-in.

## 3. Principles (hard rules)

- **Only compare you with you.** No leaderboards and no comparing friends' scores.
- **Reward effort and consistency, never raw scores.** Slower players must not be punished.
- **No health or "brain improvement" claims.** Lumosity paid the FTC $2M in 2016 for unsupported claims. Say "your scores on these games", never "a better brain".
- **Measurement stays valid.** Bao is quiet during assessment blocks: he blinks only, with no reactions or speech. He reacts between blocks, and per trial only in practice (training/try) mode.
- **Every number the coach says is verified** against the evidence pack, including the new forecast numbers.
- **Opt-in AI.** Bao asks for consent in chat once. "No" is respected and remembered.
- **Respect `prefers-reduced-motion`.** All animation and 3D have a static fallback.

## 4. Design

### 4.1 Coach that talks and acts

**Contract.** The LLM still returns one structured JSON (both providers, same schema), extended:

```ts
{
  intent: "debrief" | "play" | "progress" | "forecast" | "goal" | "explain" | "chat" | "help",
  reply: string,            // ≤ 3 short sentences, second person, plain words
  claims: Claim[],          // 0–3; shown behind "Why?" (evidence as today)
  actions: Action[],        // 0–3 buttons
  mood: "cheer" | "think" | "proud" | "calm" | "wave"   // Bao's reaction
}
Action =
  | { type: "play"; skill: DimensionId; mode: "training" | "assessment" }
  | { type: "show_progress"; skill?: DimensionId }
  | { type: "forecast"; skill: DimensionId; gamesPerWeek: 2 | 4 | 7 }
  | { type: "set_goal"; skill: DimensionId }
  | { type: "daily_challenge" }
```

- **Server-side validation** (`src/lib/coach/actions.ts`): unknown skills or action types are dropped, and there are at most 3 actions. Each action becomes `{label, href | apiCall}`. `play` → `/play?focus=<id>&mode=<mode>`, `show_progress` → `/dashboard#<id>`, and so on.
- **`forecast` actions call the coach again** with `{forecast: {skill, gamesPerWeek}}`, so the answer stays in the chat.
- **Number checking:** `reply` goes through the same sentence-level check as `summary` today. Claims keep their per-claim check.

**Skill words.** A fixed synonym map from everyday words to dimensions, given to the model and used by the fallback:

| Words | Skill |
|-|-|
| memory, remember, recall | working memory (N-back) |
| visual memory, spatial | visuospatial memory (Corsi) |
| visualisation | Corsi + matrices; the reply explains both |
| focus, attention, concentration | attention & inhibition (Stroop) |
| speed, fast, quick | processing speed (symbol-digit) |
| switching, multitask, flexible | cognitive flexibility (task switching) |
| logic, reasoning, puzzles, IQ | reasoning (matrices); the reply never mentions IQ scores |
| AI, trust | AI reliance (Second opinion) |

**Template-coach fallback (no consent / no API / failure)** becomes interactive. New file `src/lib/coach/intent.ts`:

- A keyword intent classifier plus the synonym map gives `{intent, skill?}`.
- Each intent has a **line bank** of 6+ templates with slots (name, skill, last score, streak, pace numbers).
- Lines are picked with **no repeat of the last 5 lines used** (stored in coach memory).
- Templates produce the same `{reply, actions, mood}` shape, so the UI has one code path.
- The old "I can only answer free-form questions…" sentence is removed. Instead, Bao offers the AI consent once (see 4.1 consent).

**Coach memory.** New `users.coach_memory` jsonb column:

```ts
{ goal?: DimensionId | "curious"; favouriteSkill?: DimensionId; recentTopics: string[]; recentLineIds: string[];
  aiAsked?: boolean; lastBetAt?: string }
```

- It's updated after each message and summarised into the prompt as `ABOUT THE USER`.
- History grows from 6 to 12 messages.
- It's covered by data export and one-click delete.

**Pace forecast** (`src/lib/profiler/pace.ts`, pure function, tested):

- **Input:** the skill's snapshot history (mean, sd, block index), its current posterior, and the games per week to forecast.
- **Gain per game:** a weighted slope of the mean over **block count** (not days), shrunk toward 0 with the same prior logic as `projectGrowth` (`SLOPE_PRIOR_SD` converted per block), and capped by `MAX_SLOPE_PER_DAY` at one game a day.
- **Output:** for horizon = 1 week, `{fromPct, toPct, lowPct, highPct, gamesPerWeek}`. The band combines today's uncertainty, the slope uncertainty × games, and drift × days.
- **Fewer than 3 measured blocks of the skill → null.** The coach then says how many more games it needs.
- Pace items join the evidence pack as `P#` lines, e.g. `P1: working memory at 4 games/week → 64% (57–70%) in 7 days, from 60%`. Claims may cite `P#` like `W#`, and the number check covers them.
- **Wording rule** (added to SYSTEM): "if your recent trend continues…, likely between X and Y". Never certain, never "you will".

**Consent in chat.** On first coach open without `llm_coaching` and with `aiAsked` unset:

- Bao asks: "Want me to use AI to answer in my own words? I'd send a summary of your scores (never your name) to an AI model. You can change this any time in Settings."
- **Yes** writes a consent row (same API as Settings). **No** sets `aiAsked: true` and the template coach continues.

**Research mode** (`users.preferences.researchMode`, default off, toggled in Settings under "Research mode"):

- **Off:**
  - No per-claim rating buttons.
  - No planted errors (even with `planted_flaws` consent, which now only applies in research mode).
  - The prediction becomes **"Bet with Bao"**: shown on at most 1 in 3 debriefs (`lastBetAt` + a counter), as a playful card ("I bet you did better than last time. Agree?"). It still records the `prediction_*` signals.
- **On:** today's behaviour, unchanged.
- The collaboration score keeps working: chat questions, follow-ups, bets, self-estimates and Second opinion still feed it.

**UI** (`CoachChat.tsx` rewrite into smaller files under `src/components/coach/`):

- Bao avatar next to each coach bubble, with the bubble's `mood`.
- A typing indicator while waiting.
- The reply text fades in word by word (≤ 600 ms).
- Action buttons under the bubble.
- **Quick-reply chips** above the input when idle:
  - "How am I doing?"
  - "Let's play"
  - "What if I play every day?"
  - "Explain my last game"
- A "Why?" toggle shows claims and evidence (the existing `EvidencePanel`).
- The voice features stay.
- **The "Give me a debrief" button stays** as a chip, "Debrief my last game". The automatic debrief after a session is triggered from the result card.

### 4.2 Plain-words result card

`BlockResultCard.tsx` gets a new top section. The existing metrics table moves into a closed `<details>` called "Details for the curious".

- **What you did:** a per-paradigm sentence from the existing `detail()`, rewritten simpler. E.g. "You caught 14 of 18 matching letters and pressed by mistake 2 times."
- **What it means:**
  - "Your working memory score is now about 61. We're fairly sure it's between 55 and 68."
  - The band becomes a **sure-o-meter**: an animated bar that narrows with each game, captioned "2 more games and we'll be much surer".
  - Fewer games → "We're still getting to know you".
- **What's next:** one button chosen by the existing selector reason, plus "Ask Bao about this game" → coach debrief.
- The score **counts up** from the old value to the new (motion, 800 ms). On a milestone, confetti + Bao `celebrate`.
- The self-estimate ("How sure are you?") stays before the result, restyled as Bao asking "Guess your score?"

**Plain-language pass across main screens:**

- Replace "estimate" → "score", "band" / "90% credible interval" → "how sure we are", "composite" → "game score", "block" → "game".
- Applies to home, dashboard, play, coach and result.
- `/validation`, `/skills` and the docs keep technical terms; the judges read those.
- A single `src/lib/words.ts` holds the user-facing labels, so the wording is consistent.

### 4.3 Bao the panda

`src/components/panda/`:

- **`Panda.tsx`:** an inline SVG panda (round head, ear tufts, eye patches, small body holding a bamboo stalk), about 120×120 at default size and scalable. It's built from named groups (`eyes`, `pupils`, `lids`, `paws`, `mouth`, `body`) animated with CSS keyframes and transforms.
- **States:**

  | State | Behaviour |
  |-|-|
  | `idle` | breathing + random blink every 3–6 s |
  | `wave` | |
  | `watch` | pupils follow a target element or the pointer |
  | `think` | paw on chin, eyes up |
  | `cheer` | |
  | `proud` | |
  | `oops` | paws over eyes, 1 s |
  | `sleep` | Z's, after 60 s idle on the page |
  | `celebrate` | jump + confetti trigger |
  | `quiet` | blink only |
  | `calm` | |

- **`usePanda()` + `pandaBus`:** a tiny typed event emitter (no dependency). Events: `trial:correct`, `trial:wrong`, `block:start`, `block:end`, `milestone`, `coach:mood`, `reward`.
  - Task renderers emit `trial:*` from their existing per-trial callback through one helper in `tasks/common.tsx`, so each renderer gets a one-line change.
- **Mode gating:** in `assessment` mode `PlaySession` sets Bao to `quiet` and ignores `trial:*` events. In `training` and `/try`, `trial:correct` → a short `cheer` (≤ 400 ms) at most every 3rd correct, and `trial:wrong` → `oops` at most once per 5 trials. This keeps it from being noisy.
- **Speech bubble** `PandaSay`: a short line from the line bank (`src/lib/panda/lines.ts`, keyed by event + context, ≥ 6 variants each, no repeat of the last 5 per session). Between blocks it can show the coach's one-line reply.
- **Placement:**
  - bottom-right corner of `/play` and `/try`, small
  - next to coach bubbles
  - hero on the landing page
  - home greeting
  - result card
- **Name:** "Bao". The landing introduces him: "I'm Bao. I'll watch you play and tell you what happened in plain words."
- **Reduced motion:** static poses only, with no idle breathing.

### 4.4 First visit: value in about 60 seconds

Signed-out landing page (`src/app/page.tsx`):

1. **Hero:** the 3D Brain Twin (4.7) with Bao waving in front. A headline in plain words ("Play a 1-minute game. Bao will tell you what it says about your mind."), a primary CTA **"Play a 1-minute game"**, and secondary links "Sign in" and "How it works".
2. **The CTA starts a short first game** at `/start`:
   - Corsi at level 2, because it's the most visual, needs no rules reading, and is about 60 s.
   - It uses the existing `TryTask` scoring in the browser, with Bao in `watch` mode.
3. **Plain result:** "You remembered sequences of up to 5 blocks! Want me to remember this and start your Brain Twin?" → **Yes** / "Just play more".
4. **Conversational signup** (`Onboarding.tsx` rewritten as steps, with Bao speaking each step):
   - nickname
   - required data consent
   - optional behaviour signals
   - optional AI coaching, each as Yes/No with one plain line
   - then the sign-in key card (existing)
5. **Goal pick:** chips for memory, focus, speed, reasoning, working with AI, just curious. Stored in `coach_memory.goal`.
6. **Carry-over:** the first game's trials are kept in `sessionStorage` (`{dimensionId, taskId, level, params incl. seed, startedAt, trials}`).
   - After signup the client creates an assessment session and POSTs the stored block to `/api/sessions/[id]/runs`, so it becomes the user's first real block. The server re-scores it; the client score is never trusted.
   - If that fails, it is silently skipped and the session just starts fresh.
   - Stored trials expire after 30 minutes and are cleared after use.
7. **Home** shows Bao's greeting, the daily gift (4.5), and "Your next game" with one button.

### 4.5 Bamboo rewards

New table `reward_events` (append-only): `id, user_id, kind, amount, day (date, UTC), ref (nullable text), created_at`, with a unique index on `(user_id, kind, day, ref)` to make awards idempotent.

| Kind | Bamboo | When |
|-|-|-|
| `daily_visit` | 5 | first authenticated page view of the day, claimed by opening the gift |
| `game_completed` | 10 | each completed valid block (ref = task run id) |
| `daily_plan_done` | 20 | all of today's plan items done |
| `daily_challenge` | 15 | daily challenge completed |
| `streak_day` | 5 × min(streak, 7) | first block of a day that continues a streak |
| `badge` | 25 | on earning a badge (ref = badge id) |

- **Streak freeze:** one per ISO week, earned automatically after 3 active days that week. It covers exactly one missed day. `dayStreak` gains an optional `freezeDays` parameter.
- **Badges** (`src/lib/rewards/badges.ts`, pure checks over existing data). These reward **consistency and curiosity**, never score level:
  - first game in each skill (7)
  - all 7 skills tried
  - 3-, 7- and 14-day streaks
  - first coach question
  - caught a planted error (research mode)
  - 5 daily challenges
  - first goal set
  - a game played after a tough one (persistence, using `affect.easeOff`)
- **Server** `src/lib/server/rewards.ts`:
  - `award(userId, kind, ref?)`, idempotent through the unique index
  - `getRewards(userId)` → `{total, today, streak, freezeAvailable, badges, gardenStalks}`
  - Awards are called from `recordRun`, the daily-gift API and the challenge completion.
- **UI:**
  - **Daily gift:** a chest on home on the first visit of the day; Bao `celebrate`; +5 bamboo floats up.
  - **Bamboo counter** in the header.
  - **Bamboo garden** on home: an SVG, one stalk per 50 bamboo up to 30, with a small growth animation for new stalks.
  - **Badge shelf** on the profile.
- **Export and delete** include `reward_events`.

### 4.6 Daily Bao challenge

- **Seed:** `dailySeed(date) = hash("ai4brain-daily-" + YYYY-MM-DD)`. The skill rotates through the 7 dimensions by day number. The level is the middle level of that task. So everyone gets the same puzzle on the same day.
- **Route `/daily`:**
  - **Signed in:** a training-mode block with that seed. It counts as a normal block (it improves the twin) and awards `daily_challenge` once per day.
  - **Signed out:** plays through `TryTask` with the fixed seed, and the result screen offers signup.
- **Share card:** text plus an emoji line, copied to the clipboard. It contains only your own result and today's date, no name. E.g. "Bao's daily · Oct 27 · Corsi 🟩🟩🟩🟨⬜ · span 5 · ai4brain".
- **No leaderboard and no friend comparison** (principle 3).

### 4.7 3D Brain Twin and animation

**Dependencies** (pinned exact versions verified on npm at install time):

- `three`, `@react-three/fiber@9` (the React 19 line)
- `motion` (count-ups, transitions)
- `canvas-confetti`
- No drei unless a needed helper is missing.

**`BrainTwin3D`** (`src/components/three/`):

- **Shape:** a point cloud of about 6,000 points shaped as two hemispheres, made procedurally (ellipsoids + noise, gyri-like ridges via a sine displacement). It needs no model file.
- **Regions:** points are tagged into 7 regions mapped to skills (frontal → reasoning and flexibility, parietal → visuospatial, temporal → memory, occipital → processing speed, a central band → attention, a small "halo" → AI reliance).
- **Landing page:** slow rotation, a pointer-parallax tilt, and the region under the pointer brightens with its skill name.
- **Dashboard ("Your twin"):**
  - **brightness = the skill's score** (mean)
  - **point jitter or fuzz = uncertainty** (band width): the more sure we are, the crisper the region
  - **unmeasured skills are dim grey**
  - A legend in plain words: "Brighter = higher score. Crisper = we're more sure."
  - This makes the 3D carry real information, which is our story.
- **Performance:**
  - Loaded with `next/dynamic` and `ssr: false`, only after the hero is visible.
  - `dpr` capped at 1.5; one `Points` mesh with a custom shader material (size, colour, jitter as attributes/uniforms).
  - Animation through `useFrame` only, with no React state per frame.
  - Paused when off-screen (IntersectionObserver).
- **Fallback:** if WebGL is unavailable, `prefers-reduced-motion` is set, or the device memory is under 4 GB, render the existing `BrainTwinArt` SVG.
- **Motion polish:** page fade/slide transitions on main routes, count-ups on scores, chip and button press springs, confetti on milestones and badges. All are disabled under reduced motion.

### 4.8 Demo readiness

- `scripts/seed-demo.ts` gains for the demo user:
  - rewards history (a 6-day streak, about 600 bamboo, 5 badges)
  - coach memory (goal: memory)
  - and the existing two weeks of blocks
  
  This gives a non-empty garden and forecast.
- A new `docs/demo-script.md` covers 5 minutes, with fallbacks if the network or API fails (the template coach is now good enough to demo):
  1. landing 3D
  2. 60-second game with Bao
  3. plain result
  4. conversational signup
  5. switch to the demo user
  6. coach: "I want to improve my memory" → Play button
  7. result card
  8. "What if I play every day?" → forecast
  9. gift, garden and daily challenge share
  10. dashboard 3D twin showing uncertainty as fuzz
- README "What makes it different" gains one row on the experience layer.

## 5. Data changes (migration `0005_ux_overhaul`)

- `users.coach_memory jsonb not null default '{}'`
- `users.preferences` type gains `researchMode?: boolean` (jsonb, no SQL change)
- `coach_messages.actions jsonb not null default '[]'` and `coach_messages.mood text`
- New table `reward_events` as in 4.5
- The privacy export (`/api/me/export`) and delete cover `coach_memory` and `reward_events`. Retention purges `reward_events` with the other data.

## 6. Error handling

- **LLM failure, refusal or invalid JSON:** fall back to the template coach (the same shape). The user never sees an error, only a slightly simpler answer. `meta.fallbackReason` is logged as today.
- **An invalid action from the model is dropped silently** and the reply stays.
- **Pace forecast with too little data:** returns null, and the coach says "I need about N more games of this skill to forecast".
- **Carry-over POST fails or the trials are expired:** skip and start fresh, with no error shown.
- **WebGL context lost:** swap to the SVG fallback.
- **Reward award race** (double submit): the unique index makes the second insert a no-op (`on conflict do nothing`).

## 7. Testing

Vitest (all pure logic):

- `intent.ts`: classifier on 40+ phrasings (including "visualisation", typos, "hi"), synonym map, no-repeat line picker
- `actions.ts`: drops unknown skills and types, caps at 3, builds the correct hrefs
- `pace.ts`:
  - null under 3 blocks
  - shrinkage toward 0 on noisy data
  - the band widens with pace uncertainty
  - the cap holds
  - more games/week gives a ≥ forecast when the slope > 0
- the number check accepts `P#` numbers and rejects made-up pace numbers
- `rewards`:
  - idempotent awards
  - streak with freeze (covers one gap, not two)
  - streak bonus cap
  - each badge rule
- `dailySeed`: stable per date, different across dates, skill rotation covers all 7
- panda `lines`: every event has ≥ 6 variants, slot filling, no repeat of the last 5
- research-mode gating: rating buttons, planted flaws and bet frequency
- coach memory update, and its inclusion in export/delete

**Regression:** all 132 existing tests stay green, plus typecheck, lint and build.

**Browser walkthrough** of the demo script at 1440×900 and 375×812, light and dark, plus reduced motion.

## 8. Build order (under 2 weeks)

1. Coach contract, actions, intent fallback, memory, consent in chat, research mode (days 1–3)
2. Pace forecast in the coach (day 4)
3. Plain result card, words pass, count-up (day 4–5)
4. Bao the panda, event bus, line bank, placements (days 5–7)
5. First-visit journey and carry-over (day 7–8)
6. Rewards, gift, garden, badges, streak freeze (days 8–9)
7. Daily challenge and share card (day 10)
8. 3D Brain Twin and motion polish (days 11–12)
9. Demo seed, demo script, README, full walkthrough (day 12)

Each step ships working and demo-able on its own. If time runs out, cut from the bottom.

## 9. Out of scope

- friend challenges and leaderboards (ethics)
- French/Arabic
- a 3D panda or Rive assets
- push notifications or email
- payments
- new cognitive tasks
- changes to scoring, the profiler or validation maths
