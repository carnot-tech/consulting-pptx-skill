import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const input = process.argv[2] || "slide-spec/example_deck.json";
const output = process.argv[3] || "generated/example_deck.html";

const root = fileURLToPath(new URL("..", import.meta.url));
const inputPath = path.resolve(root, input);
const outputPath = path.resolve(root, output);
const spec = JSON.parse(await fs.readFile(inputPath, "utf8"));

// 最終ページの出典行だけに、本スキルで作成した旨の注釈を付ける（他のページには付けない）。
// ルートの attribution: false で無効化、文字列を入れると差し替え。
const SKILL_ATTRIBUTION_JA = "本資料は consulting-pptx-skill（github.com/carnot-tech/consulting-pptx-skill）で作成";
const SKILL_ATTRIBUTION_EN = "Created with consulting-pptx-skill (github.com/carnot-tech/consulting-pptx-skill)";
function applySkillAttribution(deck) {
  if (deck.attribution === false || !Array.isArray(deck.slides) || !deck.slides.length) return;
  const isJp = /[぀-ヿ㐀-鿿]/.test(JSON.stringify(deck));
  const text = typeof deck.attribution === "string" ? deck.attribution : (isJp ? SKILL_ATTRIBUTION_JA : SKILL_ATTRIBUTION_EN);
  const last = deck.slides[deck.slides.length - 1];
  if (String(last.source || "").includes(text) || String(last.note || "").includes(text)) return;
  last.source = [last.source, text].filter(Boolean).join(isJp ? "　" : "  ");
}
applySkillAttribution(spec);

// Single source of truth: exactly the templates with a renderSlide() case below.
// Schema enum may list additional "planned" archetypes; specs using them fail loudly (see validate + default).
const templates = new Set([
  "cover",
  "executive_summary",
  "big_stat_pair",
  "numbered_imperatives",
  "theme_card_grid",
  "question_framework",
  "evidence_basis",
  "chart_insight",
  "comparison_table",
  "roadmap",
  "waterfall",
  "matrix_2x2",
  "scenario_table",
  "risk_table",
  "decision_page",
  "scr",
  "horizontal_axis_table",
  "issue_to_solution_map",
  "process_flow",
  "cycle",
  "issue_cause_solution",
  "current_target_state",
  "decision_fork",
  "heatmap_table",
  "timeline_matrix",
  "process_matrix",
  "stacked_bar",
  "true_waterfall",
  "cause_effect",
  "chevron_rail",
  "gantt",
  "issue_tree",
  "kpi_dashboard",
  "recommendation_pillars",
  "small_multiples",
  "nested_row_matrix",
  "calc_flow",
  "chevron_value_chain",
  "workstream_100day",
]);

// ── 型プラグイン（scripts/archetypes/*.mjs）。PPTX エクスポーターと同じ登録簿。
// html(ctx, item, n) を持つ型はそれで描画し（全27型が実装済み。共通ヘルパーは archetypes/_html.mjs）、
// 持たない型（今後追加する型の暫定）は中身を汎用レイアウトで描画する。
const ARCHETYPES = await (async () => {
  const dir = path.resolve(root, "scripts/archetypes");
  const map = new Map();
  let files = [];
  try { files = (await fs.readdir(dir)).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort(); } catch { return map; }
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    if (mod.id) { map.set(mod.id, mod); templates.add(mod.id); }
  }
  return map;
})();

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function validate(deck) {
  if (!deck.deckTitle || !Array.isArray(deck.slides)) {
    throw new Error("SlideSpec requires deckTitle and slides.");
  }
  deck.slides.forEach((slide, index) => {
    if (!templates.has(slide.template)) {
      throw new Error(
        `Slide ${index + 1} uses template "${slide.template}" which is not implemented (it may be a schema-declared but planned archetype). Implemented: ${[...templates].sort().join(", ")}.`,
      );
    }
    const minTitleLen = /[぀-ヿ㐀-鿿]/.test(slide.title || "") ? 12 : 20;
    // TEMPLATE_MODE=1: 型カタログ（タイトル＝型名）を描画するときだけ最短字数の検証を外す
    if (!process.env.TEMPLATE_MODE && (!slide.title || slide.title.length < minTitleLen)) {
      throw new Error(`Slide ${index + 1} needs an action-oriented title (min ${minTitleLen} chars).`);
    }
    const rect = (rows, width, label) => {
      (rows || []).forEach((row, ri) => {
        const cells = row.cells || [];
        if (cells.length !== width) {
          throw new Error(
            `Slide ${index + 1} (${slide.template}) ${label} row ${ri + 1} has ${cells.length} cells but expected ${width}.`,
          );
        }
      });
    };
    if (slide.template === "heatmap_table" && slide.heatmap) {
      rect(slide.heatmap.rows, (slide.heatmap.colHeaders || []).length, "heatmap");
    }
    if (slide.template === "timeline_matrix" && slide.lanes) {
      rect(slide.lanes.rows, (slide.lanes.columns || []).length, "lanes");
    }
    if (slide.template === "process_matrix" && slide.grid) {
      rect(slide.grid.rows, (slide.grid.colHeaders || []).length, "grid");
    }
  });
}

function footer(slide, n) {
  const source = [slide.note, slide.source].filter(Boolean).join(" ");
  return `<footer class="footer"><span class="source">${esc(source || "Source: Synthetic example")}</span><span>${n}</span></footer>`;
}

// slide-rules §2.1: タイトルは意味の切れ目で改行し泣き別れを作らない（PPTX 書き出しと同じ規則）
function fwLen(str) { let n = 0; for (const ch of String(str || "")) n += ch.charCodeAt(0) < 0x3000 ? 0.5 : 1; return n; }
function smartBreak(text, cap, minTail = 4) {
  const t = String(text || "");
  if (!t || t.includes("\n") || fwLen(t) <= cap) return t;
  const chars = [...t]; const total = fwLen(t);
  const after = (ch) => /[、。：:）)」』\s／/・]/.test(ch); const before = (ch) => /[（(「『]/.test(ch);
  let best = -1, acc = 0;
  for (let i = 1; i < chars.length; i++) { acc += chars[i-1].charCodeAt(0) < 0x3000 ? 0.5 : 1; if (acc > cap) break; if (total - acc < minTail) break; if (after(chars[i-1]) || before(chars[i])) best = i; }
  if (best < 0) { acc = 0; for (let i = 1; i < chars.length; i++) { acc += chars[i-1].charCodeAt(0) < 0x3000 ? 0.5 : 1; if (acc > cap - 1) break; if (total - acc >= minTail) best = i; } }
  return best > 0 ? chars.slice(0, best).join("") + "\n" + chars.slice(best).join("") : t;
}
function titleHtml(text, cap) { return esc(smartBreak(text, cap)).replaceAll("\n", "<br>"); }

function shell(slide, n, body, opts = {}) {
  // Default: no title underline. Opt in with { titleRule: true }.
  const slideClass = (opts.titleRule === true ? "slide" : "slide slide--no-title-rule") + (opts.className ? ` ${opts.className}` : "");
  return `<section class="${slideClass}">
  <div class="slide-inner">
    <div class="kicker">${esc(slide.kicker || slide.template.replaceAll("_", " "))}</div>
    <h2 class="title">${titleHtml(slide.title, 38)}</h2>
    <div class="rule"></div>
    <div class="content">${slide.subtitle && !opts.ownSubtitle ? `<div class="metric-sub">${esc(slide.subtitle)}</div>` : ""}${body}</div>
    ${footer(slide, n)}
  </div>
</section>`;
}

function renderCover(slide, n) {
  return `<section class="slide cover">
  <div class="cover-mark" aria-hidden="true"></div>
  <div class="slide-inner">
    <div></div>
    <div>
      <div class="kicker">${esc(slide.kicker)}</div>
      <h1 class="cover-title">${titleHtml(slide.title, 18)}</h1>
      <div class="cover-meta">${esc(slide.subtitle || "").replaceAll("|", "<br>")}</div>
    </div>
    ${footer(slide, n)}
  </div>
</section>`;
}

function renderExecutiveSummary(slide, n) {
  const cols = (slide.sections || [])
    .map(
      (section) => `<div><div class="section-label">${esc(section.title)}</div><div class="body-copy">${esc(section.copy)}</div></div>`,
    )
    .join("");
  return shell(slide, n, `<div class="three-col">${cols}</div>`);
}

function renderChartInsight(slide, n) {
  const values = slide.chart.series.map((d) => d.value);
  // Zero-baseline domain (matches renderWaterfall/addTrueWaterfall's own approach) — a plain
  // height:NN% of the max goes NEGATIVE (and so renders as an invisible, zero-height bar) for
  // any value below zero, which silently drops negative data points from the chart. Anchoring
  // every bar to a shared zero line, growing up for positive values and down for negative
  // ones, is the fix; PADDING keeps a lone all-positive or all-negative series from having its
  // one edge flush against the plot's own top/bottom edge (still reads fine either way).
  const domainMin = Math.min(0, ...values);
  const domainMax = Math.max(0, ...values);
  const rawRange = domainMax - domainMin || 1;
  // Padding is a fraction of the RANGE (not of each extreme value) — scaling off the value
  // itself under-pads whichever extreme is small relative to the other (e.g. -18 next to
  // +24 got only ~11px of headroom out of the ~30px its value label needs, overlapping the
  // category label below it). A range-relative fraction gives every extreme the same
  // guaranteed headroom regardless of how the two ends compare to each other.
  const PADDING = 0.18;
  const paddedMin = domainMin < 0 ? domainMin - rawRange * PADDING : domainMin;
  const paddedMax = domainMax > 0 ? domainMax + rawRange * PADDING : domainMax;
  const range = paddedMax - paddedMin || 1;
  const pct = (v) => ((v - paddedMin) / range) * 100;
  const bars = slide.chart.series
    .map((d, i) => {
      const cls = i === slide.chart.series.length - 1 ? "bar blue" : i === slide.chart.series.length - 2 ? "bar cyan" : "bar";
      const top = Math.max(d.value, 0);
      const bottom = Math.min(d.value, 0);
      const barTopPct = pct(top);
      const barBottomPct = pct(bottom);
      const barHeightPct = barTopPct - barBottomPct;
      // Positive bars grow up from zero — the value label sits above the bar's top edge.
      // Negative bars grow DOWN from zero — the label belongs below the bar's (lower)
      // bottom edge, not above the zero line, or it would float in the positive region.
      const valueStyle = d.value >= 0 ? `bottom: calc(${barTopPct}% + 8px);` : `top: calc(${100 - barBottomPct}% + 8px);`;
      return `<div class="bar-wrap"><div class="bar-plot"><div class="bar-value" style="${valueStyle}">${esc(d.value)}</div><div class="${cls}" style="bottom: ${barBottomPct}%; height: ${barHeightPct}%;"></div></div><div class="bar-label">${esc(d.label)}</div></div>`;
    })
    .join("");
  const zeroLine = domainMin < 0 ? `<div class="bar-zero-line" style="bottom: ${pct(0)}%;"></div>` : "";
  const insight = slide.sections?.[0] || {};
  const colCount = slide.chart.series.length || 1;
  return shell(
    slide,
    n,
    `<div class="two-col"><div><div class="section-label">${esc(slide.chart.unit)}</div><div class="bar-chart" style="grid-template-columns: repeat(${colCount}, minmax(0, 1fr));">${zeroLine}${bars}</div></div><div class="insight-panel"><div class="section-label">${esc(insight.title)}</div><div class="body-copy">${esc(insight.copy)}</div></div></div>`,
  );
}

