# Reference Pattern implementation policy (Library v0.2)

This is a permanent process rule for every new Reference Pattern added to
`pipeline/reference-patterns/library.json`, not a one-off checklist for a single pattern. It
exists because of a repeated failure mode across this library's own history: RP-KPI-EXEC-
DASHBOARD-01's first pass and RP-MATRIX-BADGELIST-01's first pass both got the **Semantic
Contract** right (the right fields, the right eligibility checks, the right adapter) while
visually **simplifying the reference image's own composition** — a plainer 2x2 table, a
flatter card grid — because the reference image was treated as mood-board inspiration rather
than as a binding specification. Both needed a second "bring it back in line with the
reference" pass only because the first pass never wrote down what the reference image actually
required. This document makes that write-down step mandatory, not optional, and not something
that has to be asked for by name each time.

## The pipeline is mandatory, not advisory

```
Reference image
  ↓
Visual Pattern Analysis   (extract, don't skim — see the 10 categories below)
  ↓
Visual Contract           (write it down before touching code)
  ↓
Semantic Contract         (elements[]/relationships[] shape, useWhen/doNotUseWhen,
                            Selector structural check)
  ↓
Renderer implementation   (HTML + PPTX, built to satisfy BOTH contracts)
```

**Before writing any Selector/adapter/renderer code for a new pattern, its reference image
must be analyzed and its Visual Contract written down.** The reference image is not a "look
for inspiration" reference — it is the pattern's primary source document for what its visual
composition IS, on equal footing with the Semantic Contract that defines what its data IS.
Treating the Semantic Contract as the real spec and the image as texture is exactly the failure
mode this document exists to prevent.

## Visual Pattern Analysis — the 10 categories to extract

Work through all 10 for every new pattern's reference image before writing a line of
implementation code. Write the answers down (see "Where this gets recorded" below) — doing
this analysis silently, in your head, defeats the purpose: the point is a record that outlives
the session and that a visual review can be checked against later.

1. **Overall Composition** — how the slide's area is divided (main region / supporting band /
   side panel / footer, etc.), and each region's relative size and position.
2. **Visual Hierarchy** — the priority order among title / subtitle / key message / section
   header / body / note; which single element is the most emphasized; the order the eye is
   meant to travel.
3. **Component Anatomy** — the internal structure of each component (card / table / quadrant /
   KPI tile / badge / insight panel / etc.): where icon, number, label, title, body, evidence,
   note sit relative to each other, and which of those are required vs. optional per
   component.
4. **Color Roles** — what each color MEANS (primary / accent / pale background / emphasis /
   warning), not its literal hex value. When the color is later swapped to this project's own
   House Style palette, the ROLE each color plays must survive the swap unchanged.
5. **Geometry** — column/row counts, each region's width ratio, padding/gap/border/divider
   values, alignment, and the shape of any axis/arrow/connector.
6. **Typography** — the relative size of numbers vs. headings vs. body text, where bold vs.
   regular weight is used, and a rough sense of how many lines/how much text each slot is
   built to hold.
7. **Iconography** — what each icon MEANS (not just what it looks like), how it combines with
   a circle/pill/badge container, and whether it's purely decorative or a semantic cue the
   reader is meant to read.
8. **Emphasis Logic** — exactly how emphasis is applied (which column/quadrant/KPI/
   recommendation gets it), whether it touches only the header or the body too, and how it
   differs from every other, non-emphasized instance of the same component.
9. **Adaptive Rules** — what must stay constant when the element count changes; which variant
   is canonical (closest to the reference image); what an adaptive variant is allowed to change
   vs. what it must preserve from the canonical composition's own Visual Grammar.
10. **Reference-defining Features** — 3 to 7 visual features that, if lost, would make this
    stop being recognizably the same pattern as the reference image. This is the fidelity
    checklist a finished implementation gets compared against.

## Implementation principles

