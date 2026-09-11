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
  - `"secondary"` (the delta/YoY line — plain `"+12%（前年同期比）"` / `"-6日（前年同期比）"`,
    never a `▲`/`▼` prefix: in Japanese financial/management materials `▲` conventionally
    means a NEGATIVE number regardless of context, so `▲ +12%` is self-contradictory, and an
    auto-picked ↑/↓ is worse — it silently asserts a direction is "good," which is backwards
    for a KPI like NWC回転日数 where a DECREASE is the improvement. Let the sign alone carry
    the meaning.), `"body"` (a short driver/context note shown at the card's bottom, below a
    divider).
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

## Comparison table (RP-COMPARISON-TABLE-01, Library v0.2) → `comparison_table` (`comparisonTable` shape)

Independently defined for this project — see
`pipeline/reference-patterns/golden-fixtures-v0.2/RP-COMPARISON-TABLE-01.jpg`. The existing
`comparison_table` template's flat shape (`headers`/`table`: fixed criterion+company+
competitor+implication columns, proven in the M&A investment-committee deck) is unchanged and
stays the right choice for a plain 自社 vs 他社 per-row narrative. This pattern is a second,
richer shape for N candidates rated against shared criteria.

- **Criteria**: a group literally named `"criteria"` containing ordered `"title"` elements —
  one per evaluation row. >=2 required.
- **2 to 5 candidate groups** (any groupId except the 3 reserved ones below), each:
  - `"title"` — the candidate's label. Mark `emphasis: true` on it to highlight that column
    as the leading option (at most 1 candidate should carry this).
  - `"value"` elements, exactly one per criterion, in the SAME order as the `criteria` group —
    the Nth value answers the Nth criterion. Each value's `value` string is
    `"<symbol>|<caption>"` (e.g. `"◎|中核戦略に合致"`) where symbol is one of `◎`/`○`/`△`/`×`
    — or just a bare caption with no `|` when no rating symbol applies.