// quadrant-panel mode: each quadrant is a labeled panel (priorityLabel + title + body +
// evidence, or just a single-sentence label for the "plain" variant), not a plotted point.
// Used when the spec authors `quadrants` instead of `items` — see RP-MATRIX-HERO-01 /
// RP-MATRIX-PLAIN-01 in the Reference Pattern Library, which require 2 authored axes plus
// per-quadrant content richer than a scattered label can hold.
const QUADRANT_ORDER = ["top-left", "top-right", "bottom-left", "bottom-right"];

function renderMatrixQuadrants(slide, n) {
  const byPosition = new Map((slide.quadrants || []).map((q) => [q.position, q]));
  const cells = QUADRANT_ORDER.map((pos) => {
    const q = byPosition.get(pos);
    if (!q) return `<div class="mq-cell"></div>`;
    const isHero = Boolean(q.title || q.body);
    const badge = q.priorityLabel ? `<span class="mq-badge">${esc(q.priorityLabel)}</span>` : "";
    const inner = isHero
      ? `${badge}<div class="mq-title">${esc(q.title || "")}</div>${q.body ? `<div class="mq-body">${esc(q.body)}</div>` : ""}${q.evidence ? `<div class="mq-evidence">${esc(q.evidence)}</div>` : ""}`
      : `${badge}<div class="mq-label">${esc(q.label || q.title || "")}</div>`;
    return `<div class="mq-cell${q.emphasis ? " emphasis" : ""}">${inner}</div>`;
  }).join("");
  return shell(
    slide,
    n,
    `<div class="matrix-quad"><div class="matrix-axis-y">${esc(slide.matrix?.yAxis || "")}</div><div class="matrix-axis-x">${esc(slide.matrix?.xAxis || "")}</div><div class="mq-grid">${cells}</div></div>`,
  );
}

// Matrix Badge List's own insight panel presentation — bulb icon header + numbered WHITE
// CARDS (not a flat bullet list) — a deliberately different visual treatment from
// renderKpiInsights even though it reads the exact same {title?, items:[string]} data shape
// (kpi_dashboard's own insights field, reused verbatim for the DATA — only the presentation
// is pattern-specific, same as every other per-pattern renderer in this file).
function renderMatrixInsights(insights) {
  const items = insights.items
    .map((text, i) => `<div class="mqb-panel-item"><span class="mqb-panel-num">${i + 1}</span><div class="mqb-panel-card">${esc(text)}</div></div>`)
    .join("");
  return `<div class="mqb-panel"><div class="mqb-panel-head"><div class="mqb-panel-bulb">${PATTERN_ICONS.bulb}</div><div class="mqb-panel-title">${esc(insights.title || "示唆")}</div></div><div class="mqb-panel-list">${items}</div></div>`;
}

// badge-list mode (RP-MATRIX-BADGELIST-01): a 3rd quadrant shape, detected via
// `quadrants[].items` — a priority number + label + optional summary header, a stack of
// individually-iconed badge-pill items, arrow-drawn axes, and a mandatory right-side insights
// panel. Deliberately does NOT reuse renderMatrixQuadrants' title/body/evidence markup — see
// references/pre-family-ir-authoring.md's Matrix Badge List section for why.
function renderMatrixBadgeList(slide, n) {
  const byPosition = new Map((slide.quadrants || []).map((q) => [q.position, q]));
  const cells = QUADRANT_ORDER.map((pos) => {
    const q = byPosition.get(pos);
    if (!q) return `<div class="mqb-cell"></div>`;
    const items = (q.items || [])
      .map((item) => {
        const icon = item.icon && PATTERN_ICONS[item.icon] ? `<div class="mqb-item-icon">${PATTERN_ICONS[item.icon]}</div>` : "";
        return `<div class="mqb-item${item.emphasis ? " emphasis" : ""}">${icon}<span class="mqb-item-title">${esc(item.title)}</span></div>`;
      })
      .join("");
    const summary = q.summary
      ? `<span class="mqb-divider"></span><span class="mqb-summary">${esc(q.summary)}</span>`
      : "";
    return `<div class="mqb-cell${q.emphasis ? " emphasis" : ""}"><div class="mqb-head"><span class="mqb-num">${esc(q.number || "")}</span><span class="mqb-label">${esc(q.label || "")}</span>${summary}</div><div class="mqb-items">${items}</div></div>`;
  }).join("");
  const m = slide.matrix || {};
  const insights = slide.insights ? renderMatrixInsights(slide.insights) : "";
  return shell(
    slide,
    n,
    `<div class="mqb-wrap"><div class="mqb-main"><div class="mqb-row"><div class="mqb-axis-y"><span class="mqb-axis-end">${esc(m.yAxisHigh || "")}</span><div class="mqb-axis-y-arrow"></div><div class="mqb-axis-y-line"></div><span class="mqb-axis-title-y">${esc(m.yAxis || "")}</span><span class="mqb-axis-end">${esc(m.yAxisLow || "")}</span></div><div class="mqb-grid">${cells}</div></div><div class="mqb-axis-x"><span class="mqb-axis-end">${esc(m.xAxisLow || "")}</span><div class="mqb-axis-x-line"></div><div class="mqb-axis-x-arrow"></div><span class="mqb-axis-title">${esc(m.xAxis || "")}</span><span class="mqb-axis-end">${esc(m.xAxisHigh || "")}</span></div></div><div class="mqb-insight">${insights}</div></div>`,
    { noTitleRule: true, className: "slide--top-align" },
  );
}

// RP-100DAY-WORKSTREAM-01: a swimlane x phase 2D matrix (workstream rail x phase band x
// activity grid x milestone rail), NOT a timeline — independent of renderRoadmap. See
// pipeline/reference-patterns/visual-contracts/RP-100DAY-WORKSTREAM-01.md for the full Visual
// Contract this renderer is built to satisfy. Alignment (rail rows <-> grid rows, phase band
// columns <-> grid columns <-> milestone columns) is achieved via CSS Grid line-up, not
// per-element pixel math — each of rail/phaseband/grid/milestone-track is its own nested grid
// sharing the same row/column count as its counterpart, all placed within one shared 2-column
// outer grid (rail-width column + content column).
function renderWorkstream100Day(slide, n) {
  const workstreams = slide.workstreams || [];
  const phases = [...(slide.phases || [])].sort((a, b) => a.order - b.order);
  const activityByKey = new Map((slide.activities || []).map((a) => [`${a.workstreamId}::${a.phaseId}`, a]));
  const milestonesByPhase = new Map((slide.milestones || []).map((m) => [m.phaseId, m]));

  const phaseCells = phases
    .map(
      (p) =>
        `<div class="w100-phase"><div class="w100-phase-label">${esc(p.title)}</div>${p.subtitle ? `<div class="w100-phase-sub">${esc(p.subtitle)}</div>` : ""}</div>`,
    )
    .join("");

  const railCards = workstreams
    .map((w) => {
      const icon = w.icon && PATTERN_ICONS[w.icon] ? `<div class="w100-rail-icon">${PATTERN_ICONS[w.icon]}</div>` : "";
      return `<div class="w100-rail-card">${icon}<div class="w100-rail-text"><div class="w100-rail-title">${esc(w.title)}</div>${w.subtitle ? `<div class="w100-rail-sub">${esc(w.subtitle)}</div>` : ""}</div></div>`;
    })
    .join("");

  const cells = workstreams
    .map((w) =>
      phases
        .map((p) => {
          const a = activityByKey.get(`${w.id}::${p.id}`);
          if (!a) return `<div class="w100-cell"></div>`;
          const icon = a.icon && PATTERN_ICONS[a.icon] ? `<div class="w100-cell-icon">${PATTERN_ICONS[a.icon]}</div>` : "";
          const bullets = a.bullets.map((b) => `<li>${esc(b)}</li>`).join("");
          return `<div class="w100-cell"><div class="w100-cell-head">${icon}<div class="w100-cell-title">${esc(a.title)}</div></div><ul class="w100-cell-bullets">${bullets}</ul></div>`;
        })
        .join(""),
    )
    .join("");

  const milestoneItems = phases
    .map((p) => {
      const m = milestonesByPhase.get(p.id);
      if (!m) return `<div class="w100-milestone"></div>`;
      return `<div class="w100-milestone"><div class="w100-milestone-head"><span class="w100-milestone-num">${esc(String(m.position))}</span><span class="w100-milestone-label">${esc(m.label)}</span></div><div class="w100-milestone-title">${esc(m.title)}</div>${m.body ? `<div class="w100-milestone-body">${esc(m.body)}</div>` : ""}</div>`;
    })
    .join("");

  const n_ph = phases.length;
  const n_ws = workstreams.length;
  return shell(
    slide,
    n,
    `<div class="w100-outer">
      <div class="w100-rail-head">ワークストリーム</div>
      <div class="w100-phaseband" style="grid-template-columns: repeat(${n_ph}, minmax(0, 1fr));">${phaseCells}</div>
      <div class="w100-rail" style="grid-template-rows: repeat(${n_ws}, minmax(0, 1fr));">${railCards}</div>
      <div class="w100-grid" style="grid-template-columns: repeat(${n_ph}, minmax(0, 1fr)); grid-template-rows: repeat(${n_ws}, minmax(0, 1fr));">${cells}</div>
      <div class="w100-milestone-band">
        <div class="w100-milestone-caption">主要マイルストーン</div>
        <div class="w100-milestone-track" style="grid-template-columns: repeat(${n_ph}, minmax(0, 1fr));"><div class="w100-milestone-line"></div><div class="w100-milestone-arrow"></div>${milestoneItems}</div>
      </div>
    </div>`,
    { noTitleRule: true, className: "slide--top-align slide--fill-grid" },
  );
}

