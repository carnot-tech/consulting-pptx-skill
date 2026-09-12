# RP-100DAY-WORKSTREAM-01 — Visual Contract

Written before implementation, per `references/reference-pattern-implementation-policy.md`.
Source: `pipeline/reference-patterns/golden-fixtures-v0.2/RP-100DAY-WORKSTREAM-01.jpg`. Chosen
as the first pattern to go through the mandatory Visual Contract process precisely because it
has the most compositional surface area of any pattern so far — a 2D swimlane×phase grid, not
a list — and is therefore the pattern most at risk of the "semantically correct, visually
flattened" failure this policy exists to prevent.

This is **not a timeline** despite the "100-Day Plan" name. It is a **swimlane × phase
matrix**: 4 independent workstream rows crossed with 3 time-phase columns, each intersection
holding its own action card, plus a milestone rail that is a 5th, separate structural band
(not one more grid row). Treating it as a roadmap/timeline and routing it through
RP-PMI-ROADMAP-01's existing `contains`/`sequence` shape would collapse exactly the structure
that makes this pattern recognizable — hence a new Semantic Contract, not an extension of the
existing roadmap pattern.

## Canonical Composition

```
Title / subtitle
────────────────────────────────────────────────────
ワークストリーム │        Day0-30   ▶  Day31-60  ▶  Day61-100
                 │        phase        phase         phase
─────────────────┼──────────────────────────────────────────
[icon] 営業      │ [icon] cell      [icon] cell    [icon] cell
       収益成長…  │   action title     action title   action title
                 │   ▪ bullet         ▪ bullet        ▪ bullet
                 │   ▪ bullet         ▪ bullet        ▪ bullet
─────────────────┼──────────────────────────────────────────
[icon] 調達      │        ...                same shape...
─────────────────┼──────────────────────────────────────────
[icon] 人事      │        ...                same shape...
─────────────────┼──────────────────────────────────────────
[icon] 経営管理  │        ...                same shape...
──────────────────────────────────────────────────────────
主要マイルストーン │  ①──Day30────────②──Day60────────③──Day100──▶
                 │     title              title            title
                 │     body               body             body
```

5 structural bands, top to bottom: **title/subtitle** → **phase band** (spans only the grid's
own width, not the workstream rail's) → **workstream rail × grid** (the body, occupying most
of the slide) → **milestone rail** (a full-width band beneath the grid, structurally
independent of it — not a 5th workstream row).

## Visual Pattern Analysis

### 1. Overall Composition

- Body composition uses a 2-column split within the slide's content margins (the reference
  image keeps normal left/right margins — this is not a full-bleed, edge-to-edge layout): a
  narrow **workstream rail** on the left (icon + title + subtitle per workstream, stacked
  vertically, one per row) and a wide **grid** to its right (4 rows × 3 columns of activity
  cells). The rail and the grid rows are height-locked to each other row-by-row — this is what
  makes it read as ONE grid, not a label column beside an unrelated table.
- A **phase band** sits above the grid ONLY (not above the rail) — its left edge aligns with
  the grid's left edge, not the slide's. The rail's own header ("ワークストリーム") sits to the
  band's left, vertically aligned with the band, filling what would otherwise be a gap.
- A **milestone rail** spans the FULL width (rail width + grid width combined) below the grid,
  visually unifying the whole composition at the bottom the way a table footer would.
- No side panel, no separate insight/So-What band elsewhere on the slide — the milestone rail
  is this pattern's synthesis band, playing the role a right-side insight panel plays in other
  patterns.

### 2. Visual Hierarchy

