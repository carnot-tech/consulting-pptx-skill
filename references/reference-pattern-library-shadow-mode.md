# Reference Pattern Library v0.2 — Shadow Mode

Shadow Mode observes how `pipeline/scripts/reference_pattern_selector.mjs` would route real
production slides, without that observation ever reaching the client. It exists to accumulate a
natural sample of real usage toward a later, separate decision: promoting Library v0.2 from
"frozen library" to "Active Library / Production Selector."

## Hard invariant

**Shadow processing must never affect production output, and a shadow-side failure must never
halt or alter the production pipeline.**

Concretely, a shadow-selected pattern MUST NOT:
- alter production template selection
- alter the production SlideSpec
- alter the rendered HTML/PPTX
- alter QA pass/fail
- block delivery

Shadow is `draft IR → selectPattern() → log only`, and nothing else. There is no arrow back from
the Shadow sidecar into the Production path:

```
Production:  Ghost Deck → production authoring → SlideSpec → render / QA / delivery
Shadow:                    └→ candidate screen → Pre-family IR draft → Selector → append log
                                                                        (NO JOIN BACK)
```

`pipeline/scripts/shadow_evaluate_slide.mjs`'s `evaluateSlideForShadow()` is the single call
site production code uses, and it is the concrete implementation of this invariant: it never
throws. A failure drafting the Pre-family IR, a `selectPattern()` exception, or a log-write
failure are all caught internally and folded into the returned record as `shadow.status:
"SHADOW_ERROR"` / `shadow.error`. Production can call this function, ignore its return value
entirely, and is provably unaffected by anything that happens inside it.

## Scope: which slides get shadow-evaluated (the candidate screen)

Only slides whose Ghost Deck `role`/`key_message`/`evidence_needed` plausibly match one of the 7
Library v0.2 patterns' own `useWhen` criteria (`pipeline/reference-patterns/library.json`):

| candidateFamily | variant | patternId |
|---|---|---|
| `kpi-dashboard` | `standard` | RP-KPI-EXEC-DASHBOARD-01 |
| `comparison-table` | `standard` | RP-COMPARISON-TABLE-01 |
| `decision-ask` | `standard` | RP-DECISION-ASK-01 |
| `key-takeaways` | `standard` | RP-KEY-TAKEAWAYS-01 |
| `matrix` | `badge-list` | RP-MATRIX-BADGELIST-01 |
| `100day-workstream` | `standard` | RP-100DAY-WORKSTREAM-01 |
| `operating-model` | `standard` | RP-OPERATING-MODEL-01 |

The candidate screen runs **before** the Selector, not instead of it: it's a plausibility check
("does this slide's content look like it could be one of these 7?"), separate from the
Selector's own deterministic eligibility check. A slide that doesn't plausibly fit any of the 7
is skipped entirely — `evaluateSlideForShadow()` returns `null` and nothing is logged. Forcing
every slide through Selector evaluation just to produce a data point would flood the log with
meaningless rejections and make the Promotion Gate numbers meaningless. Deck-level coverage
(`totalSlides` vs `shadowCandidates` vs `shadowEvaluated`, via
`summarizeShadowDeckCoverage()` in `aggregate_shadow_promotion_gate.mjs`) exists precisely to
let a later review catch selection bias in this screen, not to force full coverage now.

## Two logs, deliberately separate

Predictions and human judgment are **never stored in the same record**, and neither file lets an
existing entry be rewritten in place — this is what makes "wrong selection = 0" an objective,
un-gameable measurement: a prediction is committed before anyone looks at whether it was right,
the same discipline as a holdout evaluation.

### `pipeline/shadow/shadow-routing.json` — predictions (immutable, `log_shadow_routing.mjs`)

One record per shadow-evaluated slide, written once by `evaluateSlideForShadow()`. Re-writing an
existing `recordId` throws (`log_shadow_routing.mjs` enforces this).