function renderMatrix(slide, n) {
  if (Array.isArray(slide.quadrants) && slide.quadrants.some((q) => Array.isArray(q.items))) return renderMatrixBadgeList(slide, n);
  if (Array.isArray(slide.quadrants)) return renderMatrixQuadrants(slide, n);
  const points = (slide.items || [])
    .map(
      (item) =>
        `<div class="matrix-item${item.priority ? " priority" : ""}" style="left: ${item.x}%; top: ${item.y}%;">${esc(item.label)}</div>`,
    )
    .join("");
  const section = slide.sections?.[0] || {};
  const bullets = (section.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
  return shell(
    slide,
    n,
    `<div class="matrix-wrap"><div class="matrix-chart"><div class="matrix-axis-y">${esc(slide.matrix?.yAxis || "Higher impact")}</div><div class="matrix-axis-x">${esc(slide.matrix?.xAxis || "Higher feasibility")}</div>${points}</div><div class="insight-panel"><div class="section-label">${esc(section.title)}</div><ul class="bullets">${bullets}</ul></div></div>`,
  );
}

function renderWaterfall(slide, n) {
  const max = Math.max(...slide.chart.series.map((d) => Math.abs(d.value)));
  const bars = slide.chart.series
    .map((d) => {
      const cls = d.kind === "down" ? "wf-bar down" : d.kind === "total" ? "wf-bar blue" : d.kind === "up" ? "wf-bar up" : "wf-bar";
      // kind:"down" is authored as a positive MAGNITUDE (see slide-spec/schema.json's chart
      // def and true_waterfall's own convention) — it must display with a minus sign, not a
      // bare/plus-signed number, or a subtraction reads as a positive contribution.
      const sign = d.kind === "down" ? "−" : d.kind === "up" && d.value > 0 ? "+" : "";
      return `<div class="wf-item"><div class="wf-value">${sign}${esc(Math.abs(d.value))}</div><div class="${cls}" style="height: ${Math.round((Math.abs(d.value) / max) * 70)}%;"></div><div class="wf-label">${esc(d.label)}</div></div>`;
    })
    .join("");
  const insight = slide.sections?.[0] || {};
  return shell(
    slide,
    n,
    `<div class="two-col"><div><div class="section-label">${esc(slide.chart.unit)}</div><div class="waterfall">${bars}</div></div><div class="insight-panel"><div class="section-label">${esc(insight.title)}</div><div class="body-copy">${esc(insight.copy)}</div></div></div>`,
  );
}

// ◎/○/△/× -> CSS class names (avoids relying on unicode class selectors in the stylesheet).
const CMP_SYMBOL_CLASS = { "◎": "great", "○": "good", "△": "caution", "×": "poor" };

function cmpCellHtml(cell) {
  if (!cell) return "";
  const symbol = cell.symbol ? `<span class="cmp-symbol ${CMP_SYMBOL_CLASS[cell.symbol] || ""}">${esc(cell.symbol)}</span>` : "";
  return `${symbol}<span class="cmp-caption">${esc(cell.caption)}</span>`;
}

// N-candidate matrix mode (RP-COMPARISON-TABLE-01): evaluation criteria as rows, candidates
// as columns, each cell a rating symbol (◎/○/△/×) + short caption, an optional recommendation
// row, and an optional 総括 summary panel (numbered points + a highlighted conclusion) beside
// the table. Used when the spec authors `comparison` instead of `table`/`headers` — the old
// flat shape (fixed company/competitor/implication columns) is unchanged and still supported.
function renderComparisonMatrix(slide, n) {
  const c = slide.comparison;
  const nCand = c.candidates.length;
  const cols = `1.3fr repeat(${nCand}, 1fr)`;
  const headCells = c.candidates
    .map((cand) => `<div class="cmp-candhead${cand.highlight ? " highlight" : ""}">${esc(cand.label)}</div>`)
    .join("");
  const rows = c.criteria
    .map((criterion, ri) => {
      const cells = c.candidates
        .map((cand) => `<div class="cmp-cell${cand.highlight ? " highlight" : ""}">${cmpCellHtml(cand.cells[ri])}</div>`)
        .join("");
      return `<div class="cmp-criterion">${esc(criterion)}</div>${cells}`;
    })
    .join("");
  const recRow = c.recommendation
    ? `<div class="cmp-criterion cmp-reclabel">${esc(c.recommendation.label)}</div>${c.candidates
        .map((cand, ci) => `<div class="cmp-cell cmp-rec${cand.highlight ? " highlight" : ""}">${cmpCellHtml(c.recommendation.cells[ci])}</div>`)
        .join("")}`
    : "";
  const table = `<div class="cmp-grid" style="grid-template-columns: ${cols};"><div class="cmp-corner"></div>${headCells}${rows}${recRow}</div>`;

  const s = slide.comparisonSummary;
  const summary = s
    ? `<div class="cmp-summary"><div class="section-label">${esc(s.title || "総括")}</div><ol class="cmp-points">${s.points
        .map((p, i) => `<li><span class="ki-num">${i + 1}</span><span>${esc(p)}</span></li>`)
        .join("")}</ol>${s.conclusion ? `<div class="cmp-conclusion"><div class="cmp-conclusion-label">${esc(s.conclusionLabel || "結論")}</div><div>${esc(s.conclusion)}</div></div>` : ""}</div>`
    : "";
  return shell(slide, n, `<div class="cmp-wrap${s ? "" : " single"}">${table}${summary}</div>`);
}

function renderComparison(slide, n) {
  if (slide.comparison) return renderComparisonMatrix(slide, n);
  // Column headers are localizable via slide.headers (English defaults keep old specs working).
  const h = slide.headers || {};
  const heads = [
    esc(h.criterion || "Criterion"),
    esc(h.company || "Company"),
    esc(h.competitor || "Competitors"),
    esc(h.implication || "Implication"),
  ]
    .map((label) => `<div class="head">${label}</div>`)
    .join("");
  const rows = (slide.table || [])
    .map(
      (r) => `<div class="row-label">${esc(r.criterion)}</div><div>${esc(r.company)}</div><div>${esc(r.competitor)}</div><div>${esc(r.implication)}</div>`,
    )
    .join("");
  return shell(slide, n, `<div class="comparison">${heads}${rows}</div>`);
}

function renderScenario(slide, n) {
  // Column headers are localizable via slide.headers (English defaults keep old specs working).
  const h = slide.headers || {};
  const heads = [h.case || "Case", h.outcome || "Revenue outcome", h.assumptions || "Key assumptions", h.implication || "Management implication"]
    .map((label) => `<th>${esc(label)}</th>`)
    .join("");
  const rows = (slide.table || [])
    .map(
      (r) => `<tr><td><span class="lead">${esc(r.case)}</span></td><td><span class="num">${esc(r.outcome)}</span></td><td>${esc(r.assumptions)}</td><td>${esc(r.implication)}</td></tr>`,
    )
    .join("");
  return shell(slide, n, `<table class="scenario-table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`);
}

function renderRisk(slide, n) {
  // Column headers are localizable via slide.headers (English defaults keep old specs working).
  const h = slide.headers || {};
  const heads = [h.risk || "Risk", h.signal || "Signal to track", h.mitigation || "Mitigation", h.owner || "Owner"]
    .map((label) => `<th>${esc(label)}</th>`)
    .join("");
  const rows = (slide.table || [])
    .map(
      (r) => `<tr class="${r.severity === "high" ? "risk-high" : "risk-med"}"><td><span class="lead">${esc(r.risk)}</span></td><td>${esc(r.signal)}</td><td>${esc(r.mitigation)}</td><td>${esc(r.owner)}</td></tr>`,
    )
    .join("");
  return shell(slide, n, `<table class="risk-table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`);
}

// phase-banded mode: each phase is a column with its own title/subtitle and a vertical list
// of dated milestones (one optionally emphasized), plus an optional slide-level outcomes
// band below all phases. Used when the spec authors `phases` instead of `sections` — see
// RP-PMI-ROADMAP-01 in the Reference Pattern Library. `gantt` was considered for this pattern
// but its schema requires >=2 duration-bar `rows` (start+span), a concept phase-banded
// roadmaps don't have (discrete dated milestones, not spans of work) — forcing that shape
// would mean drawing bars that don't represent real data.
function renderRoadmapPhases(slide, n) {
  const phases = (slide.phases || [])
    .map((p) => {
      const milestones = (p.milestones || [])
        .map(
          (m) =>
            `<div class="phase-milestone${m.emphasis ? " emphasis" : ""}">${m.date ? `<div class="pm-date">${esc(m.date)}</div>` : ""}<div class="pm-title">${esc(m.title)}</div></div>`,
        )
        .join("");
      return `<div class="phase"><div class="phase-title">${esc(p.title)}</div>${p.subtitle ? `<div class="phase-subtitle">${esc(p.subtitle)}</div>` : ""}<div class="phase-milestones">${milestones}</div></div>`;
    })
    .join("");
  const outcomes = slide.outcomes
    ? `<div class="roadmap-outcomes">${(slide.outcomes.bullets || []).map((b) => `<div class="ro-item">${esc(b)}</div>`).join("")}</div>`
    : "";
  return shell(
    slide,
    n,
    `<div class="roadmap" style="grid-template-columns: repeat(${slide.phases.length}, 1fr);">${phases}</div>${outcomes}`,
  );
}

function renderRoadmap(slide, n) {
  if (Array.isArray(slide.phases)) return renderRoadmapPhases(slide, n);
  const phases = (slide.sections || [])
    .map((p) => `<div class="phase"><div class="phase-year">${esc(p.title)}</div><div class="phase-copy">${esc(p.copy)}</div></div>`)
    .join("");
  return shell(slide, n, `<div class="roadmap">${phases}</div>`);
}

// N-column mode (RP-DECISION-ASK-01): each decision is its own column — a navy header band
// (number + context), an icon + decisive-action title, then numbered concrete actions — plus
// an optional bottom bar (a chevron-tagged recommendation + a numbered next-steps sequence).
// Used when the spec authors `decisionGroups` instead of `ask`/`decisions` — the existing
// flat single-recommendation shape is unchanged and still supported.
function renderDecisionGroups(slide, n) {
  const groups = slide.decisionGroups;
  const cols = groups
    .map((g) => {
      const icon = g.icon && PATTERN_ICONS[g.icon] ? `<div class="dq-icon">${PATTERN_ICONS[g.icon]}</div>` : "";
      const actions = g.actions
        .map((a, i) => `<li><span class="dq-anum">${i + 1}</span><span>${esc(a)}</span></li>`)
        .join("");
      return `<div class="dq-col"><div class="dq-head"><span class="dq-num">${esc(g.number)}</span><span class="dq-context">${esc(g.context || "")}</span></div><div class="dq-body">${icon}<div class="dq-title">${esc(g.title)}</div><ol class="dq-actions">${actions}</ol></div></div>`;
    })
    .join("");
  const rec = slide.recommendation
    ? `<div class="dq-rec"><span class="dq-rec-tag">${esc(slide.recommendation.label || "推奨")}</span><span class="dq-rec-text">${esc(slide.recommendation.text)}</span></div>`
    : "";
  const steps = Array.isArray(slide.nextSteps) && slide.nextSteps.length
    ? `<div class="dq-steps"><div class="dq-steps-label">次のステップ</div><div class="dq-steps-row">${slide.nextSteps
        .map((s, i) => `<span class="dq-step"><span class="dq-step-num">${i + 1}</span>${esc(s)}</span>${i < slide.nextSteps.length - 1 ? '<span class="dq-arrow">&rsaquo;</span>' : ""}`)
        .join("")}</div></div>`
    : "";
  const bottom = rec || steps ? `<div class="dq-bottom${rec && steps ? "" : " single"}">${rec}${steps}</div>` : "";
  return shell(
    slide,
    n,
    `<div class="dq-wrap"><div class="dq-grid" style="grid-template-columns: repeat(${groups.length}, 1fr);">${cols}</div>${bottom}</div>`,
    { noTitleRule: true, className: "slide--top-align" },
  );
}

function renderDecision(slide, n) {
  if (Array.isArray(slide.decisionGroups)) return renderDecisionGroups(slide, n);
  const decisions = (slide.decisions || [])
    .map((d, i) => `<div class="decision-item"><div class="decision-num">${i + 1}</div><div>${esc(d)}</div></div>`)
    .join("");
  return shell(
    slide,
    n,
    `<div class="decision-layout"><div class="decision-ask"><div class="decision-ask-title">${esc((slide.headers||{}).recommended || "Recommended decision")}</div><div class="decision-ask-copy">${esc(slide.ask)}</div></div><div class="decision-list">${decisions}</div></div>`,
  );
}

function renderScr(slide, n) {
  const cols = (slide.scr || [])
    .map(
      (c) =>
        `<div class="scr-col"><span class="scr-tag">${esc(c.label)}</span><h3 class="scr-heading">${esc(c.heading)}</h3><p class="scr-copy">${esc(c.copy)}</p><p class="scr-note">${esc(c.note)}</p></div>`,
    )
    .join("");
  return shell(slide, n, `<div class="scr-grid">${cols}</div>`, { noTitleRule: true });
}

function dotClassFor(value) {
  const v = String(value || "").toLowerCase();
  if (v.startsWith("high") || v === "大") return "high";
  if (v.startsWith("med") || v === "中") return "med";
  return "low";
}

function renderAxisTable(slide, n) {
  const axis = slide.axis || { headers: [], rows: [] };
  const colCount = axis.headers.length;
  const weights = Array.isArray(axis.weights) && axis.weights.length === colCount ? axis.weights : null;
  const template = weights ? weights.map((w) => `${w}fr`).join(" ") : `repeat(${colCount}, minmax(0, 1fr))`;
  const flow = axis.flow === true;
  const rowBanner = axis.rowBanner === true;
  const dotCol = Number.isInteger(axis.dotColumn) ? axis.dotColumn : -1;
  const headers = axis.headers
    .map((h) => `<div class="axis-col-header"><div class="axis-header-label">${esc(h)}</div><div class="axis-header-rule"></div></div>`)
    .join("");
  // flow connectors as a precise overlay at column boundaries (avoids per-cell overflow)
  const GAP = 28;
  const wcols = weights || new Array(colCount).fill(1);
  const wtot = wcols.reduce((a, b) => a + b, 0) || 1;
  const flowArrows = [];
  let cum = 0;
  for (let i = 0; i < colCount - 1; i += 1) {
    cum += wcols[i];
    if (rowBanner && i === 0) continue;
    const frac = cum / wtot;
    const left = `calc(${frac.toFixed(4)} * (100% - ${(colCount - 1) * GAP}px) + ${i * GAP + GAP / 2}px)`;
    flowArrows.push(`<div class="axis-flow-arrow" style="left: ${left};" aria-hidden="true">&#8250;</div>`);
  }
  const overlay = flow && flowArrows.length ? `<div class="axis-flow-overlay">${flowArrows.join("")}</div>` : "";
  const rows = (axis.rows || [])
    .map((row) => {
      const cells = (row.cells || [])
        .map((cell, i) => {
          if (i === dotCol) {
            return `<div class="axis-cell axis-dot-cell"><span class="axis-dot ${dotClassFor(cell)}" aria-hidden="true"></span></div>`;
          }
          const classes = ["axis-cell"];
          const isBanner = i === 0 && rowBanner;
          if (i === 0) classes.push(isBanner ? "banner" : "label");
          if (row.highlight && !isBanner) classes.push("highlight");
          return `<div class="${classes.join(" ")}">${esc(cell)}</div>`;
        })
        .join("");
      return `<div class="axis-row">${cells}</div>`;
    })
    .join("");
  const legend = Array.isArray(axis.dotLegend) && axis.dotLegend.length
    ? `<div class="axis-dotlegend">${axis.dotLegend.map((label, i) => `<span class="axis-dot ${["high", "med", "low"][i] || "low"}"></span>${esc(label)}`).join("")}</div>`
    : "";
  const callout = axis.callout
    ? `<div class="axis-callout"><div class="axis-callout-text">${esc(axis.callout)}</div></div>`
    : "";
  return shell(
    slide,
    n,
    `${legend}${callout}<div class="axis-table-wrap">${overlay}<div class="axis-table" style="grid-template-columns: ${template};">${headers}${rows}</div></div>`,
    { noTitleRule: true },
  );
}

function renderIssueToSolution(slide, n) {
  const rows = (slide.mappings || [])
    .map(
      (m) =>
        `<div class="ism-row"><div class="ism-issue">${esc(m.issue)}</div><div class="ism-arrow"></div><div class="ism-solution"><div class="ism-solution-text">${esc(m.solution)}</div>${m.impact ? `<div class="ism-impact">${esc(m.impact)}</div>` : ""}</div></div>`,
    )
    .join("") + `<div class="ism-mark" aria-hidden="true">&#9654;</div>`;
  return shell(
    slide,
    n,
    `<div class="ism"><div class="ism-col-label">${esc((slide.headers||{}).issue || "Issue")}</div><div></div><div class="ism-col-label solution">${esc((slide.headers||{}).resolution || "Resolution")}</div>${rows}</div>`,
    { noTitleRule: true },
  );
}

function renderProcessFlow(slide, n) {
  const steps = slide.steps || [];
  const parts = [];
  steps.forEach((s, i) => {
    parts.push(
      `<div class="flow-step"><div class="flow-num">${i + 1}</div><h3 class="flow-title">${esc(s.title)}</h3><p class="flow-copy">${esc(s.copy || "")}</p></div>`,
    );
    if (i < steps.length - 1) parts.push(`<div class="flow-arrow" aria-hidden="true"><span class="flow-arrow-mark">&#8250;</span></div>`);
  });
  return shell(slide, n, `<div class="flow">${parts.join("")}</div>`, { noTitleRule: true });
}

function renderCycle(slide, n) {
  const steps = slide.steps || [];
  const cx = 50;
  const cy = 50;
  const rx = 33;
  const ry = 34;
  const step = (Math.PI * 2) / Math.max(steps.length, 1);
  const nodes = steps
    .map((s, i) => {
      const angle = step * i - Math.PI / 2;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      return `<div class="cycle-node" style="left: ${x.toFixed(1)}%; top: ${y.toFixed(1)}%;"><div class="flow-num">${i + 1}</div><h3 class="flow-title">${esc(s.title)}</h3><p class="flow-copy">${esc(s.copy || "")}</p></div>`;
    })
    .join("");
  const arrows = steps
    .map((_, i) => {
      const mid = step * (i + 0.5) - Math.PI / 2;
      const x = cx + rx * 0.62 * Math.cos(mid);
      const y = cy + ry * 0.62 * Math.sin(mid);
      const deg = ((mid + Math.PI / 2) * 180) / Math.PI;
      return `<div class="cycle-arrow-seg" style="left: ${x.toFixed(1)}%; top: ${y.toFixed(1)}%; transform: translate(-50%, -50%) rotate(${deg.toFixed(0)}deg);" aria-hidden="true">&#8250;</div>`;
    })
    .join("");
  return shell(slide, n, `<div class="cycle"><div class="cycle-ring" aria-hidden="true"></div>${arrows}${nodes}</div>`, {
    noTitleRule: true,
  });
}

function renderIssueCauseSolution(slide, n) {
  const stages = slide.stages || [];
  const parts = [];
  stages.forEach((s, i) => {
    parts.push(
      `<div class="ics-stage"><span class="ics-label">${esc(s.label)}</span><h3 class="ics-heading">${esc(s.heading)}</h3><p class="ics-copy">${esc(s.copy || "")}</p></div>`,
    );
    if (i < stages.length - 1) parts.push(`<div class="ics-arrow" aria-hidden="true">&#8594;</div>`);
  });
  return shell(slide, n, `<div class="ics">${parts.join("")}</div>`, { noTitleRule: true });
}

function renderCurrentTargetState(slide, n) {
  const panels = slide.panels || [];
  const panel = (p) => {
    const lettered = p.tone === "target";
    const items = (p.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
    return `<div class="cts-panel${p.tone === "target" ? " target" : ""}"><span class="cts-label">${esc(p.label)}</span>${p.heading ? `<h3 class="cts-heading">${esc(p.heading)}</h3>` : ""}<ul class="cts-list${lettered ? " lettered" : ""}">${items}</ul></div>`;
  };
  const left = panels[0] ? panel(panels[0]) : "<div></div>";
  const right = panels[1] ? panel(panels[1]) : "<div></div>";
  return shell(
    slide,
    n,
    `<div class="cts">${left}<div class="cts-arrow" aria-hidden="true">&#8250;</div>${right}</div>`,
    { noTitleRule: true },
  );
}

function renderDecisionFork(slide, n) {
  const fork = slide.fork || { branches: [] };
  const branches = (fork.branches || [])
    .map(
      (b) =>
        `<div class="fork-branch${b.recommended ? " recommended" : ""}"><h3 class="fork-branch-label">${esc(b.label)}</h3><p class="fork-branch-copy">${esc(b.copy || "")}</p>${b.outcome ? `<p class="fork-branch-outcome">${esc(b.outcome)}</p>` : ""}</div>`,
    )
    .join("");
  return shell(
    slide,
    n,
    `<div class="fork"><div class="fork-q">${esc(fork.question)}</div><div class="fork-branches">${branches}</div></div>`,
    { noTitleRule: true },
  );
}

function renderHeatmap(slide, n) {
  const hm = slide.heatmap || { colHeaders: [], rows: [] };
  const cols = hm.colHeaders.length;
  const template = `1.4fr repeat(${cols}, minmax(0, 1fr))`;
  const cells = [`<div class="heat-corner">${esc(hm.rowLabel || "")}</div>`];
  hm.colHeaders.forEach((h) => cells.push(`<div class="heat-colhead">${esc(h)}</div>`));
  (hm.rows || []).forEach((row) => {
    cells.push(`<div class="heat-rowhead">${esc(row.label)}</div>`);
    (row.cells || []).forEach((c) => {
      cells.push(`<div class="heat-cell lvl-${c.level}">${esc(c.text || "")}</div>`);
    });
  });
  const legend = (hm.legend || [])
    .map((label, i) => `<div class="legend-item"><span class="legend-swatch lvl-${i}" style="background: ${["#fff", "var(--soft-blue)", "var(--cyan)", "var(--blue)"][i] || "#fff"};"></span>${esc(label)}</div>`)
    .join("");
  return shell(
    slide,
    n,
    `<div class="heat" style="grid-template-columns: ${template};">${cells.join("")}</div>${legend ? `<div class="heat-legend">${legend}</div>` : ""}`,
    { noTitleRule: true },
  );
}

function renderTimelineMatrix(slide, n) {
  const lanes = slide.lanes || { columns: [], rows: [] };
  const cols = lanes.columns.length;
  const template = `1fr repeat(${cols}, minmax(0, 1.4fr))`;
  const cells = [`<div class="tlm-colhead">${esc((slide.headers||{}).phase || "Phase")}</div>`];
  lanes.columns.forEach((c) => cells.push(`<div class="tlm-colhead">${esc(c)}</div>`));
  (lanes.rows || []).forEach((row) => {
    cells.push(`<div class="tlm-period">${esc(row.period)}</div>`);
    (row.cells || []).forEach((c) => cells.push(`<div class="tlm-cell">${esc(c)}</div>`));
  });
  return shell(slide, n, `<div class="tlm" style="grid-template-columns: ${template};">${cells.join("")}</div>`, {
    noTitleRule: true,
  });
}

function renderProcessMatrix(slide, n) {
  const grid = slide.grid || { colHeaders: [], rows: [] };
  const cols = grid.colHeaders.length;
  const template = `1.2fr repeat(${cols}, minmax(0, 1fr))`;
  const cells = [`<div class="pmx-corner">${esc(grid.rowLabel || "")}</div>`];
  grid.colHeaders.forEach((h) => cells.push(`<div class="pmx-colhead">${esc(h)}</div>`));
  (grid.rows || []).forEach((row) => {
    cells.push(`<div class="pmx-rowhead">${esc(row.label)}</div>`);
    (row.cells || []).forEach((c) => cells.push(`<div class="pmx-cell${c ? "" : " empty"}">${esc(c || "")}</div>`));
  });
  return shell(slide, n, `<div class="pmx" style="grid-template-columns: ${template};">${cells.join("")}</div>`, {
    noTitleRule: true,
  });
}

function renderStackedBar(slide, n) {
  const stacks = slide.stacks || { categories: [] };
  const totals = stacks.categories.map((c) => (c.segments || []).reduce((a, s) => a + s.value, 0));
  const max = Math.max(...totals, 1);
  const cols = stacks.categories
    .map((c) => {
      const segs = (c.segments || [])
        .map((s, i) => `<div class="stack-seg s${i}" style="height: ${Math.round((s.value / max) * 330)}px;">${s.value}</div>`)
        .join("");
      return `<div><div class="stack-col">${segs}</div><div class="stack-col-label">${esc(c.label)}</div></div>`;
    })
    .join("");
  const legend = (stacks.legend || [])
    .map((label, i) => `<div class="legend-item"><span class="legend-swatch s${i}"></span>${esc(label)}</div>`)
    .join("");
  return shell(
    slide,
    n,
    `<div class="chart-unit">${esc(stacks.unit || "")}</div><div class="stack-chart">${cols}</div>${legend ? `<div class="stack-legend">${legend}</div>` : ""}`,
    { noTitleRule: true },
  );
}

function waterfallPoints(series) {
  let running = 0;
  return series.map((d) => {
    const mag = Math.abs(d.value);
    if (d.kind === "total" || d.kind === "base") {
      running = d.value;
      return { label: d.label, kind: d.kind, bottom: 0, top: d.value, display: `${d.value}` };
    }
    if (d.kind === "down") {
      const top = running;
      const bottom = running - mag;
      running = bottom;
      return { label: d.label, kind: "down", bottom, top, display: `−${mag}` };
    }
    const bottom = running;
    running += mag;
    return { label: d.label, kind: "up", bottom, top: running, display: `+${mag}` };
  });
}

function renderTrueWaterfall(slide, n) {
  const points = waterfallPoints(slide.chart?.series || []);
  const domainMin = Math.min(0, ...points.map((p) => p.bottom));
  const domainMax = Math.max(1, ...points.map((p) => p.top));
  const range = domainMax - domainMin || 1;
  const H = 300;
  const bars = points
    .map((p) => {
      const h = ((p.top - p.bottom) / range) * H;
      const pad = ((p.bottom - domainMin) / range) * H;
      return `<div class="twf-col"><div class="twf-value">${esc(p.display)}</div><div class="twf-bar ${p.kind || "base"}" style="height: ${Math.round(h)}px; margin-bottom: ${Math.round(pad)}px;"></div><div class="twf-label">${esc(p.label)}</div></div>`;
    })
    .join("");
  return shell(
    slide,
    n,
    `<div class="chart-unit">${esc(slide.chart?.unit || "")}</div><div class="twf">${bars}</div>`,
    { noTitleRule: true },
  );
}

function renderCauseEffect(slide, n) {
  const ce = slide.causeEffect || { causes: [] };
  const causes = (ce.causes || [])
    .map(
      (c) =>
        `<div class="ce-cause"><div class="ce-cause-label">${esc(c.label)}</div>${c.detail ? `<div class="ce-cause-detail">${esc(c.detail)}</div>` : ""}</div>`,
    )
    .join("");
  return shell(
    slide,
    n,
    `<div class="ce"><div class="ce-causes">${causes}</div><div class="ce-arrow" aria-hidden="true">&#8594;</div><div class="ce-effect"><div class="ce-effect-label">${esc((slide.headers || {}).effect || "Effect")}</div><div class="ce-effect-text">${esc(ce.effect)}</div></div></div>`,
    { noTitleRule: true },
  );
}

function renderChevronRail(slide, n) {
  const steps = slide.steps || [];
  const chevrons = steps
    .map(
      (s, i) =>
        `<div class="chev${i === 0 ? " first" : ""}"><div class="chev-num">${i + 1}</div><div class="chev-body"><div class="chev-title">${esc(s.title)}</div>${s.copy ? `<div class="chev-copy">${esc(s.copy)}</div>` : ""}</div></div>`,
    )
    .join("");
  return shell(slide, n, `<div class="chev-rail">${chevrons}</div>`, { noTitleRule: true });
}

function renderGantt(slide, n) {
  const g = slide.gantt || { periods: [], rows: [] };
  const cols = g.periods.length || 1;
  const rows = g.rows || [];
  const bands = g.periodBands || [];
  const milestones = g.milestones || [];
  const monthPct = 100 / cols;

  // group consecutive rows that share the same `group` label
  const groups = [];
  rows.forEach((r) => {
    const key = r.group || "";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, rows: [r] });
  });

  const parts = [];
  let gr = 1;

  if (bands.length) {
    parts.push(`<div class="g2-corner" style="grid-row:${gr}; grid-column:1/3;"></div>`);
    const bandCells = bands.map((b) => `<div class="g2-band" style="grid-column: span ${b.span};">${esc(b.label)}</div>`).join("");
    parts.push(`<div class="g2-bandrow" style="grid-row:${gr}; grid-column:3; grid-template-columns: repeat(${cols}, 1fr);">${bandCells}</div>`);
    gr += 1;
  }
  parts.push(`<div class="g2-corner" style="grid-row:${gr}; grid-column:1/3;"></div>`);
  const monthCells = g.periods.map((p) => `<div class="g2-month">${esc(p)}</div>`).join("");
  parts.push(`<div class="g2-monthrow" style="grid-row:${gr}; grid-column:3; grid-template-columns: repeat(${cols}, 1fr);">${monthCells}</div>`);
  gr += 1;

  if (milestones.length) {
    parts.push(`<div class="g2-corner g2-mscorner" style="grid-row:${gr}; grid-column:1/3;">${esc((slide.headers||{}).milestone || "Milestone")}</div>`);
    const ms = milestones
      .map((m) => `<div class="g2-ms" style="left:${((m.at + 0.5) * monthPct).toFixed(2)}%;"><div class="g2-diamond" aria-hidden="true">&#9650;</div><div class="g2-mslab">${esc(m.label)}</div></div>`)
      .join("");
    parts.push(`<div class="g2-msrow" style="grid-row:${gr}; grid-column:3;">${ms}</div>`);
    gr += 1;
  }

  groups.forEach((group) => {
    const first = gr;
    group.rows.forEach((r, idx) => {
      if (idx === 0 && group.key) {
        parts.push(`<div class="g2-group" style="grid-row:${first} / span ${group.rows.length}; grid-column:1;">${esc(group.key)}</div>`);
      } else if (idx === 0) {
        parts.push(`<div class="g2-group" style="grid-row:${first} / span ${group.rows.length}; grid-column:1;"></div>`);
      }
      parts.push(`<div class="g2-rowlabel" style="grid-row:${gr}; grid-column:2;">${esc(r.label)}</div>`);
      const left = (r.start / cols) * 100;
      const width = (r.span / cols) * 100;
      const cls = `g2-bar ${esc(r.phase || "build")}${r.ongoing ? " ongoing" : ""}`;
      parts.push(`<div class="g2-track" style="grid-row:${gr}; grid-column:3; --gcols:${cols};"><div class="${cls}" style="left:${left}%; width:${width}%;"></div></div>`);
      gr += 1;
    });
  });

  return shell(slide, n, `<div class="gantt2">${parts.join("")}</div>`, { noTitleRule: true });
}

