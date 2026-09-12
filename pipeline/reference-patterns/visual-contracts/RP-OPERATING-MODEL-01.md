# RP-OPERATING-MODEL-01 — Visual Contract

Written before implementation, per `references/reference-pattern-implementation-policy.md`.
Source: `pipeline/reference-patterns/golden-fixtures-v0.2/RP-OPERATING-MODEL-01.jpg`.

This is a **left-to-right cascade of independently-sized stage columns**, not a uniform grid
(unlike RP-100DAY-WORKSTREAM-01's workstream x phase matrix, where every cell exists and the
grid is strictly N x M). Each stage column carries its own, independently-authored stack of
capability cards — the reference image itself shows 3/3/4/3 cards across its 4 stages, not a
uniform count — so "same shape per stage, different content" is the wrong mental model here;
"a chevron of 4 columns, each its own small stack" is the right one.

## Canonical Composition

```
Title / subtitle
──────────────────────────────────────────────────────────────
[01│顧客セグメント  誰に/価値を届けるか] > [02│提供価値  どのような/価値を提供するか] > [03│実行ケイパビリティ  どのように/実行するか] > [04│ガバナンス  どのように/統制・推進するか]
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ (icon) card1 │      │ (icon) card1 │      │ (icon) card1 │      │ (icon) card1 │
├──────────────┤      ├──────────────┤      ├──────────────┤      ├──────────────┤
│ (icon) card2 │      │ (icon) card2 │      │ (icon) card2 │      │ (icon) card2 │
├──────────────┤      ├──────────────┤      ├──────────────┤      ├──────────────┤
│ (icon) card3 │      │ (icon) card3 │      │ (icon) card3 │      │ (icon) card3 │
└──────────────┘      └──────────────┘      │ (icon) card4 │      └──────────────┘
                                             └──────────────┘
──────────────────────────────────────────────────────────────
[▶ KEY MESSAGE / headline]  │  ✓ checklist item 1
                            │  ✓ checklist item 2
                            │  ✓ checklist item 3
```

3 structural bands, top to bottom:
1. **Title/subtitle**.
2. **The stage cascade** (stage headers + their own card stacks + connectors, the slide's main
   body).
3. **Key Message band** (a full-width closing band, structurally independent of the cascade
   above it — not a 5th stage, not a plain footer).

## Visual Pattern Analysis

### 1. Overall Composition

- Body composition uses 4 equal-width stage columns laid out left to right within the slide's
  content margins, each column self-contained: its own header band on top, its own vertical
  stack of capability cards beneath.
- A small chevron connector sits in the GAP between each pair of adjacent columns (3
  connectors for 4 columns), vertically centered on the column area — a directional "flows
  into" cue, not a card and not part of either column's own box.
- The Key Message band spans the FULL width at the very bottom, below all 4 columns — visually
  closing the slide the way RP-100DAY-WORKSTREAM-01's milestone band closes its own grid, and
  the way RP-KEY-TAKEAWAYS-01's So What bar and RP-MATRIX-BADGELIST-01's insights panel each
  close their own pattern. This project's Library v0.2 patterns consistently end on a
  synthesis band; this is another instance of that same discipline, not a new idea.
- No side panel — unlike Matrix Badge List's insights panel, this pattern's synthesis lives in
  a bottom band, not a right-side column.

### 2. Visual Hierarchy

