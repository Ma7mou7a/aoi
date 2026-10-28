# Ethics, consent and data

AI4Brain is a **non-clinical learning tool**. It helps people practise and understand their own cognitive performance. It never diagnoses, never compares a user with norms or other people, and must not be used for medical, hiring, educational-selection or insurance decisions.

## Principles

1. **Non-clinical by construction.** Every coach text passes a clinical-term filter (`src/lib/coach/safety.ts`). Diagnostic language ("ADHD", "dementia", "disorder", "IQ"…) removes the whole claim, and medical-sounding words are rewritten ("impairment" → "difficulty"). A question about a health condition always gets a fixed non-clinical answer first, pointing to a qualified professional.
2. **Uncertainty is always shown.** Every estimate carries a 90% band; forecasts are labelled "a forecast, not a promise" and their track record is shown.
3. **Evidence over assertion.** Every coach claim links to the exact blocks and trials behind it; claims without valid evidence are dropped before the user sees them.
4. **Non-biometric.** No camera is ever used. The microphone is used only for optional voice questions (speech → text by the browser, reviewed by the user before sending). **No score, inference or decision is ever based on face or voice.**
5. **Opt-in, granular, reversible consent.** Nothing optional is pre-ticked; every choice can be changed at `/settings`; every change is stored (append-only) with the policy version.

## What is stored, why, and for how long

| Data | Purpose | Consent | Kept |
|-|-|-|-|
| Display name (any nickname) | Greeting | Required (data processing) | Until deletion |
| Sign-in key **hash** (SHA-256; the key itself is shown once and never stored) | Signing back in on another browser or device, without email or password | Created at signup | Until replaced or deleted |
| Task trials: stimulus, response, correct, response time | Scoring, evidence for the coach | Required | Retention window |
| Block scores, validity flags, profile snapshots, forecasts | Brain Twin, dashboard | Required | Retention window |
| Behaviour signals: window focus loss, timing-based fatigue/frustration inference | Down-weighting unreliable blocks; break suggestions | `behavioural_signals` (opt-in) | Retention window; dropped before storage if not granted |
| Coach messages, claim verdicts, collaboration signals | Coaching, AI Collaboration Score | Required (LLM use needs `llm_coaching`) | Retention window |
| Coach memory (goal, most-played skill, last 5 topics and lines) | Answers that fit and never repeat | Required | Until deletion (part of the user row) |
| Bamboo reward events (kind, amount, day) | Daily gift, streaks, badges, garden | Required | Retention window |
| Device type, screen size | Interpreting response times | Required | Retention window |
| Consent history | Accountability | n/a | Until deletion |

**No email, password, real name, location, IP-based profile, audio or images are collected.** Identity is a random ID in an HTTP-only cookie.

**Retention:** the user chooses 30, 90, 180 (default) or 365 days. Older data is deleted when the setting changes and at the start of every session (`purgeExpired`).

## Data sent to third parties

Only with the `llm_coaching` consent: an **evidence pack** goes to one AI provider to write coaching text: **Anthropic's Claude API** when the server has an Anthropic key, otherwise **an open-weight model on Groq's API** (`COACH_PROVIDER` can force one). It contains:
- skill names, scores and bands
- game-level metrics and counts of trial groups ("5 matches caught")
- forecasts at a pace
- a short coach memory: the user's goal, most-played skill and recent question topics

It contains **no name, no user ID, no database IDs and no raw trial data**. The display name is removed from the question and the conversation history before sending (`src/lib/coach/prompt.ts`, tested), because Bao's built-in lines greet people by name. Providers process requests under their API terms and, by default, do not train on API data. The model must cite references from the pack, and everything it returns is re-checked server-side. Without consent, or when the API is unavailable, a deterministic rule-based coach is used instead. Voice questions are transcribed by the user's browser, which may use its vendor's speech service (disclosed in Settings).

## Motivation without dark patterns

The experience layer (Bao the panda, bamboo, streaks, badges, the daily challenge) is designed to bring people back without manipulating them:
- **Rewards never touch a score.** Bamboo and badges are stored separately and never enter scoring, the profile or the coach's evidence.
- **Effort and curiosity, never level.** Every badge is about showing up, trying skills, asking questions or playing again after a tough game. None depends on how high a score is, so slower or newer players earn exactly the same.
- **No loss framing.** A weekly streak freeze covers one missed day. Nothing is taken away for missing a day, and there are no push notifications or emails.
- **Measurement comes first.** Bao only blinks during scored assessment games, and reacts only in practice, between games and on results.
- **No health claims.** We talk about practice on these tasks, never about a "better brain" (cf. the 2016 FTC action against Lumosity). Comparisons are only ever with the user's own history; the daily challenge shares only your own result.
- **Opt-in research tools.** Claim ratings and planted errors run only in Research mode, so everyday users aren't treated as test subjects.

## User rights in the app

- **See:** every claim's evidence; the full consent history; measurement cards explaining how each score is computed (`/skills`).
- **Export:** `/api/me/export` downloads everything stored as JSON.
- **Change:** consents and retention at `/settings`, effective immediately.
- **Delete:** one click removes the user and all their data (database cascade). Only a salted hash and row counts are kept in `deletion_log` as proof of deletion.

## Spot-the-error mode (deliberately wrong AI output)

To measure **critical verification** (25% of the AI Collaboration Score), the opt-in spot-the-error mode sometimes changes one number in one coach claim. Safeguards:
- it is **off by default** and described before the user opts in;
- the change is made by deterministic code, never by the language model, and the evidence itself is never altered;
- the API does not reveal which claim is planted until the user answers;
- **every** planted error is revealed and corrected right after the user answers, or when they move on.

## Second-opinion game (an AI helper that is sometimes wrong on purpose)

- The instructions state it before every block: the helper is right most of the time but sometimes wrong on purpose.
- Practice trials reveal whether the helper was right, and the result screen explains what the score measures.
- It only uses arithmetic comparisons with no personal content, and its results are compared with the user's own history only.

## Emotion-aware features

Fatigue and frustration are **inferred only from behaviour** (slowing responses, error streaks, session length, focus loss, abandoned blocks). The inference is shown with the cues behind it, labelled as a guess ("you know best"), can be dismissed, never changes a score, and only adjusts the next training block's difficulty by one level. No affect is ever inferred from face or voice.

## Known risks and mitigations

| Risk | Mitigation |
|-|-|
| Users read scores as intelligence or a diagnosis | "What it is not" on every measurement card; no norms; clinical filter; language always relative to the user's own history |
| Over-trust in the AI coach | Evidence links, claim verdicts, spot-the-error mode, AI Collaboration Score |
| Discouragement from low estimates | Growth framing, wide bands shown honestly, break suggestions, plans aimed at ~75% success |
| Cultural/language bias (e.g. Stroop needs fluent reading of English colour words) | Listed per task under "Known biases"; language-free tasks (matrices, Corsi, symbol-digit) |
| Device/latency differences | Device logged; RT has limited weight; comparisons only within the same user |
| Simulated validation ≠ real-world validity | Stated limitation; calibration lives in config to be refitted on pilot data |