function normTreeNode(c) {
  return typeof c === "string" ? { label: c } : c || { label: "" };
}
function renderTreeNode(node, depth) {
  const kids = Array.isArray(node.children) ? node.children.map(normTreeNode) : [];
  const hasKids = kids.length > 0;
  const box = `<div class="ltree-box ltree-l${depth}${hasKids ? " has-children" : ""}">${esc(node.label)}</div>`;
  const childrenHtml = hasKids
    ? `<div class="ltree-children">${kids.map((c) => renderTreeNode(c, depth + 1)).join("")}</div>`
    : "";
  return `<div class="ltree-node">${box}${childrenHtml}</div>`;
}
function renderIssueTree(slide, n) {
  // Recursive horizontal MECE logic tree. root = level 1; branches nest to any depth.
  const t = slide.tree || { branches: [] };
  const rootNode = { label: t.root, children: t.branches || [] };
  return shell(slide, n, `<div class="ltree">${renderTreeNode(rootNode, 1)}</div>`);
}

// 3/4 KPI sit in one row; 5 wraps to a 3+2 pair of rows rather than 5 cramped equal columns
// (RP-KPI-EXEC-DASHBOARD-01's own adaptive rule — this is Renderer geometry, the Pattern
// Selector never decides it).
function kpiRows(kpis) {
  if (kpis.length <= 4) return [kpis];
  return [kpis.slice(0, 3), kpis.slice(3)];
}