- Don't simplify a reference image's distinctive composition for implementation convenience.
- Don't force-fit an existing template's shape; if Reference fidelity would suffer, extend the
  template instead (same "never replace, only extend" discipline this library already follows
  for Semantic Contracts — matrix_2x2, kpi_dashboard, comparison_table, decision_page,
  recommendation_pillars have all grown a second, richer shape rather than mutating the first).
- Semantic fidelity alone does not PASS a pattern. A Selector that correctly accepts/rejects
  content and an adapter that correctly shapes it are necessary, not sufficient.
- The canonical variant is the composition closest to the reference image itself, not whichever
  shape was easiest to implement first.
- An adaptive variant extends the canonical composition's own Visual Grammar; it does not
  invent a different, simpler one for smaller/larger element counts.
- Swapping the reference image's literal colors for this project's House Style palette is
  fine — swapping (or flattening) the information hierarchy, the region composition, or the
  emphasis logic those colors were expressing is not.
- Don't add an element that isn't in the reference image for the sake of looking more
  finished.
- Don't drop a major compositional element that IS in the reference image (a supporting band,
  a side panel, an axis) for implementation convenience.

## Acceptance Gate

A pattern is not done until all of the following are true, not just the semantic/structural
subset that was already this library's practice before this document:

- **Semantic fidelity** — the Selector's structural check and the adapter's field mapping are
  correct (no dropped/misrouted content).
- **Reference composition fidelity** — see below; this is the one that was previously missing.
- **Visual hierarchy fidelity** — the same element reads as most-emphasized, in the same
  reading order, as the reference image.
- **Emphasis logic fidelity** — emphasis is applied the same way (header-only vs. header+body,
  which component gets it) as the reference image.
- **Adaptive layout quality** — every supported element count still reads as the same pattern,
  not a degraded one.
- **Overflow / clipping** — 0 findings from the existing mechanical/geometry QA gates.
- **HTML / PPTX parity** — both renderers implement the same Visual Contract, not two
  independently-simplified interpretations of it.
- **PPTX OOXML audit** — 0 structural findings (existing `audit_pptx_structure.mjs` gate).
- **Existing corpus regression** — the full unit suite and the existing example/integration/
  super_template decks still validate and render clean.

**Reference composition fidelity is checked by looking, not by reasoning about the code.**
Render the canonical fixture, place a screenshot of it next to the reference image, and compare
them side by side. If a major compositional difference remains — a missing supporting band, a
collapsed hierarchy, a flattened emphasis treatment, a simplified component anatomy — the
pattern does not PASS regardless of how clean the Selector/adapter/QA-script output looks.
"The Semantic Contract is satisfied" is not, by itself, a passing result.

## Where this gets recorded

For every new pattern, before implementation begins, write its Visual Pattern Analysis output
into a per-pattern contract file at
`pipeline/reference-patterns/visual-contracts/<patternId>.md`, structured as:

```
<patternId>
├── Semantic Contract     — requiredSemanticRoles / optionalSemanticRoles / relationshipsRequired
│                           / the Selector's structural check (can point at library.json's own
│                           entry rather than duplicating it verbatim)
├── Visual Contract        — the 10-category analysis above, written out
├── Adaptive Rules         — canonical variant, what adaptive variants may/may not change
└── Acceptance Criteria    — the Acceptance Gate checklist above, with this pattern's own
                             Reference-defining Features (category 10) as the side-by-side
                             comparison checklist
```

This is a companion to, not a replacement for, `references/pre-family-ir-authoring.md` (which
documents the Semantic Contract's `elements[]`/`relationships[]` authoring shape in depth) and
`pipeline/reference-patterns/library.json` (the machine-read Semantic Contract itself). The
contract file's job is specifically the Visual Contract half that nothing else in this
pipeline currently writes down anywhere.

## Scope

This applies to every pattern implemented from here forward. It is not a mandate to
retroactively re-audit patterns already frozen before this document existed — but if a frozen
pattern's own reference-fidelity gap resurfaces (as RP-KPI-EXEC-DASHBOARD-01's and
RP-MATRIX-BADGELIST-01's did), fixing it means writing its Visual Contract down now, not just
patching pixels again.