1. Title (the redesign's own headline claim).
2. Subtitle (one supporting sentence).
3. Stage numbers ("01"-"04") — large, bold, white-on-navy; the first thing the eye lands on
   within each column thanks to size + color contrast.
4. Stage titles (e.g. "顧客セグメント") — bold, white-on-navy, same header band as the number.
5. Stage question tags (e.g. "誰に / 価値を届けるか") — smaller, lighter weight, same header
   band but visually secondary to the number+title pairing.
6. Capability card titles — bold, the card's own payload.
7. Capability card bodies — regular weight, smaller, supporting detail.
8. Key Message headline — large, bold, comparable in visual weight to the slide's own title;
   this is the pattern's real payoff line, not an afterthought.
9. Key Message checklist items — regular weight, smaller, supporting the headline.

Reading order: title → left-to-right across the 4 stage headers (establishing the operating
model's own 4-step logic) → down each column's card stack → across via the connectors →
finally down to the Key Message band as the closing synthesis.

### 3. Component Anatomy

- **Stage header** (one per stage): a chevron/flag-shaped navy band (flat left, pointed
  right — same shape family as RP-100DAY-WORKSTREAM-01's phase segments and this project's
  other homePlate-based bars) containing, left to right: a large bold stage NUMBER, a thin
  vertical divider, the stage TITLE (bold), and a smaller 2-line QUESTION tag in a lighter
  weight/color, right-aligned within the remaining band width. Required: number, title,
  question — a header missing the question tag loses the "what is this stage actually
  answering" framing the reference image treats as integral, not decorative.
- **Capability card** (multiple per stage, independently counted per stage — NOT a fixed
  count shared across all 4 columns): an icon inside a large pale circle badge (left), a bold
  TITLE, and a 2-line regular-weight BODY beneath it. Required: icon, title, body — a card
  missing its icon is a degraded card (same discipline as RP-100DAY-WORKSTREAM-01's activity
  cells).
- **Connector**: a small outlined chevron ("›"-shaped) sitting in the gap between two adjacent
  stage columns, vertically centered — decorative wayfinding, not a data-bearing element (no
  authored content lives in it).
- **Key Message band** — a 3-part composition, NOT one continuous navy tag as an earlier draft
  of this contract described (corrected after closer review of the reference image):
  - **iconWedge**: a small, solid-dark, chevron/wedge-shaped anchor at the FAR LEFT edge,
    holding only the fixed target+arrow icon (a distinct "objective/goal" glyph, not reused
    from the capability-card icon vocabulary). This wedge is a compact anchor shape, not the
    band that carries the text.
  - **messageZone**: immediately to the wedge's right, on a LIGHTER background (distinct from
    the dark wedge) — the "KEY MESSAGE" kicker label above the headline sentence itself. The
    headline's own bold, large text sits here, not inside the dark wedge.
  - **checklistZone**: further right, separated from the messageZone by a thin vertical
    divider — a checklist (2-4 items) of checkmark icon + short supporting sentence pairs.
  Required: headline, >=2 checklist items. Optional: the kicker label text is fixed/default,
  not per-slide authored.

### 4. Color Roles

- **Primary/dark** (navy): stage header bands, the Key Message band's own iconWedge — the
  "structural spine" color marking every major banded component consistently.
- **Accent/mid-tone** (medium blue): connectors, capability card icons, checkmark icons — the
  "wayfinding/detail" color family, distinct from the primary spine color.
- **Pale background tint**: capability card backgrounds, icon badge circles, and the Key
  Message band's messageZone/checklistZone (a lighter background than the dark iconWedge, but
  still visually distinct from the plain slide background) — mostly there to give each
  component its own visible boundary.
