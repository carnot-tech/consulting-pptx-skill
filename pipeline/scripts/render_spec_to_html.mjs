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
  const max = Math.max(...slide.chart.series.map((d) => d.value));
  const bars = slide.chart.series
    .map((d, i) => {
      const cls = i === slide.chart.series.length - 1 ? "bar blue" : i === slide.chart.series.length - 2 ? "bar cyan" : "bar";
      return `<div class="bar-wrap"><div class="bar-value">${esc(d.value)}</div><div class="${cls}" style="height: ${Math.round((d.value / max) * 82)}%;"></div><div class="bar-label">${esc(d.label)}</div></div>`;
    })
    .join("");
  const insight = slide.sections?.[0] || {};
  const colCount = slide.chart.series.length || 1;
  return shell(
    slide,
    n,
    `<div class="two-col"><div><div class="section-label">${esc(slide.chart.unit)}</div><div class="bar-chart" style="grid-template-columns: repeat(${colCount}, minmax(0, 1fr));">${bars}</div></div><div class="insight-panel"><div class="section-label">${esc(insight.title)}</div><div class="body-copy">${esc(insight.copy)}</div></div></div>`,
  );
}

function renderMatrix(slide, n) {
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
      return `<div class="wf-item"><div class="wf-value">${d.value > 0 && d.kind !== "base" && d.kind !== "total" ? "+" : ""}${esc(d.value)}</div><div class="${cls}" style="height: ${Math.round((Math.abs(d.value) / max) * 70)}%;"></div><div class="wf-label">${esc(d.label)}</div></div>`;
    })
    .join("");
  const insight = slide.sections?.[0] || {};
  return shell(
    slide,
    n,
    `<div class="two-col"><div><div class="section-label">${esc(slide.chart.unit)}</div><div class="waterfall">${bars}</div></div><div class="insight-panel"><div class="section-label">${esc(insight.title)}</div><div class="body-copy">${esc(insight.copy)}</div></div></div>`,
  );
}

function renderComparison(slide, n) {
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

function renderRoadmap(slide, n) {
  const phases = (slide.sections || [])
    .map((p) => `<div class="phase"><div class="phase-year">${esc(p.title)}</div><div class="phase-copy">${esc(p.copy)}</div></div>`)
    .join("");
  return shell(slide, n, `<div class="roadmap">${phases}</div>`);
}

function renderDecision(slide, n) {
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

function renderKpiDashboard(slide, n) {
  const tiles = (slide.kpis || [])
    .map(
      (k) =>
        `<div class="kpi-tile"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div>${k.delta ? `<div class="kpi-delta">${esc(k.delta)}</div>` : ""}${k.note ? `<div class="kpi-note">${esc(k.note)}</div>` : ""}</div>`,
    )
    .join("");
  return shell(slide, n, `<div class="kpi-grid">${tiles}</div>`, { noTitleRule: true });
}

function renderRecommendationPillars(slide, n) {
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

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(spec.deckTitle)}</title>
  <link rel="stylesheet" href="../html-css/consulting-slide-system.css">
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