// Fixed, monochrome (stroke=currentColor) line icons shared across Library v0.2 patterns —
// deliberately not a general/open icon library: each entry exists because a reference image
// used exactly that concept (RP-KPI-EXEC-DASHBOARD-01: bar-chart/coins/pie/cycle;
// RP-DECISION-ASK-01: org-chart/people, reusing bar-chart), and staying to a small closed set
// keeps every icon this renderer can produce house-style-reviewed rather than open-ended.
const PATTERN_ICONS = {
  "bar-chart": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="12" width="4" height="8"/><rect x="10" y="7" width="4" height="13"/><rect x="16" y="3" width="4" height="17"/></svg>',
  coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/></svg>',
  pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 12 L12 3 A9 9 0 0 1 19.36 16.5 Z"/></svg>',
  cycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M17 3v4h-4M7 21v-4h4"/></svg>',
  "org-chart": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="4.5" r="2.3"/><path d="M12 6.8v4M5 15v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="19" cy="18" r="2"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8" r="2.6"/><path d="M3 19v-1.5A4.5 4.5 0 0 1 7.5 13h2A4.5 4.5 0 0 1 14 17.5V19"/><circle cx="17" cy="9" r="2.2"/><path d="M14.5 19v-1a3.8 3.8 0 0 1 6.5-2.7"/></svg>',
  // A ring (the gear body) with short teeth stubs is what reads as a "gear," not a sun —
  // an earlier version had only a small center dot with long spokes, which looked like a
  // sun/brightness icon when actually rendered (caught by zooming into a real screenshot,
  // not assumed from the SVG source).
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><g stroke-width="2.2"><line x1="12" y1="3.2" x2="12" y2="5.6"/><line x1="12" y1="18.4" x2="12" y2="20.8"/><line x1="3.2" y1="12" x2="5.6" y2="12"/><line x1="18.4" y1="12" x2="20.8" y2="12"/><line x1="5.5" y1="5.5" x2="7.3" y2="7.3"/><line x1="16.7" y1="16.7" x2="18.5" y2="18.5"/><line x1="5.5" y1="18.5" x2="7.3" y2="16.7"/><line x1="16.7" y1="7.3" x2="18.5" y2="5.5"/></g></svg>',
  // RP-MATRIX-BADGELIST-01's own closed icon vocabulary (person/laptop/tag/cart/truck are new
  // — bar-chart/people above are reused as-is).
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.3"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/></svg>',
  laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="10" rx="1"/><path d="M2 19.5h20l-1.6-2.2a1 1 0 0 0-.8-.3H4.4a1 1 0 0 0-.8.3z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3h7a2 2 0 0 1 2 2v7a1 1 0 0 1-.3.7l-8 8a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1 0-1.4l8-8A1 1 0 0 1 11 3Z"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20.5 8H6"/><circle cx="9.5" cy="20" r="1.3" fill="currentColor" stroke="none"/><circle cx="17" cy="20" r="1.3" fill="currentColor" stroke="none"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="13" height="9"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="18.5" r="1.6" fill="currentColor" stroke="none"/></svg>',
  // Decorative header icon for the Matrix Badge List insights panel — not part of any
  // per-item closed vocabulary.
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M8.5 14.6A5.5 5.5 0 1 1 15.5 14.6c-.75.9-1.5 1.6-1.5 2.9H10c0-1.3-.75-2-1.5-2.9Z"/></svg>',
  // RP-100DAY-WORKSTREAM-01's own activity-icon closed vocabulary (target/search/trending-up/
  // handshake/document are new — org-chart/gear/bar-chart above are reused as-is).
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/></svg>',
  "trending-up": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-9"/><path d="M15 5h6v6"/></svg>',
  handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12.5l4.5-3.5 3 2.2-2 2.3 2.3 2-1.4 1.8"/><path d="M22 12.5l-4.5-3.5-3 2.2 2 2.3-2.3 2 1.4 1.8"/></svg>',
  document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M15 2v3h3"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>',
};

