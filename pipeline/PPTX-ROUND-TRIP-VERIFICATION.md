# PPTX Native-Object / Round-trip Verification — Phase 3

**Status: PPTX native-object export — PASS. PowerPoint open/edit/save/reopen round-trip — NOT PERFORMED (no PowerPoint application available in this environment).**

This distinction matters and is deliberately not blurred: what follows is the strongest
verification available without literally opening the file in PowerPoint — direct inspection
of the underlying OOXML (the same XML PowerPoint itself reads/writes). It proves the file's
*structure* is native and editable; it does not prove PowerPoint's UI behaves as expected on
every element, since that can only be confirmed by opening the app.

## Method

`python-pptx` + raw `zipfile`/regex inspection of the OOXML parts, run against all 4 generated
decks (the 3 integration test decks + the 62-template `super_template.pptx` catalog).

## Findings

### Confirmed native (structural PASS)

- **Zero embedded raster images** across all 4 files (`ppt/media/` is empty in every one).
  Every one of the 62 templates renders as vector shapes/text/tables/charts — no template is
  currently falling back to an image.
- **Text is real `<a:t>` runs**, not rasterized — confirmed by reading actual Japanese text
  content directly out of the slide XML (e.g. `株式会社ターゲット社 買収提案`,
  `技術優位性はターゲット社が明確に上回る`).
- **Tables are real `<a:tbl>` graphicFrames** (comparison_table/risk_table in the M&A deck: 2
  native tables, matching the spec exactly).
- **4 of the 62 templates use true native PowerPoint Chart objects**
  (`ranked_bar_annotated`, `delta_bars_totals`, `scenario_lines_cagr`, `scatter_annotated` —
  via `pptxgenjs`'s `slide.addChart()`), confirmed by real `ppt/charts/chart*.xml` parts
  containing `<c:numCache>` — the numeric data cache PowerPoint's "Edit Data in Excel" reads.
  Right-click → Edit Data will work on these.
- **Fonts declared correctly**: `Yu Mincho Demibold` (headings) / `Yu Gothic` (body), matching
  the design system's intent, set both at theme level and per-run.

### Real editability caveats found (not blockers, but accurate to disclose)

- **Chart-shaped content on the other ~58 templates is drawn as individual native shapes, not
  a linked Chart object.** `chart_insight`, `waterfall`, `true_waterfall`, `matrix_2x2`,
  `stacked_bar`, `kpi_dashboard` and similar (the original 37-template set, predating the
  27-archetype system) draw each bar/point as its own `addShape(rect/ellipse)` + a separate
  native text box. Every element is still independently selectable, movable, resizable, and
  recolorable in PowerPoint — but there is no "Edit Data" grid; changing a value means editing
  the shape's height/position and its label text separately. Only the 4 templates above have a
  true chart data table.
- **No native Connector objects anywhere** (`cxnSp` count = 0 across all 4 files). Every line
  — including the issue_tree elbow connectors, decision_fork's spine, gantt bars — is a plain
  line/shape, not a PowerPoint Connector with glue points. Moving a connected box will NOT drag
  its lines along automatically; the line has to be repositioned by hand. This is the main
  finding that would matter for "org/process" diagram editing.
- **No shape grouping** (group count = 0). Multi-part visual devices (a chevron + its number +
  its label, a matrix quadrant marker + its text) are flat siblings, not a `<p:grpSp>`. This
  actually helps granular per-element editing (nothing is nested inside a group you'd have to
  enter first) but means moving a "device" as one unit requires a manual multi-select first.
- **Fonts are not embedded** in the PPTX. Text will render correctly on any machine with `Yu
  Gothic`/`Yu Mincho Demibold` available (standard on Windows+Japanese-language-pack and most
  Mac Office installs with CJK support) and silently substitute a fallback elsewhere — line
  breaks and the deliberate `smartBreak()`/fill-ratio geometry were computed assuming these
  exact fonts' metrics, so a substituted font could shift wrapping slightly.

## What this does NOT prove

An actual open → edit text → move a shape → edit chart data → save → reopen cycle in real
PowerPoint was not performed — there is no PowerPoint installation available to this session.
The structural checks above are the correct proxy (they verify the exact XML PowerPoint's UI
operates on, per the OOXML spec) but a literal round-trip is the only way to catch
PowerPoint-specific rendering quirks (e.g. an edge case in how PowerPoint's layout engine
handles a particular `clip-path`-equivalent shape, or font substitution behavior on a specific
OS/Office version). **Recommended next step**: open `pipeline/generated/pipeline-run-ma/deck.pptx`
(or any of the other generated decks) in real PowerPoint and manually confirm text edit / shape
move / chart data edit / save / reopen — this is the one verification step in this whole effort
that genuinely requires a human with the application installed.

## Files inspected

- `pipeline/generated/pipeline-run-strategy/deck.pptx` (6 slides)
- `pipeline/generated/pipeline-run-kpi/deck.pptx` (7 slides)
- `pipeline/generated/pipeline-run-ma/deck.pptx` (7 slides)
- `pipeline/generated/super_template.pptx` (63 slides, all 62 templates)
