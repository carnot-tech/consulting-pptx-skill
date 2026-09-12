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

## Matrix Badge List (RP-MATRIX-BADGELIST-01, Library v0.2) → `matrix_2x2` (`matrixBadgeList` shape)

Independently defined for this project — see
`pipeline/reference-patterns/golden-fixtures-v0.2/RP-MATRIX-BADGELIST-01.jpg`. A 3rd
`matrix_2x2` quadrant shape alongside RP-MATRIX-HERO-01's title/body/evidence and
RP-MATRIX-PLAIN-01's single-sentence label — **neither of those two is reused here**. Where
Hero/Plain describe ONE narrative per quadrant, Badge List triages a SET of individually-named
issues: each quadrant carries a priority number + label + optional 1-2 line summary, then a
stack of individually-iconed named badge items. Unlike every other Library v0.2 pattern so far,
Matrix is always exactly a 2x2 grid — there is no variable item-count axis the way KPI/
Decision/Takeaways have; all 4 quadrants (`top-left`/`top-right`/`bottom-left`/`bottom-right`,
the same 4 canonical position strings Hero/Plain already use) are always present, and density
varies per-quadrant (1-3+ items) instead.

- **All 4 quadrant groups**, groupId literally one of `top-left`/`top-right`/`bottom-left`/
  `bottom-right` (same convention as RP-MATRIX-HERO-01/PLAIN-01 — this is what lets a
  Badge-List-authored slide simply fail those 2 patterns' own structural checks harmlessly
  rather than needing a disqualifier), each with:
  - `"number"` — the quadrant's own roman-numeral priority label (e.g. "I"). Authored
    directly, like every other pattern's `number` field — not derived from grid position (the
    reference image's own numbering isn't reading-order: I is top-right, not top-left).
  - `"title"` — the quadrant's own headline (e.g. "最優先"). Becomes `quadrant.label` in the
    output SlideSpec.
  - Optional `"body"` — a 1-2 line summary shown beside the header (e.g. "緊急度・影響度とも
    に高く早急な意思決定が必要"). Becomes `quadrant.summary`.
  - **>=1 item sub-group**, groupId prefix `${position}-item-` (e.g. `"top-right-item-1"`,
    `"top-right-item-2"`) — same nesting idiom as RP-KEY-TAKEAWAYS-01's `insightPanel-*`
    prefix, just parameterized per-quadrant instead of a single global reserved name. Each
    item group has:
    - `"title"` — the badge's own text (e.g. "経営陣退任").
    - Optional `"icon"` — one of `person`/`people`/`bar-chart`/`laptop`/`tag`/`cart`/`truck` (a
      closed vocabulary — note this is a DIFFERENT subset from RP-DECISION-ASK-01's and
      RP-KEY-TAKEAWAYS-01's own icon sets; pick whichever concept fits the issue named).
  - Optional `element.emphasis=true` on the quadrant's own `"title"` element — highlights the
    WHOLE quadrant (navy header, tinted body, bordered card), same convention as
    RP-MATRIX-HERO-01/PLAIN-01's own "0 or 1 quadrant may carry emphasis" discipline. This is
    independent of an item's own `emphasis` flag (below) — quadrant-level emphasis is what
    drives the reference image's visual, item-level emphasis is a minor per-badge accent the
    reference image doesn't itself exercise.
  - Optional `element.emphasis=true` on an item's own `"title"` element — a per-item accent,
    independent of quadrant-level emphasis.
- **Required `axisX` and `axisY` groups**, each with a `"title"` element (the axis name, e.g.
  "事業影響度") and **exactly 2 `"label"` elements, order preserved — first authored is the
  LOW endpoint, second is the HIGH endpoint** (e.g. "低" then "高"). This is a richer axis
  representation than RP-MATRIX-HERO-01/PLAIN-01's own ungrouped `chartTicks` pair (which only
  carries one string per axis, no low/high split) — Badge List's reference image always shows
  explicit low/high endpoint labels, so it needed somewhere to put them; never pack "label|low|
  high" into one free-text string.
- **Required insights panel**: a group literally named `"insights"` with >=1 `"bullets"`
  elements (order preserved — numbered 1/2/3... by array position, no separate authored
  number) and an optional `"title"` element (panel heading, defaults to "示唆"). This reuses
  `kpi_dashboard`'s own `insights` field/shape VERBATIM (same `slide.insights = {title?,
  items:[string]}`, same renderer) — not a new structure, since it's the same semantic panel.
  Mandatory, not optional, same discipline as RP-KEY-TAKEAWAYS-01's insightPanel/soWhat: a
  Badge List slide with no insights panel isn't a smaller variant, it's missing the "so what do
  we do about this" layer the pattern exists to provide.
- No relationship type is required — like every other Library v0.2 pattern's repeatable
  children, quadrant items and insight items are plain siblings; order comes from authoring
  order (the quadrant POSITIONS themselves, unlike items, are not order-dependent — they're
  identified by their reserved groupId, not by array position).

**Do not use when**: a quadrant's content is a single narrative sentence or a title+body+
evidence block, not a list of individually-nameable items (→ RP-MATRIX-HERO-01 or
RP-MATRIX-PLAIN-01 instead), only 1 axis is authored or both axis words describe the same
dimension (→ cards), or the items don't actually need 2-axis triage at all, just a flat
categorized list (→ plain cards or a table).

## 100-Day Workstream Plan (RP-100DAY-WORKSTREAM-01, Library v0.2) → `workstream_100day` (`workstream100day` shape)

Independently defined for this project — see
`pipeline/reference-patterns/golden-fixtures-v0.2/RP-100DAY-WORKSTREAM-01.jpg` and the full
Visual Contract at `pipeline/reference-patterns/visual-contracts/RP-100DAY-WORKSTREAM-01.md`
(the first pattern implemented under `references/reference-pattern-implementation-policy.md`'s
mandatory Visual Contract process). This is a **swimlane x phase 2D matrix, not a timeline** —
an independent workstream rail x a fixed 3-phase band x a genuine 2D activity grid x a
cross-cutting milestone band. The existing `roadmap` template's `contains`/`sequence` timeline
shape is NOT reused or extended here; a 2D grid needs a different Semantic Contract, not a
richer 1D one.

- **3-5 workstream groups**, groupId prefix `"workstream-"` (the groupId itself becomes the
  `id` in the output SlideSpec — no separate id element needed), each with:
  - `"title"` — the workstream's own name (e.g. "営業").
  - `"icon"` — **required, not optional** (Component Anatomy's own rail-card definition
    requires an icon; a card with no icon is a degraded card). Closed vocabulary: `people` /
    `coins` / `person` / `bar-chart` — reused as-is from other patterns' existing icon sets,
    deliberately not expanded, since these 4 already cover this pattern's own workstream
    concepts (commercial/people, cost/procurement, HR/individual, management/metrics).
  - Optional `"subtitle"` — a short one-line role description (e.g. "収益成長の加速").
- **Exactly 3 phase groups** (fixed for v1, not a variable count — see Adaptive Rules below),
  groupId prefix `"phase-"`, each with:
  - `"title"` — the phase label (e.g. "Day0-30").
  - `"order"` — **required**, one of `1`/`2`/`3`, each used exactly once. Authored directly,
    like every other "number"/"order" field in this library — never inferred.
  - Optional `"subtitle"` — a short phase description (e.g. "基盤整備・計画策定").
- **Exactly (workstream count x 3) activity groups** — one per workstream x phase
  intersection, 100% coverage, no gaps or duplicates — groupId prefix `"activity-"`, each with:
  - `"title"` — the cell's own action headline.
  - `"icon"` — **required, not optional** (Reference-defining Feature #4 is icon + title +
    bullets TOGETHER — an activity cell missing any of the three is degraded, not adaptive).
    Closed vocabulary: `target` / `search` / `org-chart` / `gear` / `trending-up` / `handshake`
    / `document` / `bar-chart` — a DIFFERENT set from `workstreams[].icon` (this pattern
    deliberately keeps 2 separate icon vocabularies at 2 different structural levels, the same
    way RP-DECISION-ASK-01's and RP-KEY-TAKEAWAYS-01's icon sets don't overlap either).
  - `"bullets"` elements, >=1, order preserved — the supporting detail under the headline.
  - `"workstreamRef"` and `"phaseRef"` — **required** cross-reference elements naming the
    groupId of the workstream/phase this activity belongs to. This is deliberately NOT encoded
    by parsing the activity's own groupId string (e.g. splitting `"activity-sales-1"`) — an
    author's workstream or phase id could itself contain a `-`, which string-parsing would
    silently mis-split. Explicit reference elements are unambiguous regardless of what the
    referenced ids look like.
- **Exactly 3 milestone groups** (fixed for v1, one per phase — not `>=1`), groupId prefix
  `"milestone-"`, each with:
  - `"label"` — the short tag (e.g. "Day30").
  - `"title"` — the milestone's own headline.
  - `"position"` — **required**, one of `1`/`2`/`3`, each used exactly once.
  - `"phaseRef"` — **required**, naming which phase group this milestone sits under. Each of
    the 3 authored phases must be referenced by exactly one milestone (a strict 1:1 mapping,
    not an independently-sized list) — the milestone band's markers align under their own
    phase column, so a milestone with no phase, or a phase with no milestone, would silently
    break that alignment.
  - Optional `"body"` — a short supporting sentence.
- No `emphasis` field anywhere for this pattern — its reference image doesn't single out one
  workstream/phase/cell as "the important one" the way RP-MATRIX-HERO-01/PLAIN-01 or
  RP-MATRIX-BADGELIST-01 do; the milestone band's 1/2/3 numbering is sequence, not emphasis.
  Don't author one speculatively.
- No relationship type is required — workstream/phase/activity/milestone groups are all
  identified by their reserved groupId PREFIX (same idiom as RP-KEY-TAKEAWAYS-01's
  `"insightPanel-*"`, just with 4 distinct prefixes instead of 1, since there's no small fixed
  set of literal position names to reuse here the way RP-MATRIX-BADGELIST-01 has exactly 4
  canonical quadrant positions).

**Adaptive Rules (deliberately conservative for v1)**: canonical is 4 workstreams x 3 phases —
the reference image's own composition. **3-5 workstreams are supported adaptive variants; phase
count is fixed at exactly 3, not variable.** 4+ phases and 6+ workstreams are explicitly out of
scope for v1 — phase count drives the whole grid's column structure and the phase band's own
chevron geometry, so making it variable multiplies the fidelity-maintenance burden well before
there's real authoring evidence 3 phases is ever insufficient. If that need materializes later,
it should be its own follow-up review, not something this first pass tries to future-proof for.

**Do not use when**: the content is genuinely a single-lane timeline (one sequence of phases/
milestones, no parallel workstreams) — use the existing `roadmap` template instead; there are
fewer than 3 or more than 5 workstreams; the plan doesn't actually need a fixed 3-phase
structure; or cells don't need bullets, just a single headline per workstream x phase (use a
plain table instead).

## Operating Model Cascade (RP-OPERATING-MODEL-01, Library v0.2) → `operating_model_cascade` (`operatingModelCascade` shape)

Independently defined for this project — see
`pipeline/reference-patterns/golden-fixtures-v0.2/RP-OPERATING-MODEL-01.jpg` and the full
Visual Contract at `pipeline/reference-patterns/visual-contracts/RP-OPERATING-MODEL-01.md`
(the second pattern implemented under
`references/reference-pattern-implementation-policy.md`'s mandatory Visual Contract process).
A **left-to-right cascade of INDEPENDENTLY-SIZED stage columns** — unlike
RP-100DAY-WORKSTREAM-01's uniform workstream×phase grid (every cell must exist), this pattern's
reference image itself shows a 3/3/4/3 card distribution across its 4 stages: "same shape per
stage, different content" is the wrong mental model here; "a chevron of N columns, each its
own small stack" is the right one. Confirmed at implementation time (a dedicated fit check, not
just an assumption) that none of this library's existing chevron/pillar templates
(`chevron_rail`, `chevron_steps`, `chevron_value_chain`, `pillars_foundation`) already support
stacked icon+title+body cards nested independently per segment, so this is a new template
rather than an extension of any of them.

**Output SlideSpec field names are `cascadeStages`/`keyMessageBand`, not `stages`/
`keyMessage`** — an earlier draft of this pattern's own Visual Contract used the latter names,
but both collided with unrelated, differently-shaped fields already used by other templates in
this schema (`stages` already belongs to an existing template requiring `label`+`heading`;
`keyMessage` already exists elsewhere as a plain string). The Visual Contract has since been
corrected to match; if you're reading this from an LLM-authoring context, use the names below,
not the pattern's own conceptual name.

- **3-5 stage groups**, groupId prefix `"stage-"` (order = authoring order, never re-ranked —
  the left-to-right sequence IS the pattern's own meaning: 01 customer segment → 02 value
  proposition → 03 execution capability → 04 governance), each with:
  - `"number"` — the stage's own display label (e.g. "01"). Authored directly, not derived
    from position, same discipline as every other "number" field in this library.
  - `"title"` — the stage's own headline (e.g. "顧客セグメント").
  - `"question"` — **required** — the header's own guiding question (e.g. "誰に価値を届ける
    か"). A header missing this loses the "what is this stage actually answering" framing the
    reference image treats as integral, not decorative.
  - **>=2 card sub-groups**, groupId prefix `${stageGroupId}-card-` (e.g.
    `"stage-segment-card-1"`, `"stage-segment-card-2"`) — the SAME nesting idiom
    RP-MATRIX-BADGELIST-01 uses for badge items nested under an author-chosen quadrant groupId
    (as opposed to RP-100DAY-WORKSTREAM-01's 4 globally-fixed prefixes — there is no small
    fixed set of literal stage names to reuse here, and cards nest under ONE specific stage
    rather than cross-referencing two axes). **Independently counted per stage (2-4) — NOT
    required to match other stages' counts.** Each card group has:
    - `"title"` — the card's own headline (e.g. "大口顧客").
    - `"body"` — the supporting 1-2 line description.
    - `"icon"` — **required** — closed vocabulary: `building` / `pin` / `people` / `diamond` /
      `truck` / `bar-chart` / `person` / `org-chart` / `gear` / `document` — a DIFFERENT set
      from every other pattern's own icon vocabulary in this library (e.g.
      RP-100DAY-WORKSTREAM-01's activity icons), picked per-pattern the same way every
      previous pattern has its own closed set.
- **A "keyMessage" reserved group** (becomes `keyMessageBand` in the output), with:
  - `"headline"` — **required** — the closing synthesis statement.
  - `"label"` — optional, defaults to "KEY MESSAGE".
  - `"bullets"` elements, 2-4, order preserved — the checklist items (plain strings; a fixed
    checkmark glyph, not a per-item icon choice, same discipline as RP-100DAY-WORKSTREAM-01's
    milestone numbered circles being the semantic cue rather than an icon).
  Mandatory, not optional — same discipline as every other Library v0.2 pattern's closing
  synthesis band (RP-KEY-TAKEAWAYS-01's insightPanel/soWhat, RP-MATRIX-BADGELIST-01's insights
  panel, RP-100DAY-WORKSTREAM-01's milestone band).
- **No `emphasis` field anywhere** — this pattern's reference image doesn't single out one
  stage or one card as "the important one"; the Key Message band's own visual distinction
  (dark iconWedge vs. pale cascade) is a pattern-level distinction, not a within-cascade
  emphasis flag.
- No relationship type is required — stages and cards are all identified by reserved groupId
  PREFIX, same idiom as every other Library v0.2 pattern's repeatable children.

**A real bug this pattern's implementation hit and fixed**: a card group's own groupId shares
the `"stage-"` prefix with its parent stage group (cards are named `${stageGroupId}-card-N`),
so naive `groupId.startsWith("stage-")` logic silently double-counts every card as an
additional stage. Both the Selector's structural check and the adapter must explicitly exclude
any groupId containing `"-card-"` when collecting stage groupIds. A regression test in
`test/unit.test.mjs` guards this specifically.

**Adaptive Rules**: canonical is 4 stages with an asymmetric card count per stage (3/3/4/3, the
reference image's own composition — per-stage card counts are NOT forced to match across
stages, in canonical or any adaptive variant). **3-5 stages are supported adaptive variants; 2-4
cards per stage, independently per stage.** Unlike RP-100DAY-WORKSTREAM-01's fixed-at-exactly-3
phase count, stage count here IS the adaptive axis — the "4層" framing is this specific deck's
own authored claim (like the numeric claim in any slide's own title), not a structural constant
the way RP-100DAY-WORKSTREAM-01's phase-per-milestone alignment was. At 5 stages, gaps between
columns and the connector's own width may shrink slightly to keep card content legible — what
must NOT change is the connector's PRESENCE between every adjacent pair of stages (exactly
stage count − 1 connectors), not its exact pixel width.

**Do not use when**: the stages don't actually have their own elaborating items — just one
sentence per stage (use `chevron_rail`/`chevron_steps` instead); there are fewer than 3 or more
than 5 stages, or any single stage needs fewer than 2 or more than 4 cards; the columns need to
align row-for-row across stages (a shared item count / cross-stage coverage requirement — this
pattern's whole point is independently-sized stages; use `chevron_value_chain`'s rails or
RP-100DAY-WORKSTREAM-01's grid instead); or there's no single closing headline + checklist
synthesis (use a plain card cascade instead).

## What NOT to do

- Don't author a pattern's `elements`/`relationships` first and decide the family afterward —
  decide the family (and therefore which pattern's contract to write against) from the Ghost
  Deck slide's `role`/`key_message` first, matching each pattern's `useWhen`/`doNotUseWhen` in
  `pipeline/reference-patterns/library.json`.
- Don't fabricate a second axis, a phase grouping, or a hierarchy root that the source content
  doesn't actually support just to satisfy the Selector — a `FAIL` result means this slide's
  real content doesn't fit this family; use a different template instead of forcing it.