function kpiTileHtml(k) {
  const unit = k.unit ? `<span class="kpi-unit">${esc(k.unit)}</span>` : "";
  const icon = k.icon && PATTERN_ICONS[k.icon] ? `<div class="kpi-icon">${PATTERN_ICONS[k.icon]}</div>` : "";
  const head = `<div class="kpi-head">${icon}<div class="kpi-headtext"><div class="kpi-label">${esc(k.label)}</div>${k.context ? `<div class="kpi-context">${esc(k.context)}</div>` : ""}</div></div>`;
  const spark = Array.isArray(k.spark) && k.spark.length >= 2 ? renderKpiSpark(k.spark) : "";
  return `<div class="kpi-tile">${head}<div class="kpi-value">${esc(k.value)}${unit}</div>${k.delta ? `<div class="kpi-delta">${esc(k.delta)}</div>` : ""}${spark}${k.note ? `<div class="kpi-note">${esc(k.note)}</div>` : ""}</div>`;
}

function renderKpiSpark(values) {
  const max = Math.max(...values, 1);
  const bars = values
    .map((v, i) => `<div class="kpi-spark-bar${i === values.length - 1 ? " last" : ""}" style="height: ${Math.max(Math.round((v / max) * 100), 4)}%;"></div>`)
    .join("");
  return `<div class="kpi-spark">${bars}</div>`;
}

function renderKpiKeyMessage(text) {
  return `<div class="kpi-keymessage">${esc(text)}</div>`;
}

// 1-2 bar series (grouped per period, left scale) + an optional line series (its OWN scale,
// drawn as an SVG overlay so it can read on a visually distinct right axis without needing to
// share the bars' scale — unlike chart_insight, this is deliberately 2 independent scales,
// since a margin % and a revenue ¥ series are never comparable on one axis).
function renderKpiTrendChart(chart) {
  const n = chart.periods.length;
  const barMax = Math.max(...chart.bars.flatMap((b) => b.values), 1);
  const cols = chart.periods
    .map((_, i) => {
      const bars = chart.bars
        .map((b, bi) => {
          const v = b.values[i] ?? 0;
          const cls = bi === 0 ? "bar1" : "bar2";
          return `<div class="kt-bar-wrap"><div class="kt-value">${esc(v)}</div><div class="kt-bar ${cls}" style="height: ${Math.round((v / barMax) * 100)}%;"></div></div>`;
        })
        .join("");
      return `<div class="kt-col">${bars}</div>`;
    })
    .join("");
  let lineOverlay = "";
  if (chart.line && chart.line.values.length === n) {
    // Padded (not zero-anchored) range: a margin-% line moving 27->32 is meant to read as a
    // distinct trend of its own, not get flattened against a 0 baseline the way the bars
    // (a real quantity) deliberately are — this is a rate series with its own right axis, so
    // it earns the same "use the full plot height" treatment a real chart-of-just-that-line
    // would get.
    const lineMax = Math.max(...chart.line.values);
    const lineMin = Math.min(...chart.line.values);
    const pad = (lineMax - lineMin) * 0.25 || 1;
    const paddedMax = lineMax + pad;
    const paddedMin = lineMin - pad;
    const range = paddedMax - paddedMin;
    const colWPx = 1000 / n;
    const points = chart.line.values.map((v, i) => {
      const x = colWPx * i + colWPx / 2;
      const y = 300 - ((v - paddedMin) / range) * 300;
      return { x, y };
    });
    const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--blue)" />`).join("");
    lineOverlay = `<svg class="kt-line-overlay" viewBox="0 0 1000 300" preserveAspectRatio="none"><polyline points="${polyline}" fill="none" stroke="var(--blue)" stroke-width="2.5" />${dots}</svg>`;
  }
  const legendItems = [
    ...chart.bars.map((b, i) => `<div class="kt-legend-item"><span class="kt-swatch ${i === 0 ? "bar1" : "bar2"}"></span>${esc(b.label)}</div>`),
    ...(chart.line ? [`<div class="kt-legend-item"><span class="kt-swatch line"></span>${esc(chart.line.label)}</div>`] : []),
  ].join("");
  const periods = chart.periods.map((p) => `<div class="kt-label">${esc(p)}</div>`).join("");
  return `<div class="kpi-trend"><div class="section-label">${esc(chart.unit || "")}</div><div class="kt-legend">${legendItems}</div><div class="kt-chart"><div class="kt-plot">${cols}${lineOverlay}</div><div class="kt-periods">${periods}</div></div></div>`;
}

