# Pre-family Semantic IR authoring guide (matrix / hierarchy / roadmap-phaseband / kpi-dashboard)

This is the prompt/reference for the new pipeline stage that sits between Ghost Deck and
Slide IR: **Pattern Selection**. For one Ghost Deck slide whose `role`/`key_message`/
`evidence_needed` call for a prioritization, an ownership structure, or a phased plan, author
the slide's content directly into this IR's `elements[]`/`relationships[]` shape — not as
free prose to be classified later. This is "Path B": you *declare* structure (these two
things are being compared, this quadrant is high on both axes) because you already know it
when you write it; nothing downstream re-infers it from wording.

Once authored, run `node scripts/reference_pattern_selector.mjs` (via
`pipeline/scripts/reference_pattern_selector.mjs`'s `selectPattern(intent, preFamilyIR)`) to
verify the content actually qualifies for the intended pattern — this is a deterministic
eligibility check, not a suggestion. If it returns `eligibility: "FAIL"`, fix the authored
elements/relationships (a rejected candidate's `reason` says exactly what's missing) before
calling `preFamilyIrToSlideSpec()` to produce the Slide IR.

## Shape (every family)

```json
{
  "elements": [{ "id": "...", "semanticRole": "...", "groupId": "... or null", "value": "...", "emphasis": false }],
  "relationships": [{ "type": "...", "from": {"kind":"element|group","id":"..."}, "to": {"kind":"element|group","id":"..."}, "attributes": {}, "origin": "authored", "confidence": null, "sourceIds": [] }]
}
```

`origin` is always `"authored"` and `confidence` always `null` here — you are the author, not
an inference pass. `attributes` on a relationship only needs to exist (any value) to satisfy
eligibility; the adapters below don't read its contents.

## Matrix (RP-MATRIX-HERO-01 / RP-MATRIX-PLAIN-01) → `matrix_2x2` (`quadrants` shape)

- Exactly 2 elements with `semanticRole: "chartTicks"`, `groupId: null` — the **first**
  authored is the Y axis (vertical), the **second** is the X axis (horizontal). `value` is
  the human-readable axis name (e.g. "対応緊急度").
- Each populated quadrant is its own group. `groupId` must be literally one of
  `"top-left"` / `"top-right"` / `"bottom-left"` / `"bottom-right"` — not an arbitrary id.
  Populate at least 3 of the 4.
- Per-quadrant element roles: `"title"` + `"body"` (+ optional `"secondary"` for a short
  evidence line) for a **rich** quadrant (→ RP-MATRIX-HERO-01), or just `"label"` alone for a
  **plain**, single-sentence quadrant (→ RP-MATRIX-PLAIN-01). Don't mix both styles across
  quadrants on the same slide — the Selector checks quadrant richness per-group
  (`MATRIX_HERO_SHAPE`: every populated quadrant has >=3 elements; `MATRIX_PLAIN_SHAPE`: every
  populated quadrant has <3), so a mixed slide will fail both.
- For each quadrant group, add 2 `axis_membership` relationships (`from`: the quadrant group,
  `to`: each axis element) — this is what the Selector actually checks; `attributes.position`
  is not parsed for geometry (the `groupId` name already says the corner), it just needs to be
  a non-empty object, e.g. `{"axisRole":"urgency","position":"high"}`.
- At most 1 quadrant may carry `"emphasis": true` on one of its elements — only when the
  source content itself marks it important, never inferred from which quadrant "sounds" most
  urgent.

## Hierarchy (RP-HIERARCHY-WORKSTREAM-01) → `issue_tree` (`tree` shape)

- One root element: `semanticRole: "title"`, `groupId: null`.
- >=2 children, each its own group with a `"title"` element (the child's name).
- `contains` relationships from the root **element** to each child **group**.
- Renderer note: `issue_tree` only displays each branch's `title` today — an authored
  `"body"`/`"bullets"` element is deliberately dropped by the adapter rather than silently
  lost in rendering, so don't rely on it being shown yet.
- No emphasis mechanism exists for this family — don't author `emphasis: true` here.

## Roadmap-phaseband (RP-PMI-ROADMAP-01) → `roadmap` (`phases` shape)

- Each phase is its own group with a `"title"` element (+ optional `"subtitle"`).
- Each milestone is its own group with a `"title"` element (+ optional `"date"`), `contains`-
  linked from its phase group.
- Order phases (and, within a phase, its milestones) with `sequence` relationships between
  the group ids — the adapter topologically sorts by these edges; without them it falls back
  to authoring order, so add them when order matters (it almost always does for a roadmap).
- Exactly one milestone across the whole slide should carry `"emphasis": true` (the Selector
  requires at least one — `PMI_HAS_EMPHASIS_IN_SOME_GROUP`).
- Optional: a slide-level closing band — a group literally named `"outcomes"` containing
  `"bullets"`-role elements. Reserved id; don't use `"outcomes"` for a real phase.

## KPI dashboard (RP-KPI-EXEC-DASHBOARD-01, Library v0.2) → `kpi_dashboard` (`kpiDashboard` shape)

Unlike matrix/hierarchy/roadmap (ported from an external, holdout-validated project), this
pattern is independently defined for this project — see
`pipeline/reference-patterns/golden-fixtures-v0.2/RP-KPI-EXEC-DASHBOARD-01.jpg`, and matches
its 2-row dashboard composition (key message band / icon+value+delta+sparkline KPI cards /
trend chart + insights panel), not just its semantic content.

- **Key message band** (optional): a top-level element with `semanticRole="headline"`,
  `groupId=null` — a single-sentence executive summary shown as a highlighted bar above the
  KPI row, distinct from the slide's own `title`.
- **3 to 5 KPI groups**, each its own group (any groupId except the 2 reserved ones below).
  KPI tile order = the order groups first appear in `elements[]` — no relationship needed
  between them, they're plain siblings. Per-KPI element roles:
  - `"title"` (the label) + `"value"` (the number, e.g. "128") — both required.
  - `"chartCaption"` (unit, e.g. "億円" — kept separate from `value` so it renders as a
    smaller suffix, never concatenated into the number itself).
  - `"secondary"` (the delta/YoY line), `"body"` (a short driver/context note shown at the
    card's bottom, below a divider).
  - `"context"` (a one-line subtitle under the label, e.g. "トップラインの持続的な成長").
  - `"icon"` — one of `bar-chart` / `coins` / `pie` / `cycle` (a closed vocabulary; pick
    whichever concept fits the KPI — revenue-shaped -> bar-chart, profit/cash -> coins,
    ratio/margin -> pie, turnover/cycle-time -> cycle).
  - `"spark"` — a short per-KPI history as ONE element whose `value` is a comma-separated
    number list (e.g. `"85,83,88,95,99,104,110,116"`), rendered as a small sparkline under
    the delta. Needs >=2 numbers to render; omit entirely rather than authoring a 1-point
    "history".
- **Optional closing insights band**: a group literally named `"insights"` containing
  `"bullets"`-role elements (one per insight line) and an optional `"title"` element for the
  panel heading (defaults to "示唆" if absent). Rendered as its own bordered panel, not a bare
  list.
- **Optional trend chart**: a group literally named `"trendChart"`, combining up to 2 bar
  series (left/shared scale) and 1 optional line series (its OWN scale — never share an axis
  between a real quantity and a rate/percentage). On the `trendChart` group itself:
  - `"chartCaption"` — the chart's overall unit label (e.g. "億円 ／ ％").
  - `"title"` — bar-series-1's label (required if trendChart is authored at all, e.g.
    "売上高（億円）").
  - `"secondary"` — bar-series-2's label (optional; omit entirely for a single-bar-series
    chart).
  - `"lineLabel"` / `"lineUnit"` — the line series' own label/unit (optional; omit both to
    skip the line).
  Each data point is its OWN sub-group named `"trendChart-p1"`, `"trendChart-p2"`, etc.
  (never elements directly in the `trendChart` group), `contains`-linked from `trendChart`,
  ordered via `sequence` relationships between the point groups (same idiom as roadmap's
  phase/milestone structure, reused deliberately). Each point group carries:
  - `"title"` — the period label (e.g. "FY2023 Q1"), required.
  - `"value"` — bar-series-1's value at this point, required.
  - `"value2"` — bar-series-2's value at this point, required IFF `trendChart.secondary` was
    authored (must appear on every point once the group commits to 2 bars).
  - `"lineValue"` — the line series' value at this point, required IFF `trendChart.lineLabel`
    was authored.