1. Title (the plan's own headline claim) — largest, boldest, top.
2. Subtitle (one supporting sentence) — smaller, directly under the title.
3. Phase band labels (Day0-30 etc.) — large bold, second-most-prominent text on the slide;
   these anchor the reader's sense of "where in time am I" before anything else in the grid.
4. Workstream titles (営業/調達/人事/経営管理) — bold white-on-navy, prominent because of
   color contrast (navy fill) rather than raw font size.
5. Per-cell action titles — bold, navy, the actual content payload of each cell.
6. Per-cell bullets — regular weight, smaller, supporting detail.
7. Milestone titles/bodies — bold title + regular supporting sentence, same weight
   relationship as the cell content above it.

Reading order: title → phase band (left to right, establishing the 3 time windows) → down the
workstream rail (top to bottom, establishing the 4 lanes) → across each row's 3 cells → down to
the milestone rail as the closing synthesis. This is a genuinely 2-dimensional read (row first
via the rail, then column via the phase band), unlike every other pattern in this library so
far, which reads in one dominant direction.

### 3. Component Anatomy

- **Workstream rail card** (one per workstream, stacked): a filled navy rounded-rect block,
  full row height, containing: an icon inside a lighter-tint circle badge (top-left), a bold
  white title next to/below the icon, and a smaller, lighter-weight subtitle line beneath the
  title (e.g. "収益成長の加速" under "営業"). Required: icon, title. Optional: subtitle.
- **Phase band segment** (one per phase): a chevron-shaped band (pointed right, segments
  connect edge-to-edge into one continuous ribbon across all phases) containing a bold phase
  label (e.g. "Day0-30") and a smaller subtitle beneath it (e.g. "基盤整備・計画策定").
  Required: label. Optional: subtitle.
- **Activity cell** (one per workstream×phase intersection): an icon in a pale circle badge
  (top-left of the cell), a bold action-title headline beside/below it, and 2 (occasionally
  more) supporting bullets beneath, each with a small square bullet marker. Required: title,
  >=1 bullet. Optional: icon.
- **Milestone rail item** (one per milestone, evenly spaced under its phase column): a filled
  navy numbered circle badge (1/2/3), a bold "DayN" label beside it, a bold milestone title
  beneath that, and a smaller regular-weight supporting sentence beneath the title. A thin
  horizontal connector line runs through all the numbered badges left to right, ending in a
  small arrowhead past the last milestone. Required: number, label, title. Optional: body.

### 4. Color Roles

- **Primary/dark** (navy in the reference): the workstream rail cards' fill — this is the
  pattern's "structural spine" color, marking the row-identity axis.
- **Accent/mid-tone** (medium blue): phase band fill, activity-cell icon badges, milestone
  numbered badges — the "this is time-axis or wayfinding" color family, and the connecting
  thread across the phase band, cell icons, and the milestone rail (all 3 read as "the same
  visual language" via this shared accent, even though they're 3 different components).
- **Pale background tint**: activity cell backgrounds — very light, mostly there to separate
  columns/rows via subtle banding rather than to carry meaning on its own.
- **Emphasis**: this pattern's reference image does NOT single out one workstream or one phase
  as "the important one" the way Matrix Badge List highlights one quadrant — every row and
  every column carries equal visual weight. The only emphasis-like signal is the milestone
  rail's own numbered sequence, which is inherently ordered (1→2→3) rather than "important vs
  not."
- When swapped to this project's own House Style (brown/tan), the ROLE mapping to preserve is:
  workstream rail = primary/dark; phase band + cell icon badges + milestone badges = one shared
  accent tone; cell backgrounds = a faint neutral tint; no component gets a "highlighted zone"
  treatment.

### 5. Geometry

- 2 columns overall: workstream rail (narrow, roughly 15-18% of the grid area's width) + grid
  (the remaining width, split evenly into 3 phase columns).
- 4 grid rows, each height-matched to its own rail card.
- Cell padding is generous relative to this library's other dense patterns (KPI tiles,
  comparison cells) — each cell holds a headline + 2 bullets comfortably without crowding,
  which is part of why this pattern reads as "roomy" rather than "packed."
- Column boundaries are thin hairline dividers; row boundaries are implied by the alternating
  cell tint and the rail cards' own edges, not a heavy rule.
- The phase band's chevron segments connect via a pointed edge (like a wide, shallow arrow),
  the same visual device this project already uses for its chevron/homePlate shapes elsewhere
  (RP-DECISION-ASK-01's recommendation bar, RP-KEY-TAKEAWAYS-01's So What bar) — reuse that
  established technique rather than inventing a new shape language.
- The milestone rail is a single band spanning the FULL composition width (rail width + grid
  width), with its 3 markers positioned to align under their own phase column, not evenly
  spaced across the full band irrespective of the grid above.

### 6. Typography

- Title: largest text on the slide, bold.
- Phase labels ("Day0-30"): second-largest, bold — comparable in visual weight to the title's
  own supporting subtitle, deliberately prominent since they anchor the whole grid's time axis.
- Workstream titles: bold, mid-size, white-on-navy.
- Cell action titles: bold, same size family as workstream subtitles — the actual content, so
  it needs to be readable at a glance across 12 cells without competing with the phase band.
- Bullets, workstream subtitles, phase subtitles, milestone bodies: all regular weight, smaller
  — the "supporting detail" tier.
- Milestone titles: bold, similar weight to cell action titles (this is the pattern's closing
  synthesis, so it shouldn't read as an afterthought).
- Each cell is built to hold ONE headline (short, single line preferred) + 2 short bullets —
  authoring content longer than that risks the exact "packed/flattened" failure this policy
  exists to prevent; a future density-warning check (matching RP-KEY-TAKEAWAYS-01's 4-column
  precedent) may be worth adding once real authoring experience shows where the ceiling is.

### 7. Iconography

- **Workstream icons** are role/domain cues (people = sales/commercial, coins = procurement/
  cost, a single person = HR/people, a chart glyph = management/governance) — 4 of these
  concepts already exist in this project's closed `PATTERN_ICONS` vocabulary (`people`,
  `coins`, `person`, `bar-chart`), which is a strong signal this pattern's workstream-level
  icon set should reuse them rather than inventing near-duplicates.
- **Activity-cell icons** are a DIFFERENT, per-action semantic cue (target/priority-setting,
  magnifying-glass/analysis, org-chart/structure, gear/governance-setup, trending-chart/
  monitoring, handshake/negotiation, document/policy) — this is a distinct closed vocabulary
  from the workstream-level one, the same way this library already keeps per-pattern icon sets
  separate (Decision Ask's org-chart/bar-chart/people vs. Key Takeaways' bar-chart/coins/gear
  vs. Matrix Badge List's person/people/bar-chart/laptop/tag/cart/truck). Some of these
  concepts (org-chart, gear) already exist; target/magnifying-glass/handshake/document/
  trending-chart are new and should be added as this pattern's own closed set during
  implementation, sized to what real authoring actually needs rather than pre-building every
  glyph visible in the reference image speculatively.
- **Milestone markers** use a plain numbered circle, not an icon — the number itself IS the
  semantic cue (sequence position), consistent with how this library already treats "number"
  fields elsewhere (Decision Ask, Key Takeaways, Matrix Badge List all use an authored number
  badge, not an icon, for sequence/priority position).

### 8. Emphasis Logic

- No component in this pattern's reference image carries a Matrix-Badge-List-style "highlighted
  zone" treatment. There is no single "most important" workstream, phase, or cell.
- The one ordering/priority signal is the milestone rail's own 1→2→3 numbering — but this is
  sequence, not emphasis (all 3 milestones get identical visual treatment; only their number
  and position differ).
- Implication for the Semantic Contract: this pattern does NOT need an `emphasis` boolean
  anywhere (unlike every other pattern in this library so far). Don't add one speculatively —
  per this policy's own principle, don't add elements the reference image doesn't call for.

### 9. Adaptive Rules

- **Canonical**: exactly 4 workstreams × exactly 3 phases — the reference image's own
  composition, fixed grid, 12 activity cells, 3 milestones.
- **Supported adaptive range (v1)**: 3-5 workstreams × the SAME 3 phases. Workstream count may
  vary; phase count does not. This is a deliberately conservative range per explicit review
  guidance — phase count is what the whole grid's column structure (and the phase band's own
  chevron geometry) is built around, so making it variable multiplies the fidelity-maintenance
  burden long before there's real authoring evidence 3 phases is ever insufficient.
- **Not yet supported**: 4+ phases, 6+ workstreams, a variable number of milestones tied to a
  variable phase count. If a future need for more than 3 phases materializes, that should be
  its own follow-up review, not something the first implementation pass tries to future-proof
  for speculatively.
- What must NEVER change between canonical and adaptive variants: the 5 Reference-defining
  Features below, the phase band's chevron shape, the workstream rail's navy-card treatment,
  the milestone rail's full-width span and left-to-right ordering.
- What MAY change: workstream count (3-5), the exact bullet count per cell (>=1), whether a
  milestone carries a body sentence.

### 10. Reference-defining Features

These 5 must all be present simultaneously — losing any one of them makes this a different,
lesser pattern (a plain roadmap, a plain card grid, a plain table), not an adaptive variant of
this one:

1. An independent, visually distinct **workstream rail** on the left (not folded into the grid
   as an ordinary first column — it has its own navy-card treatment and icon+title+subtitle
   anatomy the grid cells don't share).
2. A **phase band** across the top, spanning the grid's width only, in a chevron/arrow shape
   (not a plain row of column headers).
3. A genuine **workstream × phase 2D grid** — 12 independently-authored cells, not a
   1-dimensional list rendered to look like a grid.
4. Each **cell's icon + action title + supporting bullets anatomy** — a cell that's just a
   headline with no bullets, or bullets with no icon, is a degraded cell, not a valid one.
5. A **cross-cutting milestone rail** at the bottom, spanning the full composition width,
   distinct from and below the grid (not a 5th workstream row, not a sidebar).

## Semantic Contract

Independent from RP-PMI-ROADMAP-01 — that pattern's `contains`/`sequence` timeline shape is the
wrong fit for a swimlane×phase matrix and should not be extended to cover this. New
`workstream_100day` (working name) SlideSpec shape:

```
workstreams[]
  id
  title
  subtitle?
  icon         // REQUIRED — Component Anatomy's own workstream rail card requires an icon;
               // a workstream card with no icon is a degraded card, not a valid one. Closed
               // vocabulary, reusing this library's existing people/coins/person/bar-chart
               // where the concept matches.
phases[]
  id
  title
  subtitle?
  order        // 1..3 in the canonical/supported range — phase columns are NOT reordered by
               // any inference; order is authored directly, same discipline as every other
               // "number"/"order" field in this library
activities[]
  workstreamId
  phaseId
  title
  bullets[]    // >=1
  icon         // REQUIRED — Reference-defining Feature #4 is icon + action title + supporting
               // bullets together; an activity cell with no icon is a degraded cell, not an
               // adaptive variant. A DIFFERENT closed vocabulary from workstreams[].icon (see
               // Iconography above).
milestones[]
  phaseId      // which phase column this milestone sits under
  position     // 1..3, authored directly (mirrors this library's "number" convention)
  label        // e.g. "Day30"
  title
  body?
```

- **Required**: all authored workstreams (3-5 supported; 4 canonical) present with a title and
  an icon; all 3 phases present with a title and an order; every workstream×phase combination
  has an activities[] entry (100% coverage — no empty cells) with a title, an icon, and >=1
  bullet; **exactly 3 milestones** (v1 — see below), each with a title.
- **Milestones are fixed at exactly 3 for v1**, matching the fixed 3-phase grid: `milestones.
  length === 3`, `position` is `1`/`2`/`3` each used exactly once, and each of the 3 authored
  phases is used as a milestone's `phaseId` exactly once (a 1:1 milestone-to-phase mapping, not
  an independent count). This is deliberately NOT `>=1` — the Visual Contract already fixes
  phase count at 3 and milestone markers at one-per-phase-column, so allowing a different
  milestone count would let authored content silently drift out of alignment with the grid
  above it. If real authoring evidence later shows a genuine need for a different milestone
  count (e.g. 2 milestones under 3 phases), that's a follow-up adaptive-rule review, not
  something v1 should pre-emptively allow for.
- **Optional**: workstream subtitle, phase subtitle, milestone body.
- **No `emphasis` field anywhere** — see Emphasis Logic above.
- The Selector's structural check needs to verify, at minimum: workstream count in the
  supported range (3-5 for v1), phase count exactly 3, every workstream/activity/phase carries
  its required icon, milestone count exactly 3 with a unique 1:1 phaseId mapping, and — the
  check unique to this pattern's 2D shape — that activities[] covers every workstream×phase
  pair with none missing and none duplicated (100% coverage, no cross-assignment errors).
- The exact `elements[]`/`relationships[]` Pre-family IR encoding (groupId conventions, reserved
  ids, whether workstream×phase pairing is expressed via `contains`-style relationships or a
  composite groupId like `${workstreamId}-${phaseId}`) is an implementation-time decision to be
  made and written into `references/pre-family-ir-authoring.md` alongside the other patterns —
  not fixed in advance here, since it's a Semantic Contract *encoding* detail, not a Visual
  Contract concern.

## Acceptance Criteria

The standard 9-item Acceptance Gate from `references/reference-pattern-implementation-policy.md`
(Semantic fidelity, Reference composition fidelity, Visual hierarchy fidelity, Emphasis logic
fidelity, Adaptive layout quality, Overflow/clipping, HTML/PPTX parity, PPTX OOXML audit,
Existing corpus regression), plus this pattern's own:

- **Workstream × phase coverage = 100%** — every authored workstream has an activity in every
  authored phase; no gaps.
- **Activity drop = 0** — every activity's title and all of its bullets survive from IR through
  to both renderers.
- **Bullet drop = 0** — same, specifically for the (possibly-multi-line) bullets[] arrays.
- **Milestone order preserved** — milestones render left-to-right in `position` order, not
  re-sorted by anything else.
- **Phase/workstream cross-assignment error = 0** — no activity ever renders in the wrong
  row/column (this is the failure mode unique to a 2D grid that a 1D list pattern can't even
  have).
- **Grid alignment PASS** — rail rows and grid rows stay height-locked; phase band columns and
  grid columns stay width-locked; the milestone rail's markers align under their own phase
  column, not evenly spaced independent of the grid above.
- **Milestone rail alignment PASS** — the rail spans the full composition width (matching the
  rail + grid combined width), not just the grid's width.
- **Visual QA beyond overflow=0**: the rendered slide must read as a legible 2D grid at a
  glance — row and column boundaries visible, not just "no element overflows its box." This is
  checked by eye against a screenshot, the same way Reference composition fidelity is (see the
  policy document) — a grid with 0 overflow findings that still doesn't read as a grid (e.g.
  rows/columns whose boundaries have visually collapsed into each other) does not PASS.
- **Reference-defining Features (10 above), side-by-side**: render the canonical fixture,
  place it next to `RP-100DAY-WORKSTREAM-01.jpg`, and confirm all 5 features from category 10
  are simultaneously present and recognizable before implementation is considered complete.