function renderKpiInsights(insights) {
  const items = insights.items.map((item, i) => `<li><span class="ki-num">${i + 1}</span><span>${esc(item)}</span></li>`).join("");
  return `<div class="kpi-insights"><div class="section-label">${esc(insights.title || "示唆")}</div><ol class="ki-list">${items}</ol></div>`;
}

function renderKpiDashboard(slide, n) {
  const keyMessage = slide.keyMessage ? renderKpiKeyMessage(slide.keyMessage) : "";
  const rows = kpiRows(slide.kpis || [])
    .map((row) => `<div class="kpi-grid" style="grid-template-columns: repeat(${row.length}, 1fr);">${row.map(kpiTileHtml).join("")}</div>`)
    .join("");
  const hasSupport = slide.trendChart || slide.insights;
  const support = hasSupport
    ? `<div class="kpi-support${slide.trendChart && slide.insights ? "" : " single"}">${slide.trendChart ? renderKpiTrendChart(slide.trendChart) : ""}${slide.insights ? renderKpiInsights(slide.insights) : ""}</div>`
    : "";
  return shell(slide, n, `<div class="kpi-dashboard">${keyMessage}${rows}${support}</div>`, { noTitleRule: true });
}

// N-column mode (RP-KEY-TAKEAWAYS-01): each takeaway is its own column — navy header band
// (number + category), icon + bold headline, then a labeled support line — plus a MANDATORY
// right-side insight panel (numbered title+body items) and a MANDATORY bottom So What chevron
// bar. Both are mandatory (not optional, unlike decision_page's recommendation/nextSteps)
// because omitting either is exactly this pattern degenerating into 3 plain cards — which
// already has its own, simpler template (the existing flat `sections` shape below). Used when
// the spec authors `takeaways` instead of `sections`.
function renderKeyTakeaways(slide, n) {
  const cols = slide.takeaways
    .map((t) => {
      const icon = t.icon && PATTERN_ICONS[t.icon] ? `<div class="kt2-icon">${PATTERN_ICONS[t.icon]}</div>` : "";
      return `<div class="kt2-col"><div class="kt2-head"><span class="kt2-num">${esc(t.number)}</span><span class="kt2-category">${esc(t.category)}</span></div><div class="kt2-body">${icon}<div class="kt2-headline">${esc(t.headline)}</div><div class="kt2-hr"></div><div class="kt2-supportlabel">${esc(t.supportLabel || "サポートする示唆")}</div><div class="kt2-supporttext">${esc(t.supportText)}</div></div></div>`;
    })
    .join("");
  const panel = slide.insightPanel;
  const items = panel.items
    .map((it) => `<li><span class="ki-num">${esc(it.number)}</span><div><div class="kt2-insight-title">${esc(it.title)}</div><div class="kt2-insight-body">${esc(it.body)}</div></div></li>`)
    .join("");
  const insightPanel = `<div class="kt2-panel"><div class="kt2-panel-title">${esc(panel.title || "示唆")}</div><ol class="kt2-panel-list">${items}</ol></div>`;
  const sw = slide.soWhat;
  const soWhat = `<div class="kt2-sowhat"><span class="kt2-sowhat-tag">${esc(sw.label || "So What")}</span><span class="kt2-sowhat-text">${esc(sw.text)}</span></div>`;
  return shell(
    slide,
    n,
    `<div class="kt2-wrap"><div class="kt2-top"><div class="kt2-grid" style="grid-template-columns: repeat(${slide.takeaways.length}, 1fr);">${cols}</div>${insightPanel}</div>${soWhat}</div>`,
    { noTitleRule: true, className: "slide--top-align" },
  );
}