- No emphasis mechanism for this family — don't author `emphasis: true` on KPI elements.
- Eligibility is purely a count check (`KPI_COUNT_IN_RANGE`, 3-5 groups with both title+value
  present) — no relationship type is required at all, unlike every other family so far. None
  of keyMessage/icon/context/spark/insights/trendChart affect eligibility; they're pure
  richness on top of an already-eligible KPI set.

**Do not use when**: only 1-2 KPIs are authored (defer to a hero-KPI-shaped template instead —
this pattern will FAIL, not force itself), 6+ KPIs (a dense dashboard/table is more honest),
explanatory prose is the real content and numbers are incidental (→ cards), the point is a
multi-period time-series comparison in its own right rather than a snapshot (→ a chart
template), or the point is comparing named options against each other (→
RP-COMPARISON-TABLE-01).

## What NOT to do

- Don't author a pattern's `elements`/`relationships` first and decide the family afterward —
  decide the family (and therefore which pattern's contract to write against) from the Ghost
  Deck slide's `role`/`key_message` first, matching each pattern's `useWhen`/`doNotUseWhen` in
  `pipeline/reference-patterns/library.json`.
- Don't fabricate a second axis, a phase grouping, or a hierarchy root that the source content
  doesn't actually support just to satisfy the Selector — a `FAIL` result means this slide's
  real content doesn't fit this family; use a different template instead of forcing it.