- **Emphasis**: this pattern's reference image does NOT single out one stage or one card as
  "the important one" — all 4 stages and every card within them carry equal visual weight. The
  ONE component that IS visually distinguished is the Key Message band itself (its dark
  iconWedge anchor vs. every other component's pale/outlined treatment) — this is a
  PATTERN-LEVEL distinction (band vs. cascade), not a within-cascade emphasis mechanism, so
  (matching RP-100DAY-WORKSTREAM-01's own precedent) this pattern needs no `emphasis` field on
  stages/cards at all.
- House Style mapping to preserve: stage headers + Key Message iconWedge = primary/dark;
  connectors + card icons + checkmarks = one shared accent tone; card backgrounds and the Key
  Message band's messageZone/checklistZone = a faint neutral tint.

### 5. Geometry

- **Canonical**: 4 equal-width stage columns.
- **Adaptive**: N equal-width stage columns, N = 3-5 (see Adaptive Rules below) — column count
  scales with the authored stage count, not fixed at 4.
- Each column is independently tall — column height is driven by whichever stage has the MOST
  cards (3-4 in the reference), with shorter stacks (3-card columns) NOT stretched to
  artificially match the tallest column, just naturally shorter with a bit of trailing space,
  matching the reference's own asymmetric card-count layout.
- **Stage-count-dependent geometry tuning (v1-permitted)**: at 3 stages, columns may render
  wider (more breathing room per card); at 4 stages (canonical), geometry matches the
  reference as closely as possible; at 5 stages, gaps between columns and the connector's own
  width may shrink slightly to keep card content legible. What must NOT change across this
  range is the connector's PRESENCE between every adjacent pair of stages — its exact pixel
  width is a implementation-time tuning knob, not a Reference-defining Feature in itself.
- The connector's own width is small (a wayfinding glyph, not a layout-bearing column) — sits
  in the natural gap between columns, not competing with either column's own width budget.
- Stage header height is fixed and identical across all columns in a given slide regardless of
  card count
  (only the card stack beneath varies in height).
- The Key Message band spans the full content width, split 3 ways: a narrow, compact
  iconWedge at the far left (just wide enough for the target+arrow glyph), a messageZone
  taking up most of the remaining left/center width, and a checklistZone on the right —
  messageZone and checklistZone separated by a thin vertical divider (the iconWedge/
  messageZone boundary is a hard color-block edge, not a thin-line divider).

### 6. Typography

- Stage numbers: the largest numerals in the cascade region, bold.
- Stage titles: bold, similar size family to capability card titles but in a header context
  (white-on-navy).
- Stage question tags: smaller, can be 2 lines, lighter visual weight than the title beside it.
- Capability card titles: bold, the "headline" tier within a card.
- Capability card bodies: regular weight, 2 lines typical — cards are built to hold a short
  label + a short 2-line description, not a long paragraph.
- Key Message headline: large and bold — comparable to the slide's own title, since this is
  the pattern's payoff line, not a footnote.
- Key Message checklist items: regular weight, single line each, shorter than a card body.

### 7. Iconography

- **Capability card icons** are per-item semantic cues (a building = a large/strategic
  account, a location pin = a regional customer base, a people group = new-market outreach, a
  diamond = specialized/expert proposal, a truck = supply chain, a bar chart = cost/KPI, a
  single person = a dedicated owner/lead, an org-chart glyph = a joint/shared structure, a
  gear = process/footprint redesign, a document = a review/reporting cadence). This needs its
  own closed vocabulary at implementation time — some concepts already exist in this
  project's `PATTERN_ICONS` (`people`, `person`, `bar-chart`, `org-chart`, `gear`, `document`,
  `target`), others are new (a building/tower glyph, a location-pin glyph, a diamond glyph, a
  truck glyph already exists from RP-100DAY-WORKSTREAM-01's own set... to confirm at
  implementation time against the actual current `PATTERN_ICONS` contents rather than assumed
  here). Sized to what real authoring needs, not pre-built speculatively for every glyph
  visible in the reference.
- **Key Message's own icon** (target with a dart/arrow hitting it) is a distinct, single fixed
  glyph for this one component — not a per-item choice, not part of the capability-card
  vocabulary. This project's existing `target` icon (concentric circles) may already cover
  this concept closely enough to reuse; confirm at implementation time rather than assuming a
  new glyph is required.
- **Checklist icons** are a plain checkmark, fixed (not a per-item choice) — the mark itself
  carries no distinct semantic meaning beyond "this is a true/achieved statement," consistent
  with how this library treats fixed, non-choosable glyphs elsewhere (e.g. milestone numbered
  circles are not icons, they're the number itself as the semantic cue).

### 8. Emphasis Logic

- No stage, no card, and no checklist item is emphasized differently from its siblings — see
  Color Roles above. The only structural "this part is different" signal is the Key Message
  band's own navy-tag treatment vs. the cascade's pale-card treatment, which is a
  whole-component distinction (band vs. cascade), not an emphasis flag on any one stage/card.
  No `emphasis` field anywhere in this pattern's Semantic Contract.

### 9. Adaptive Rules

- **Canonical**: exactly 4 stages, with an asymmetric card count per stage (3/3/4/3 in the
  reference image itself) — the per-stage card count is independently authored, not a shared
  count across all stages the way RP-100DAY-WORKSTREAM-01's grid requires uniform coverage.
- **Supported adaptive range (v1, conservative, matching this library's established
  precedent)**: 3-5 stages; 2-4 capability cards per stage, independently per stage. A
  4-stage, 3/3/4/3-card composition (the reference itself) remains the fidelity benchmark for
  "does this still look like the reference," but the pattern is not rigidly locked to exactly
  4 stages the way RP-100DAY-WORKSTREAM-01 locks phase count at exactly 3 — an operating-model
  redesign's own stage count is a property of THIS SPECIFIC deck's authored content (the
  title itself says "4層で" as data, not as a fixed template constant), unlike phase count,
  which was tied to the milestone band's own 1:1 alignment requirement.
- **Not yet supported**: 6+ stages, 5+ cards in a single stage, or a Key Message checklist
  outside the 2-4 item range. If real authoring evidence later shows a genuine need beyond
  these, that's a follow-up review, not something v1 should pre-emptively stretch for.
- What must NEVER change between canonical and adaptive variants: the 5 Reference-defining
  Features below, the stage header's chevron/flag shape, connectors between every adjacent
  pair of stages, and the Key Message band's own iconWedge + messageZone + checklistZone
  3-part composition.
- What MAY change: stage count (3-5), card count per stage (2-4, independent per stage),
  checklist item count (2-4), whether a card's body wraps to 1 vs 2 lines.

### 10. Reference-defining Features

These 5 must all be present simultaneously — losing any one of them makes this a different,
lesser pattern (a plain card grid, a plain chevron process, a plain summary band), not an
adaptive variant of this one:

1. **Sequential stage columns**, each with its own numbered+titled+questioned header band —
   not a plain column label, a full header component in its own right.
2. **Chevron connectors** between every adjacent pair of stages — the visual "this flows into
   the next" cue; losing them makes the 4 columns read as 4 unrelated card grids side by
   side, not one operating-model cascade.
3. **Stacked capability cards per stage**, independently counted per stage (not a uniform
   grid) — each card itself a full icon+title+body component, not a bare label.
4. **The Key Message band's own iconWedge-anchored headline** — a distinct, prominent closing
   statement (dark wedge anchor + a lighter messageZone carrying the actual headline text),
   not a plain footer sentence.
5. **The Key Message band's checklist**, structurally attached to (not separate from) the
   headline — the pattern's synthesis is headline + supporting checklist together, the same
   way RP-KEY-TAKEAWAYS-01's So What only works alongside its insight panel.

## Semantic Contract

Independent of any existing chevron/pillar template in this library — confirmed at
implementation time via a dedicated fit check against `chevron_rail`, `chevron_steps`,
`chevron_value_chain`, and `pillars_foundation`: none of the four supports stacked icon+title+
body cards nested independently per segment, independently-variable per-segment item counts,
or a 3-part closing Key Message band, so a new `operating_model_cascade` SlideSpec template
was implemented rather than extending any of them.

**Field names below are the authoritative SlideSpec property names actually implemented — kept
in sync with schema.json/the adapter, not a conceptual sketch.** The names differ from an
earlier draft of this contract (`stages[]`/`keyMessage`) because both collided with unrelated,
differently-shaped fields already used by other templates in this schema (`stages[]` already
belongs to an existing template requiring `label`+`heading`; `keyMessage` already exists
elsewhere as a plain string). Renamed once, here, rather than left as a "contract says X,
implementation says Y" drift — an LLM authoring against this contract, or a future adapter
change, must not read a name this pattern doesn't actually use.

```
cascadeStages[]
  id
  number       // e.g. "01" — authored directly, same discipline as every other
               // "number" field in this library, not derived from array position
  title
  question     // REQUIRED — the header's own guiding question (e.g. "誰に/価値を届けるか")
  cards[]      // >=2, independently counted per stage — NOT required to match other stages
    title
    body
    icon       // REQUIRED — closed vocabulary, confirm exact set at implementation time
keyMessageBand
  label?       // defaults "KEY MESSAGE"
  headline
  checklist[]  // 2-4 items, plain strings (a fixed checkmark glyph, not a per-item icon
               // choice)
```

- **Required**: all authored stages (3-5 supported; 4 canonical) present with a number, title,
  and question; every stage has >=2 cards (2-4 supported), each with a title, body, and icon;
  a `keyMessageBand` with a headline and 2-4 checklist items.
- **Optional**: `keyMessageBand.label` (defaults to "KEY MESSAGE").
- **No `emphasis` field anywhere** — see Emphasis Logic above.
- The Selector's structural check needs to verify, at minimum: stage count in the supported
  range (3-5), every stage's own card count in range (2-4) independently, and the Key
  Message's checklist count in range (2-4) — there is no cross-stage coverage requirement the
  way RP-100DAY-WORKSTREAM-01's grid needs (no "stage x card" pairing to validate; each
  stage's cards are self-contained). **A card group's own groupId shares the "stage-" prefix
  with its parent stage group** (cards are named `${stageGroupId}-card-N`) — stage-counting
  logic must explicitly exclude any groupId containing `-card-`, or every card silently
  double-counts as an additional stage (a real bug this implementation hit and fixed; see the
  regression test guarding it in `test/unit.test.mjs`).
- The exact `elements[]`/`relationships[]` Pre-family IR encoding (reserved groupId
  conventions for stages/cards/checklist items) is an implementation-time decision, to be
  written into `references/pre-family-ir-authoring.md` alongside the other patterns.

## Acceptance Criteria

The standard 9-item Acceptance Gate from `references/reference-pattern-implementation-policy.md`
(Semantic fidelity, Reference composition fidelity, Visual hierarchy fidelity, Emphasis logic
fidelity, Adaptive layout quality, Overflow/clipping, HTML/PPTX parity, PPTX OOXML audit,
Existing corpus regression), plus this pattern's own:

- **Stage card count independence** — each stage's own card count (2-4) renders correctly
  regardless of what other stages in the SAME slide have (a 3-card stage next to a 4-card
  stage must not force the 3-card stage to stretch or fabricate a 4th card).
- **Card/checklist drop = 0** — every card's title/body/icon and every checklist item
  survives from IR through to both renderers.
- **Connector count = stage count - 1** — exactly one connector between every adjacent pair of
  stages, none missing, none doubled.
- **Stage order preserved = 100%** — the authored stage order (via `number`/array order) is
  never re-ranked by the Selector or either renderer. The left-to-right sequence IS the
  pattern's own meaning (01 customer → 02 value proposition → 03 execution → 04 governance);
  reordering stages is a semantic mutation, not a cosmetic one.
- **Stage header height lock** — all stage headers render at the same height regardless of
  their own stage's card count (only the card stack beneath varies).
- **Key Message band structural completeness** — headline and checklist both present and
  visually attached as one band, not two independent elements that happen to be adjacent.
- **Visual QA beyond overflow=0**: the rendered slide must read as a left-to-right flow of
  connected stages at a glance, not 4 disconnected card grids — checked by eye against a
  screenshot, the same way Reference composition fidelity is.
- **Reference-defining Features (10 above), side-by-side**: render the canonical fixture,
  place it next to `RP-OPERATING-MODEL-01.jpg`, and confirm all 5 features from category 10
  are simultaneously present and recognizable before implementation is considered complete.