function renderRecommendationPillars(slide, n) {
  if (Array.isArray(slide.takeaways)) return renderKeyTakeaways(slide, n);
  const pillars = (slide.sections || [])
    .map((p, i) => {
      const bullets = (p.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
      return `<div class="pillar"><div class="pillar-num">${i + 1}</div><div class="pillar-title">${esc(p.title)}</div>${p.copy ? `<div class="pillar-copy">${esc(p.copy)}</div>` : ""}${bullets ? `<ul class="pillar-bullets">${bullets}</ul>` : ""}</div>`;
    })
    .join("");
  return shell(slide, n, `<div class="pillars">${pillars}</div>`, { noTitleRule: true });
}

function renderSmallMultiples(slide, n) {
  // Small multiples must share ONE scale across panels so magnitudes are comparable.
  const globalMax = Math.max(...(slide.multiples || []).flatMap((m) => m.series.map((d) => d.value)), 1);
  const charts = (slide.multiples || [])
    .map((m) => {
      const max = globalMax;
      const bars = m.series
        .map((d) => `<div class="sm-bar-wrap"><div class="sm-bar" style="height: ${Math.round((d.value / max) * 88)}%;"></div><div class="sm-bar-label">${esc(d.label)}</div></div>`)
        .join("");
      return `<div class="sm-panel"><div class="sm-title">${esc(m.label)}</div><div class="sm-chart">${bars}</div></div>`;
    })
    .join("");
  return shell(slide, n, `<div class="sm-grid">${charts}</div>`, { noTitleRule: true });
}

function renderNestedRowMatrix(slide, n) {
  const groups = (slide.nested || {}).groups || [];
  const parts = [];
  let gr = 1;
  groups.forEach((group) => {
    const first = gr;
    group.rows.forEach((r, idx) => {
      if (idx === 0) parts.push(`<div class="nrm-group" style="grid-row:${first} / span ${group.rows.length}; grid-column:1;">${esc(group.label)}</div>`);
      parts.push(`<div class="nrm-rowlabel" style="grid-row:${gr}; grid-column:2;">${esc(r.label)}</div>`);
      const bullets = (r.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
      const content = `${r.copy ? `<div class="nrm-copy">${esc(r.copy)}</div>` : ""}${bullets ? `<ul class="nrm-bullets">${bullets}</ul>` : ""}`;
      parts.push(`<div class="nrm-content" style="grid-row:${gr}; grid-column:3;">${content}</div>`);
      gr += 1;
    });
  });
  return shell(slide, n, `<div class="nrm">${parts.join("")}</div>`, { noTitleRule: true });
}

function renderCalcFlow(slide, n) {
  const c = slide.calc || { panels: [] };
  const panels = c.panels || [];
  const opGlyph = { x: "&#215;", eq: "=", arrow: "&#8250;" };
  const body = panels
    .map((p) => {
      const cats = p.categories || [];
      const totals = cats.map((cat) => (cat.segments || []).reduce((a, s) => a + s.value, 0));
      const max = Math.max(...totals, 1);
      const cols = cats
        .map((cat) => {
          const segs = (cat.segments || [])
            .map((s, si) => {
              const h = Math.round((s.value / max) * 120);
              return `<div class="stack-seg s${si}" style="height: ${h}px;">${h >= 16 ? esc(s.value) : ""}</div>`;
            })
            .join("");
          return `<div><div class="stack-col">${segs}</div><div class="stack-col-label">${esc(cat.label)}</div></div>`;
        })
        .join("");
      const op = p.op ? `<div class="cf-op" aria-hidden="true">${opGlyph[p.op] || "&#8250;"}</div>` : "";
      return `${op}<div class="cf-panel"><div class="cf-panel-label">${esc(p.label)}</div><div class="cf-chart">${cols}</div></div>`;
    })
    .join("");
  const legend = Array.isArray(c.legend) && c.legend.length
    ? `<div class="stack-legend">${c.legend.map((label, i) => `<div class="legend-item"><span class="legend-swatch s${i}"></span>${esc(label)}</div>`).join("")}</div>`
    : "";
  const unit = c.unit ? `<div class="chart-unit">${esc(c.unit)}</div>` : "";
  return shell(slide, n, `${unit}<div class="cf">${body}</div>${legend}`, { noTitleRule: true });
}

function renderChevronValueChain(slide, n) {
  const vc = slide.valueChain || { rails: [] };
  const rails = vc.rails || [];
  const attrs = vc.attributes || [];
  const stepCount = Math.max(0, ...rails.map((r) => (r.steps || []).length)) || 1;
  const hasLabels = rails.some((r) => r.label) || attrs.length > 0;
  const colTemplate = hasLabels ? `1fr repeat(${stepCount}, 1.5fr)` : `repeat(${stepCount}, 1fr)`;
  const parts = [];
  let gr = 1;
  rails.forEach((rail, ri) => {
    const tone = rail.tone || (ri === 0 ? "primary" : "alt");
    if (hasLabels) parts.push(`<div class="cvc-lane" style="grid-row:${gr}; grid-column:1;">${esc(rail.label || "")}</div>`);
    (rail.steps || []).forEach((s, ci) => {
      const col = hasLabels ? ci + 2 : ci + 1;
      const first = ci === 0 ? " first" : "";
      parts.push(`<div class="cvc-chev ${tone}${first}" style="grid-row:${gr}; grid-column:${col};">${esc(s.label)}</div>`);
    });
    gr += 1;
    if ((rail.steps || []).some((s) => s.description)) {
      if (hasLabels) parts.push(`<div style="grid-row:${gr}; grid-column:1;"></div>`);
      (rail.steps || []).forEach((s, ci) => {
        const col = hasLabels ? ci + 2 : ci + 1;
        parts.push(`<div class="cvc-desc" style="grid-row:${gr}; grid-column:${col};">${s.description ? esc(s.description) : ""}</div>`);
      });
      gr += 1;
    }
  });
  attrs.forEach((a) => {
    parts.push(`<div class="cvc-attr-label" style="grid-row:${gr}; grid-column:1;">${esc(a.label)}</div>`);
    (a.values || []).forEach((v, ci) => {
      const col = hasLabels ? ci + 2 : ci + 1;
      parts.push(`<div class="cvc-attr-val" style="grid-row:${gr}; grid-column:${col};">${esc(v)}</div>`);
    });
    gr += 1;
  });
  return shell(slide, n, `<div class="cvc" style="grid-template-columns:${colTemplate};">${parts.join("")}</div>`, { noTitleRule: true });
}

/* ===== additional archetypes =====
   Shared grammar: the claim lives
   in the title, the metric definition sits on its own subtitle line, and the
   number is the only coloured object on the page. */

function renderBigStatPair(slide, n) {
  const stats = (slide.kpis || [])
    .slice(0, 3)
    .map(
      (k) =>
        `<div class="bigstat"><div class="bigstat-value">${esc(k.value)}</div><div class="bigstat-label">${esc(k.label)}</div>${k.note ? `<div class="bigstat-note">${esc(k.note)}</div>` : ""}</div>`,
    )
    .join("");
  return shell(slide, n, `<div class="bigstats">${stats}</div>`);
}

function renderNumberedImperatives(slide, n) {
  const cols = (slide.sections || [])
    .map(
      (s, i) =>
        `<div class="imp"><div class="imp-num">${i + 1}</div><div class="imp-rule"></div><div class="imp-title">${esc(s.title)}</div>${s.copy ? `<div class="imp-copy">${esc(s.copy)}</div>` : ""}</div>`,
    )
    .join("");
  return shell(slide, n, `<div class="imps">${cols}</div>`);
}

function renderThemeCardGrid(slide, n) {
  const cards = (slide.sections || [])
    .map(
      (s) =>
        `<div class="theme-card">${s.label ? `<div class="theme-band">${esc(s.label)}</div>` : ""}<div class="theme-title">${esc(s.title)}</div>${s.copy ? `<div class="theme-copy">${esc(s.copy)}</div>` : ""}${s.value ? `<div class="theme-value">${esc(s.value)}</div>` : ""}</div>`,
    )
    .join("");
  return shell(slide, n, `<div class="theme-grid">${cards}</div>`);
}

function renderQuestionFramework(slide, n) {
  const areas = [...new Set((slide.sections || []).map((s) => s.label).filter(Boolean))];
  const side = areas.map((a) => `<div class="qf-area">${esc(a)}</div>`).join("");
  const items = (slide.sections || [])
    .map(
      (s, i) =>
        `<div class="qf-item"><div class="qf-head"><span class="qf-num">${i + 1}</span>${esc(s.title)}</div>${s.copy ? `<div class="qf-q">${esc(s.copy)}</div>` : ""}</div>`,
    )
    .join("");
  return shell(slide, n, `<div class="qf">${side ? `<div class="qf-side">${side}</div>` : ""}<div class="qf-main">${items}</div></div>`);
}

function renderEvidenceBasis(slide, n) {
  // This archetype owns `subtitle`: it is the "why we did this" column, not a metric line.
  const rows = (slide.sections || [])
    .map(
      (s) =>
        `<div class="basis-row"><div class="basis-value">${esc(s.value || "")}</div><div class="basis-copy">${esc(s.copy || s.title)}</div></div>`,
    )
    .join("");
  const why = slide.subtitle ? `<div class="basis-why">${esc(slide.subtitle)}</div>` : "";
  return shell(slide, n, `<div class="basis">${why}<div class="basis-rows">${rows}</div></div>`, { ownSubtitle: true });
}

function renderGenericParts(slide, n) {
  // プラグイン型の汎用プレビュー: parts の中身を見出し＋箇条書きで並べる（レイアウトの再現は PPTX 側が正）
  const parts = slide.parts || {};
  const block = (k, v) => {
    if (v == null) return "";
    if (Array.isArray(v)) {
      const lis = v.map((x) => `<li>${esc(typeof x === "object" ? Object.values(x).filter((y) => typeof y !== "object").join(" ／ ") : x)}</li>`).join("");
      return `<div><div class="section-label">${esc(k)}</div><ul class="body-copy">${lis}</ul></div>`;
    }
    if (typeof v === "object") return `<div><div class="section-label">${esc(k)}</div><div class="body-copy">${esc(Object.entries(v).map(([a, b]) => `${a}: ${b}`).join(" ／ "))}</div></div>`;
    return `<div><div class="section-label">${esc(k)}</div><div class="body-copy">${esc(v)}</div></div>`;
  };
  const cols = Object.entries(parts).map(([k, v]) => block(k, v)).join("");
  return shell(slide, n, `<div class="three-col">${cols || '<div class="body-copy">（parts なし）</div>'}</div>`);
}

function renderSlide(slide, n) {
  if (ARCHETYPES.has(slide.template)) {
    const mod = ARCHETYPES.get(slide.template);
    const ctx = { esc, shell, footer, titleHtml, spec, TEMPLATE_MODE: !!process.env.TEMPLATE_MODE };
    return typeof mod.html === "function" ? mod.html(ctx, slide, n) : renderGenericParts(slide, n);
  }
  switch (slide.template) {
    case "cover":
      return renderCover(slide, n);
    case "executive_summary":
      return renderExecutiveSummary(slide, n);
    case "chart_insight":
      return renderChartInsight(slide, n);
    case "matrix_2x2":
      return renderMatrix(slide, n);
    case "workstream_100day":
      return renderWorkstream100Day(slide, n);
    case "waterfall":
      return renderWaterfall(slide, n);
    case "comparison_table":
      return renderComparison(slide, n);
    case "scenario_table":
      return renderScenario(slide, n);
    case "risk_table":
      return renderRisk(slide, n);
    case "roadmap":
      return renderRoadmap(slide, n);
    case "decision_page":
      return renderDecision(slide, n);
    case "scr":
      return renderScr(slide, n);
    case "horizontal_axis_table":
      return renderAxisTable(slide, n);
    case "issue_to_solution_map":
      return renderIssueToSolution(slide, n);
    case "process_flow":
      return renderProcessFlow(slide, n);
    case "cycle":
      return renderCycle(slide, n);
    case "issue_cause_solution":
      return renderIssueCauseSolution(slide, n);
    case "current_target_state":
      return renderCurrentTargetState(slide, n);
    case "decision_fork":
      return renderDecisionFork(slide, n);
    case "heatmap_table":
      return renderHeatmap(slide, n);
    case "timeline_matrix":
      return renderTimelineMatrix(slide, n);
    case "process_matrix":
      return renderProcessMatrix(slide, n);
    case "stacked_bar":
      return renderStackedBar(slide, n);
    case "true_waterfall":
      return renderTrueWaterfall(slide, n);
    case "cause_effect":
      return renderCauseEffect(slide, n);
    case "chevron_rail":
      return renderChevronRail(slide, n);
    case "gantt":
      return renderGantt(slide, n);
    case "issue_tree":
      return renderIssueTree(slide, n);
    case "kpi_dashboard":
      return renderKpiDashboard(slide, n);
    case "recommendation_pillars":
      return renderRecommendationPillars(slide, n);
    case "small_multiples":
      return renderSmallMultiples(slide, n);
    case "nested_row_matrix":
      return renderNestedRowMatrix(slide, n);
    case "calc_flow":
      return renderCalcFlow(slide, n);
    case "chevron_value_chain":
      return renderChevronValueChain(slide, n);
    case "big_stat_pair":
      return renderBigStatPair(slide, n);
    case "numbered_imperatives":
      return renderNumberedImperatives(slide, n);
    case "theme_card_grid":
      return renderThemeCardGrid(slide, n);
    case "question_framework":
      return renderQuestionFramework(slide, n);
    case "evidence_basis":
      return renderEvidenceBasis(slide, n);
    default:
      throw new Error(
        `Template "${slide.template}" is declared in the schema but not implemented in the HTML renderer. Implemented templates: ${[...templates].sort().join(", ")}.`,
      );
  }
}

validate(spec);

const slides = spec.slides.map((slide, index) => renderSlide(slide, index + 1)).join("\n");

// Optional scale-to-fit viewer: each 1600x900 slide auto-scales to the window width
// so it always displays fully at 100% browser zoom. Print resets it (PDF stays full-size).
const viewer = spec.viewer === true ? `<style>
    @media screen {
      body { background: #f2f2f0; }
      .deck { display: flex; flex-direction: column; align-items: center; gap: 0; padding: 24px 0; }
      .fitwrap { position: relative; overflow: hidden; background: #fff; box-shadow: 0 12px 44px rgba(0,0,0,.16); margin-bottom: 28px; }
      .fitwrap > .slide { position: absolute; top: 0; left: 0; transform-origin: top left; box-shadow: none !important; margin: 0 !important; }
    }
    @media print {
      .fitwrap { position: static !important; overflow: visible !important; width: auto !important; height: auto !important; box-shadow: none !important; margin: 0 !important; }
      .fitwrap > .slide { position: static !important; transform: none !important; }
    }
  </style>
  <script>
  (function () {
    function setup() {
      document.querySelectorAll('.deck > .slide').forEach(function (s) {
        var w = document.createElement('div');
        w.className = 'fitwrap';
        s.parentNode.insertBefore(w, s);
        w.appendChild(s);
        s.style.width = '1600px';
        s.style.height = '900px';
      });
      fit();
    }
    function fit() {
      var avail = Math.min(window.innerWidth - 48, 1600);
      var scale = avail / 1600;
      document.querySelectorAll('.fitwrap').forEach(function (w) {
        var s = w.querySelector('.slide');
        s.style.transform = 'scale(' + scale + ')';
        w.style.width = (1600 * scale) + 'px';
        w.style.height = (900 * scale) + 'px';
      });
    }
    window.addEventListener('resize', fit);
    if (document.readyState !== 'loading') setup();
    else window.addEventListener('DOMContentLoaded', setup);
  })();
  </script>` : "";

// Deck color/typography skin. Two equal, canonical options:
//   cool (default) — white / near-black ink / navy+cyan accents / sans-serif
//   warm           — cream / espresso ink / brown accent / serif, editorial-premium
// Set at the top of the spec: { "skin": "cool" }. Anything else falls back to warm (the default, same tokens as the freeform template).
const skin = spec.skin === "cool" ? "cool" : "warm";

// CSS への相対パス（出力先が generated/ の下層でも壊れないよう出力ファイルの位置から引く）
const cssHref = path.relative(path.dirname(outputPath), path.resolve(root, "html-css/consulting-slide-system.css")).split(path.sep).join("/");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(spec.deckTitle)}</title>
  <link rel="stylesheet" href="${cssHref}">
</head>
<body>
  <main class="deck skin-${skin}">
${slides}
  </main>
  ${viewer}
</body>
</html>
`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html);
console.log(outputPath);
