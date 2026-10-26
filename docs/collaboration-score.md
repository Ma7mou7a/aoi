# AI Collaboration Score

The AI Collaboration Score (0–100) measures how well a user works with the AI coach: whether they question it, check it, build on it and think for themselves, rather than how well they perform on tasks. It is a **design proposal, not a validated psychometric instrument**.

Implementation: [`src/lib/collab/score.ts`](../src/lib/collab/score.ts). Formula version: `collab-v1`.

## Formula

```
score = round(100 × Σ_c w_c × s_c)

s_c = (Σ_i v_i + m × k) / (n_c + k)
```

- `c` is one of five components, with weight `w_c` taken from the challenge brief's proposal.
- `v_i ∈ [0, 1]` is the value of each signal recorded for that component; `n_c` is how many there are.
- `m = 0.5`, `k = 2` is a neutral prior: each component starts as if the user had done 2 neutral things. New users start at **50**, and a few clicks can't swing a component to 0 or 100. With many signals, `s_c` converges to the plain average of the signal values.

| Component | Weight | What it measures |
|-|-|-|
| Clarification | 20% | Asking the coach to explain, especially about a specific result |
| Critical verification | 25% | Checking claims against the evidence instead of accepting them blindly |
| Iteration | 20% | Building on answers: follow-up questions, acting on suggestions |
| Autonomy | 20% | Thinking first: predicting how a session went before asking the AI |
| Responsible use | 15% | Using the AI within its limits and staying in control of your data |

## Signals

Every signal is emitted by a concrete action in the app and stored in `collab_events`. After each batch, a score snapshot goes to `collab_scores`, which keeps the score's history.

| Signal | Component | Value | Emitted when |
|-|-|-|-|
| `asked_question` | Clarification | 0.7 | The user asks the coach a general question |
| `asked_specific_question` | Clarification | 1.0 | The question is about a specific result, number or "why" |
| `opened_evidence` | Critical verification | 0.8 | The user opens "See the evidence" on a claim (once per claim) |
| `verified_then_accepted` | Critical verification | 1.0 | Marks a claim "Looks right" after opening its evidence |
| `accepted_unchecked` | Critical verification | 0.3 | Marks a claim "Looks right" without opening its evidence |
| `caught_planted_flaw` | Critical verification | 1.0 | Flags the deliberately wrong claim ("Something's off") |
| `missed_planted_flaw` | Critical verification | 0.0 | Marks the wrong claim "Looks right", or moves on to a new debrief without answering |
| `flagged_correct_claim` | Critical verification | 0.4 | Flags a claim that was correct (healthy scepticism, but mistaken) |
| `follow_up_question` | Iteration | 1.0 | Asks a question within 30 minutes of a coach answer |
| `acted_on_advice` | Iteration | 1.0 | Starts a session after a coach message with a next step |
| `prediction_correct` | Autonomy | 1.0 | Predicted better / same / worse before a debrief, and was right (±2 points counts as "same") |
| `prediction_wrong` | Autonomy | 0.6 | Made a prediction that turned out wrong (still thought first) |
| `prediction_skipped` | Autonomy | 0.2 | Skipped the prediction |
| `in_scope_question` | Responsible use | 1.0 | Asked a question the coach can answer (about learning) |
| `clinical_question` | Responsible use | 0.3 | Asked about a health condition, which is outside a non-clinical tool's scope |
| `reviewed_data_settings` | Responsible use | 1.0 | Opened privacy & data settings (at most once a week) |

## Spot-the-error mode (planted flaws)

Critical verification is hard to measure if the AI is always right. With the user's opt-in consent (`planted_flaws`, off by default), about 35% of debriefs that have at least 2 claims carry **one deliberate error**: one number in a claim's "why" is changed (by roughly ±40%, never outside 0–100%). The evidence is never altered, so the error can always be caught by opening it.

- Until the user answers, the API doesn't tell the browser which claim is planted. The UI only says that the message contains a mistake.
- Every planted error is **revealed** right after the user answers, or when they move on to a new debrief. The correct text is then restored in the stored message.
- The change is made by deterministic code (`src/lib/collab/plant.ts`), never by the language model.

## Known limitations

- The weights and signal values are a design proposal. They should be validated, for example by comparing the score with expert ratings of user–AI interactions.
- Signals measure observable behaviour, not intent. A user can click "See the evidence" without reading it.
- The score depends on how often the coach is used. A user who never opens the coach stays near 50, which means "unknown", not "average".