```jsonc
{
  "recordId": "shadow-<runId>-<slideId>-...",
  "timestamp": "2026-09-13T...",
  "runId": "...",
  "deckId": "...",
  "slideId": "...",
  "candidateScreen": { "eligibleForShadow": true, "reason": "plausible_matrix_candidate" },
  "production": { "template": "matrix_2x2", "unchanged": true },
  "shadow": {
    "status": "SELECTED" | "DEFERRED" | "SHADOW_ERROR",
    "selectedPattern": "RP-MATRIX-BADGELIST-01" | null,
    "consideredPatterns": ["RP-MATRIX-HERO-01", "RP-MATRIX-PLAIN-01", "RP-MATRIX-BADGELIST-01"],
    "eligibilityEvidence": {},
    "deferReason": null,
    "error": null
  },
  "provenance": {
    "libraryVersion": "reference-pattern-library-v0.2",
    "selectorHash": "...",
    "preFamilyIrHash": "..."
  }
}
```

### `pipeline/shadow/shadow-adjudications.json` — gold (immutable, `log_shadow_adjudication.mjs`)

One record per reviewed prediction, added later, joined by `recordId`.

```jsonc
{
  "recordId": "shadow-...",
  "reviewedAt": "...",
  "gold": { "selectable": true, "expectedPattern": "RP-MATRIX-BADGELIST-01" },
  "verdict": "CORRECT_SELECTION" | "WRONG_SELECTION" | "CORRECT_DEFER" | "UNNECESSARY_DEFER" | "NOT_EVALUABLE",
  "unsupportedInvention": false,
  "semanticDrop": false,
  "productionInterference": false,
  "notes": ""
}
```

`unsupportedInvention`, `semanticDrop`, and `productionInterference` live here, not on the
prediction — they are human judgments about the shadow selection's quality, the same category as
`verdict`. `productionInterference` specifically means a shadow error actually leaked into
production (not merely that a `SHADOW_ERROR` was logged — see Promotion Gate below).

Both files are gitignored (`pipeline/shadow/`, added to `.gitignore`) — real client slide content
never lands in git, matching every other pipeline run artifact under `generated/`.

## Promotion Gate

`pipeline/scripts/aggregate_shadow_promotion_gate.mjs` joins the two logs by `recordId` and
scores **only reviewed predictions** (those with a matching adjudication) — an un-reviewed
prediction counts toward nothing until it's been looked at. Priority order (precision-first;
recall is last and informational only):

1. `wrongSelection` — **must be 0**
2. `unsupportedInvention` — **must be 0**
3. `semanticDrop` — **must be 0**
4. `productionInterference` — **must be 0**
5. `shadowErrors` — reported only, from ALL predictions (reviewed or not); never itself a FAIL —
   only `productionInterference` (a shadow error that demonstrably reached production) is
6. `unnecessaryDefer` — reported only, always an acceptable/safe outcome
7. `selectableRecall` = `correctSelection / (correctSelection + wrongSelection + unnecessaryDefer)`
   — reported last, informational

A nonzero count in metrics 1-4 is an automatic `promotionVerdict: "FAIL"` regardless of how many
correct selections came before it. Worked examples (the user's own):

- 27 reviewed: 18 correctSelection, 0 wrongSelection, 7 correctDefer, 2 unnecessaryDefer, 0
  invention/drop/interference, 1 shadowError (contained, no interference) ⇒ **PASS**
  (`selectableRecall` = 18/20 = 0.90).
- 19 selected with 1 wrongSelection ⇒ **FAIL** — one wrong selection outweighs 19 good ones.
- An `unnecessaryDefer`-only result (no wrong selections) is never itself a FAIL — it only lowers
  `selectableRecall`.

Below the sample floor (default 20 reviewed observations, matching the "20〜30枚" real-deck
example) the verdict is `INSUFFICIENT_DATA` rather than `PASS` — there isn't yet enough natural
signal either way.

## Checkpoint sequence

```
Frozen Library v0.2 (tag: reference-pattern-library-v0.2)
        ↓
Shadow Mode wired on library-v0.2, self-tested          <- this work
        ↓
tag: shadow-integration-v1                                (checkpoint, still on library-v0.2)
        ↓
Real production sessions accumulate shadow-routing.json predictions
        ↓
Promotion Gate review: adjudicate each reviewed prediction into shadow-adjudications.json,
run aggregate_shadow_promotion_gate.mjs
        ↓
PASS ⇒ separate, later decision: merge to main / promote to Active Library
```

Merging this work into `main` is explicitly **not** part of this checkpoint — `main` stays at
`ghost-deck-pipeline-v1-production` until that separate decision is made.
