# Adding a cognitive dimension (the "surprise element" playbook)

Dimensions are configuration, not code. A new skill that reuses one of the six task types (n-back, Stroop, symbol-digit, task switching, Corsi, matrices) is added **without touching any code**. The selector, profiler, coach, dashboard, weekly plan, validation study and measurement cards all pick it up.

## In 60 seconds

```bash
npm run new-dimension -- --id selective_attention --name "Selective attention" --from attention_inhibition --definition "Focusing on what matters while ignoring distractors."
```

This:
1. copies the source dimension's task (renderer, difficulty levels, scoring, validity rules, fitted calibration) into `dimensions/selective_attention.yaml`;
2. gives the new skill the next unused colour from the validated palette;
3. validates every dimension file (`npm run dims:check` does the same) and fails with a precise message if anything is wrong.

Restart the dev server and the skill shows up everywhere.

## Then tailor it (optional, 5 minutes)

Edit `dimensions/<id>.yaml`:

| Field | What to change |
|-|-|
| `card.*` | Definition, what it is not, biases, citations: these become the measurement card at `/skills` |
| `tasks[0].params` / `difficulty.levels[].params` | Task settings (e.g. more incongruent trials, a shorter deadline) |
| `tasks[0].scoring.components` | Which metrics count, their weights (must sum to 1) and normalisation ranges |
| `tasks[0].validity` | Anticipation/timeout limits, chance level, streak limit |
| `profile.prior` | Starting estimate and uncertainty |

Then refit the level maps and noise on simulated users and check the numbers:

```bash
npm run validate -- --apply
```

## A genuinely new task type

A new paradigm needs three small pieces, each following an existing example:
1. a generator and synthetic responder in `src/lib/tasks/` (see `stroop.ts`);
2. a metrics function in `src/lib/scoring/metrics.ts` and a simulator case in `src/lib/sim/index.ts`;
3. a renderer in `src/components/tasks/`, registered in `PlaySession` and `TryTask`, plus its name in `PARADIGMS` and `AVAILABLE_PARADIGMS`.
