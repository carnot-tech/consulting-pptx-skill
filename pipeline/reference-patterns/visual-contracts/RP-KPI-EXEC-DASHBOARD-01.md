# RP-KPI-EXEC-DASHBOARD-01 — Visual Contract

**BACKFILLED**, per explicit review during the Library v0.2 Integration Gate — written AFTER
implementation, documenting the current shipped state, not a pre-implementation design
document. This pattern was implemented before
`references/reference-pattern-implementation-policy.md` existed; its first pass visually
simplified the reference image (a plainer KPI tile row) and needed a follow-up "bring it back
in line with the reference" commit, the exact failure mode the policy now exists to prevent.
This backfill exists so the Library holds all 7 patterns in the same
Reference/Semantic/Visual/Adaptive/Acceptance format, not so this pattern gets re-implemented.

Source: `pipeline/reference-patterns/golden-fixtures-v0.2/RP-KPI-EXEC-DASHBOARD-01.jpg`.

## Canonical Composition

```
Title / subtitle
──────────────────────────────────────────────────────────────
[icon] 本日のポイント ▶ 収益性は改善基調、次の論点は運転資本の圧縮
──────────────────────────────────────────────────────────────
[navy header: icon│label│context]   x4 (one per KPI, equal width)
  big value + unit
  ▲/▼ delta (前年同期比)
  small bar sparkline
  note
──────────────────────────────────────────────────────────────
主要指標の推移                          │  [bulb] 示唆
  legend: bar1 / bar2 / line            │  1  insight
  grouped bar chart + line overlay      │  2  insight
  period labels (FY.. Q..)              │  3  insight
```

3 structural bands, top to bottom: **title/subtitle** → **key message band** (a chevron-tagged
headline, the same flag-shape idiom this project's later patterns reuse for their own bands) →
**KPI tile row** (3-5 tiles) → **support row** (trend chart + insights panel, side by side).

## Semantic Contract (as implemented)

Template `kpi_dashboard`. Top-level fields:

```
keyMessage   // plain string — becomes the chevron-tagged headline band
kpis[]       // 3-5 tiles
  label
  value
  unit?
  delta?
  icon?       // bar-chart / coins / pie / cycle
  context?
  note?
  spark?      // >=2 numbers, a mini bar sparkline
trendChart?
  unit?
  periods[]   // >=2
  bars[]      // 1-2 series, each {label, values[]}
  line?       // {label, unit?, values[]}
insights?
  title?      // defaults "示唆"
  items[]     // >=1 plain strings, auto-numbered by array position
```

`trendChart` and `insights` are each optional independently, but the CANONICAL composition
(matching the reference image) has both, side by side. `keyMessage` is a plain string
(distinct from RP-OPERATING-MODEL-01's later, richer `keyMessageBand` object — two different
patterns, two different needs, not a shared field).

## Visual Pattern Analysis

1. **Overall Composition** — title/subtitle, then a full-width key message band, then a row of
   3-5 equal-width KPI tiles, then a 2-column support row (trend chart left, insights right).
2. **Visual Hierarchy** — title → key message headline (large, high-contrast on navy) → KPI
   values (largest numerals on the slide) → deltas → tile context/notes → trend chart/insights
   (supporting detail tier).
3. **Component Anatomy** — each KPI tile: a navy header band (icon + label + context) over a
   white body (big value + unit, a colored triangle-delta, a small bar sparkline, a note line).
   The key message band is icon + label + chevron-shaped headline area, the same flag-shape
   family later reused for RP-DECISION-ASK-01's recommendation bar and RP-KEY-TAKEAWAYS-01's So
   What bar.
4. **Color Roles** — navy = tile headers + key message band (primary/spine); a green/teal
   accent marks a positive delta, a warning tone marks a negative one (the delta's OWN sign
   carries the meaning — no ▲/▼ direction glyph, since a glyph either restates or contradicts
   the sign, see `checkKpiDeltaDirectionGlyphs` in `check_content_structure.mjs`); pale
   background tint for the trend chart / insights panel containers.
5. **Geometry** — 3-5 equal-width tiles; the support row splits into a wider trend-chart column
   and a narrower insights column.
6. **Typography** — KPI values are the largest text in the tile row, bold; deltas and notes are
   smaller supporting tiers; the key message headline is large and bold, comparable to the
   slide's own title.
7. **Iconography** — each KPI tile's icon is a per-metric semantic cue (bar-chart = topline
   growth, coins = profitability/cash, pie = margin/composition, cycle = a
   turnover/efficiency metric) — a small, closed, reusable vocabulary later patterns in this
   library also draw from (`bar-chart`/`coins` in particular).
8. **Emphasis Logic** — no single KPI tile is highlighted over another; all tiles carry equal
   visual weight. The key message band is the one component with a distinct (navy, chevron)
   treatment, a pattern-level distinction (band vs. tile row), not a within-row emphasis flag.
9. **Adaptive Rules** — canonical is 4 KPI tiles with the full support row (both trend chart
   and insights). 3-5 tiles are supported; `trendChart`/`insights` are each independently
   optional, but omitting both loses the reference's own "so what does this data mean"
   framing.
10. **Reference-defining Features**:
    1. The chevron-tagged key message band as its own structural component, not a plain
       subtitle line.
    2. Each KPI tile's navy header (icon + label + context), not just a bare number.
    3. The delta's sign-only convention (no ▲/▼ glyph) — a deliberate correctness rule, not a
       stylistic choice, guarded by its own content-structure check.
    4. The per-tile sparkline as a compact trend cue distinct from the larger combo chart below.
    5. The combo bar+line trend chart and the numbered insights panel together as one support
       row — the closing "why does this matter" layer.

## Acceptance Criteria

The standard Acceptance Gate from `references/reference-pattern-implementation-policy.md`,
already satisfied by this pattern's existing implementation and test coverage: Semantic
fidelity, Reference composition fidelity (re-confirmed via this backfill's own comparison
against the reference image), Visual hierarchy fidelity, Emphasis logic fidelity (no
`emphasis` field — none needed), Adaptive layout quality (3/4/5-KPI fixtures), Overflow/
clipping (0 findings in the existing `kpi_dashboard end to end` test), HTML/PPTX parity, PPTX
OOXML audit, Existing corpus regression — see `test/unit.test.mjs`'s own `kpi_dashboard end to
end` test and the Library v0.2 Integration Gate's Selector Collision Matrix (this pattern's own
fixture PASSes only the `kpi-dashboard|standard` intent, confirmed alongside the other 6
patterns).
