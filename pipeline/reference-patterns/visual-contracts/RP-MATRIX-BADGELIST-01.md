# RP-MATRIX-BADGELIST-01 — Visual Contract

**BACKFILLED**, per explicit review during the Library v0.2 Integration Gate — written AFTER
implementation, documenting the current shipped state, not a pre-implementation design
document. This pattern's first implementation pass also got its Semantic Contract right while
visually simplifying the reference image (axis labels with no arrows, a flat-bullet insights
panel, thin single-line badge items, weak quadrant emphasis) — the same failure mode
RP-KPI-EXEC-DASHBOARD-01 hit, and the second concrete case (alongside KPI Dashboard) that
motivated `references/reference-pattern-implementation-policy.md`'s mandatory Visual Contract
process for every pattern after it. This backfill exists so the Library holds all 7 patterns in
the same Reference/Semantic/Visual/Adaptive/Acceptance format, not so this pattern gets
re-implemented.

Source: `pipeline/reference-patterns/golden-fixtures-v0.2/RP-MATRIX-BADGELIST-01.jpg`.

## Canonical Composition

```
Title / subtitle
──────────────────────────────────────────────────────────────
高▲                                                          [bulb] 示唆
 │  ┌─────────────┐┌─────────────┐
 │  │II 早期対応   ││I  最優先(強調)│                          1  insight
 │  │  (● icon) …  ││  (● icon) …   │
 │  │  (● icon) …  ││  (● icon) …   │
低  └─────────────┘└─────────────┘                          2  insight
 対  ┌─────────────┐┌─────────────┐
 応  │IV 継続監視   ││III 計画対応  │
 緊  │  (● icon) …  ││  (● icon) …  │
 急  └─────────────┘└─────────────┘
 度  低 ─────────────── 事業影響度 ─────────────────▶ 高
```

2 structural bands: **title/subtitle** → **the matrix body** (arrow-drawn axes + 2x2 quadrant
grid + insights panel, all one composition — the insights panel is not a separate closing band
the way later patterns' synthesis bands are, it sits beside the grid as a third column).

## Semantic Contract (as implemented)

Template `matrix_2x2`, `quadrants` shape with `q.items` present (the badge-list variant,
auto-detected — the SAME template's flat `title`/`body`/`evidence` quadrant shape from
RP-MATRIX-HERO-01/PLAIN-01 is unchanged and untouched by this pattern).

```
matrix
  yAxis / xAxis           // axis title strings
  yAxisLow / yAxisHigh    // axis endpoint labels
  xAxisLow / xAxisHigh
quadrants[]               // always exactly 4: top-left/top-right/bottom-left/bottom-right
  position
  number                  // roman numeral priority label, e.g. "I"
  label                   // quadrant headline
  summary?
  emphasis?               // 0 or 1 quadrant, whole-quadrant highlight
  items[]
    title
    icon                  // person/people/bar-chart/laptop/tag/cart/truck
    emphasis?             // independent per-item accent
insights                  // reuses kpi_dashboard's own field/shape verbatim
  title?
  items[]
```

## Visual Pattern Analysis

1. **Overall Composition** — a 2x2 quadrant grid with arrow-drawn axes on its left/bottom
   edges, and an insights panel as a third column to the grid's right (not a bottom band).
2. **Visual Hierarchy** — title → axis labels (establishing what's being triaged along which
   dimension) → quadrant numbers/labels → badge item text → insights panel.
3. **Component Anatomy** — each quadrant: a header (numbered circle + label + optional summary)
   over a stack of badge-pill items (icon circle + text, centered, not stretched full-width).
   The insights panel: a bulb-badge header over numbered WHITE CARDS (not a flat bulleted
   list) — a deliberately different visual treatment from kpi_dashboard's own insights panel
   even though both read the identical `{title?, items:[string]}` data shape.
4. **Color Roles** — navy = quadrant number badges + the emphasized quadrant's header; a
   lighter accent tint = the emphasized quadrant's BODY (not just its header) and the insights
   panel's own background; badge pill borders/icons pick up the same accent.
5. **Geometry** — axes are real arrow shapes (a line + an arrowhead), not plain text labels;
   badge pills are sized to roughly 2/3 of their quadrant's own width, centered, not stretched
   edge-to-edge.
6. **Typography** — quadrant numbers are the largest numerals in the grid; badge item text and
   insight card text share a similar supporting-detail size tier.
7. **Iconography** — badge items carry a closed, per-item semantic icon vocabulary
   (person/people/bar-chart/laptop/tag/cart/truck) distinct from every other pattern's own icon
   set in this library.
8. **Emphasis Logic** — 0 or 1 quadrant may carry `emphasis: true` (an authored flag, the SAME
   convention RP-MATRIX-HERO-01/PLAIN-01 already established) — and per this pattern's own
   fidelity pass, emphasis touches BOTH the quadrant's header AND its body (a visibly tinted
   wash), not just the header alone; getting this half-right (header only) was exactly this
   pattern's own first-pass simplification.
9. **Adaptive Rules** — the quadrant grid is always exactly 2x2 (4 quadrants); only the number
   of badge items per quadrant varies (independently per quadrant, no shared count).
10. **Reference-defining Features**:
    1. Real arrow-drawn axes (line + arrowhead), not plain text labels.
    2. A 2x2 grid where each quadrant carries its own priority number, label, and optional
       summary — not a bare 4-box layout.
    3. Badge-pill items (icon + text, centered, sized ~2/3 of quadrant width) — not a thin
       single-line list.
    4. Whole-quadrant emphasis (header + body both tinted) on the single highest-priority
       quadrant.
    5. The insights panel as numbered WHITE CARDS with a bulb-badge header, not a flat bulleted
       list — despite reusing kpi_dashboard's own data field.

## Acceptance Criteria

The standard Acceptance Gate from `references/reference-pattern-implementation-policy.md`,
already satisfied by this pattern's existing implementation and test coverage: Semantic
fidelity, Reference composition fidelity (re-confirmed via this backfill's own comparison
against the reference image, including the post-fidelity-pass axis-arrow/insights-panel/badge-
size/emphasis corrections), Visual hierarchy fidelity, Emphasis logic fidelity
(quadrant-level `emphasis` touches header+body, item-level `emphasis` is independent), Adaptive
layout quality (per-quadrant item count independence), Overflow/clipping (0 findings), HTML/
PPTX parity, PPTX OOXML audit, Existing corpus regression — see `test/unit.test.mjs`'s own
`matrix_badgelist end to end` test and the Library v0.2 Integration Gate's Selector Collision
Matrix (this pattern's own fixture PASSes only the `matrix|badge-list` intent — confirmed
rejected by both `matrix|hero` and `matrix|plain`, and a Hero-shaped fixture is confirmed
rejected by `matrix|badge-list`, alongside the other 6 patterns).