- **Optional recommendation row**: a group literally named `"recommendation"` with one
  `"title"` element (the row's own label, e.g. "Recommendation（総合評価）"). Once authored,
  EVERY candidate group must also carry a `"recommendationValue"` element (same
  `"symbol|caption"` encoding) — this becomes a distinct, bolded bottom row in the table.
- **Optional summary panel**: a group literally named `"comparisonSummary"` beside the table —
  `"bullets"` elements (the numbered 総括 points), an optional `"title"` (panel heading,
  defaults to "総括"), and an optional `"body"` element (the 結論 conclusion sentence — only
  rendered as its own highlighted block if present) with an optional `"chartCaption"` element
  for the conclusion's own label (defaults to "結論").
- No relationship type is required — like KPI tiles, this grid is entirely positional (row
  order = `criteria`'s own array order; a candidate's Nth value answers the Nth criterion).

**Do not use when**: only 1 candidate exists, 6+ candidates are authored (→ a dense table is
more honest), cell content is raw comparable numbers rather than a qualitative rating (→ a
chart or plain data table), or the point is a per-criterion narrative read-out for exactly
自社 vs 他社 (→ the existing flat `table`/`headers` shape, still fully supported).

## Decision ask (RP-DECISION-ASK-01, Library v0.2) → `decision_page` (`decisionGroups` shape)

Independently defined for this project — see
`pipeline/reference-patterns/golden-fixtures-v0.2/RP-DECISION-ASK-01.jpg`. The existing
`decision_page` template's flat shape (a single `ask` + a plain numbered `decisions[]` list)
is unchanged and stays the right choice for one recommendation with simple follow-up items.
This pattern is a second shape for multiple parallel decision items, each with its own
number/context/icon/title/actions, put to a decision-making body in one sitting.

- **2 to 4 decision groups** (any groupId except the 2 reserved ones below), each:
  - `"number"` — the column's own label (e.g. "01"). Authored directly, not derived from
    position — a group's number is whatever the author writes, even though in practice it's
    almost always sequential.
  - `"title"` — the decisive action being asked for (e.g. "Day60組織案の承認").
  - `"bullets"` elements, >=1, order preserved — the concrete follow-up actions under that
    decision (rendered as a numbered list, "①②..." in the reference image).
  - Optional `"context"` — a 1-2 line framing sentence shown in the column's navy header band
    above the number.
  - Optional `"icon"` — one of `org-chart` / `bar-chart` / `people` (a closed vocabulary,
    shared with kpi_dashboard's icon set for `bar-chart`; pick whichever concept fits —
    organizational/structural decision → org-chart, metric/target decision → bar-chart,
    governance/committee decision → people).
- **Optional recommendation**: a group literally named `"recommendation"` with a `"title"`
  element (the tag label, defaults to "推奨") and a `"body"` element (the recommendation
  sentence) — rendered as a highlighted chevron bar below the columns.
- **Optional next steps**: a group literally named `"nextSteps"` containing ordered
  `"bullets"` elements (order preserved — this becomes a numbered 1→2→3 sequence beside the
  recommendation bar, or on its own if there's no recommendation).
- No relationship type is required — like KPI tiles and comparison candidates, decision
  columns are plain siblings; order comes from authoring order.

**Do not use when**: the slide is a plain conclusion recap with no decision being requested
(→ RP-KEY-TAKEAWAYS-01), the point is choosing between named options (→
RP-COMPARISON-TABLE-01), the point is a multi-week/multi-day execution timeline (→ the
roadmap/100-Day patterns), or the columns are explanatory rather than decision items with a
concrete ask (→ plain cards).

## Key takeaways (RP-KEY-TAKEAWAYS-01, Library v0.2) → `recommendation_pillars` (`keyTakeaways` shape)

Independently defined for this project — see
`pipeline/reference-patterns/golden-fixtures-v0.2/RP-KEY-TAKEAWAYS-01.jpg`. The existing
`recommendation_pillars` template's flat shape (a plain `sections[]` list of pillar cards) is
unchanged and stays the right choice for a simple set of parallel points with no synthesis
layer. This pattern is a second, richer shape: a fixed 3-part composition (takeaway columns +
an insight panel + a closing "So What" bar) for closing out an analysis with the conclusions a
reader must walk away with.

Unlike Decision Ask's optional recommendation/nextSteps bands, **the insight panel and the So
What bar are load-bearing parts of this pattern's own definition, not an optional add-on** —
both are required at every valid takeaway count (2, 3, or 4), not just the canonical 3-column
composition. A takeaways[] list with no insight panel or no So What is not a smaller variant of
this pattern; it degenerates into plain cards and should use the flat `sections[]` shape
instead. This is why the Selector's `TAKEAWAY_SHAPE_VALID` check and the schema's
conditional-required both treat `takeaways`/`insightPanel`/`soWhat` as all-or-nothing.

- **2 to 4 takeaway groups** (any groupId except the reserved ones below; **3 is the
  canonical/reference-faithful count** — 2 and 4 are supported adaptive variants), each:
  - `"number"` — the column's own label (e.g. "01"). Authored directly, not derived from
    position.
  - `"category"` — a short label for the header band (e.g. "市場", "収益", "実行").
  - `"headline"` — the takeaway's core statement, shown as bold body text below the icon.
  - `"body"` — the supporting text under the divider (rendered under a `"supportLabel"`
    heading, defaults to "サポートする示唆"). Structured separately from `headline` — do not
    merge the headline and its support text into one string.
  - Optional `"supportLabel"` — overrides the default "サポートする示唆" heading above `body`.
  - Optional `"icon"` — one of `bar-chart` / `coins` / `gear` (a closed vocabulary; note this
    is a *different* subset from Decision Ask's org-chart/bar-chart/people — pick whichever
    concept fits: market/metric takeaway → bar-chart, financial/profitability takeaway →
    coins, execution/operational takeaway → gear).
- **Required insight panel**: 1 or more groups with the `"insightPanel-"` groupId prefix (e.g.
  `"insightPanel-i1"`, `"insightPanel-i2"`), each with a `"number"`, a `"title"`, and a
  `"body"` element — order preserved from authoring order, not re-sorted by number. An
  optional `"title"` element on the reserved `"insightPanel"` group itself sets the panel's own
  heading (defaults to "示唆").
- **Required So What**: a group literally named `"soWhat"` with a `"body"` element (the closing
  synthesis sentence) and an optional `"title"` element (the tag label, defaults to "So What")
  — rendered as a navy chevron bar spanning the bottom of the slide.
- No relationship type is required — like KPI tiles, comparison candidates, and decision
  columns, takeaway columns and insight-panel items are plain siblings; order comes from
  authoring order.

**4-column density (soft warning, not a hard limit)**: the 4-column layout is this pattern's
narrowest column width. `check_content_structure.mjs` flags (as a warning, not an error) any
`headline` over 40 chars or `supportText` over 46 chars when `takeaways.length === 4` — those
thresholds are calibrated to the golden stress fixture's own longest strings (37 / 38 chars),
which is the accepted maximum density. The fix for a flagged slide is to drop to 3 columns or
split into two slides, not to let the renderer shrink text to fit.

**Do not use when**: the slide is a decision being put to the room, not a conclusion recap
already reached (→ RP-DECISION-ASK-01), the point is choosing between named options (→
RP-COMPARISON-TABLE-01), the point is a multi-week/multi-day execution timeline (→ the
roadmap/100-Day patterns), or there is no synthesis/insight layer at all — just parallel
explanatory points (→ the flat `sections[]` shape of this same template).

## What NOT to do

- Don't author a pattern's `elements`/`relationships` first and decide the family afterward —
  decide the family (and therefore which pattern's contract to write against) from the Ghost
  Deck slide's `role`/`key_message` first, matching each pattern's `useWhen`/`doNotUseWhen` in
  `pipeline/reference-patterns/library.json`.
- Don't fabricate a second axis, a phase grouping, or a hierarchy root that the source content
  doesn't actually support just to satisfy the Selector — a `FAIL` result means this slide's
  real content doesn't fit this family; use a different template instead of forcing it.
