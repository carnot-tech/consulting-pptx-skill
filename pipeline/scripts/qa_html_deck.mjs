import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const input = process.argv[2] || "generated/synthetic_b2b_growth.html";
const output = process.argv[3] || "generated/quality-qa.json";

const root = fileURLToPath(new URL("..", import.meta.url));
const htmlPath = path.resolve(root, input);
const outputPath = path.resolve(root, output);

const allowedFontFamilies = [
  // cool skin (sans)
  "Arial", "Helvetica", "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo",
  // warm skin (serif) — editorial style
  "Hiragino Mincho ProN", "Toppan Bunkyu Mincho", "Yu Mincho", "YuMincho", "Songti SC", "Songti", "Georgia", "Times New Roman", "Times",
];
const maxFontFamilies = 6;
const maxRecurringColors = 8;
const minBodyPx = 12;
const minSourcePx = 9;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1800, height: 1100 },
  deviceScaleFactor: 1,
});

await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

const report = await page.evaluate(
  ({ allowedFontFamilies, minBodyPx, minSourcePx }) => {
    const slides = [...document.querySelectorAll(".slide")];
    const allElements = [...document.querySelectorAll(".slide *")].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    const normalizeFont = (fontFamily) =>
      fontFamily
        .split(",")
        .map((font) => font.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

    const fonts = new Map();
    const colors = new Map();
    const tinyText = [];
    const disallowedFonts = [];
    const overflow = [];
    const axisTableIssues = [];
    const scrIssues = [];
    const ismIssues = [];
    const gridHeaderIssues = [];
    const chartUnitIssues = [];
    const flowIssues = [];
    const chartShadeIssues = [];
    const chartBarIssues = [];
    const calloutIssues = [];
    const densityIssues = [];
    const redundancyHints = [];
    const cssVarIssues = [];
    const typographyIssues = [];

    const cssText = [...document.styleSheets]
      .map((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
        } catch {
          return "";
        }
      })
      .join("\n");
    const declaredVars = new Set([...cssText.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]));
    // Custom properties are also legitimately declared per-element via inline style attributes
    // (the design system sets e.g. --gcols on a specific grid component at render time). Gather
    // those so a `var(--x)` whose value is supplied inline is not reported as unresolved. Also
    // allowlist known inline-set design vars, so a rule that references one stays clean even on
    // slides that don't include that component (the rule simply doesn't apply there). Without
    // this, only self-contained (inlined-CSS) decks tripped it — external <link> stylesheets are
    // unreadable via cssRules over file:// and were silently skipped, hiding the false positive.
    [...document.querySelectorAll("[style]")].forEach((el) => {
      const attr = el.getAttribute("style") || "";
      [...attr.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].forEach((m) => declaredVars.add(m[1]));
    });
    ["--gcols"].forEach((v) => declaredVars.add(v));
    const usedVars = new Set([...cssText.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((match) => match[1]));
    usedVars.forEach((name) => {
      if (!declaredVars.has(name)) cssVarIssues.push({ issue: "unresolved CSS custom property", name });
    });

    allElements.forEach((el) => {
      const style = getComputedStyle(el);
      const text = (el.textContent || "").trim();
      const families = normalizeFont(style.fontFamily);
      if (families[0]) fonts.set(families[0], (fonts.get(families[0]) || 0) + 1);
      if (families[0] && !allowedFontFamilies.includes(families[0])) {
        disallowedFonts.push({ className: String(el.className), fontFamily: style.fontFamily, text: text.slice(0, 80) });
      }
      colors.set(style.color, (colors.get(style.color) || 0) + 1);
      if (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)") {
        colors.set(style.backgroundColor, (colors.get(style.backgroundColor) || 0) + 1);
      }
      const size = Number.parseFloat(style.fontSize);
      const min = el.closest(".footer") || el.classList.contains("source") ? minSourcePx : minBodyPx;
      if (text && Number.isFinite(size) && size < min) {
        tinyText.push({ className: String(el.className), fontSize: size, min, text: text.slice(0, 80) });
      }
      if (text && style.lineHeight === "normal") {
        typographyIssues.push({ className: String(el.className), issue: "line-height normal", text: text.slice(0, 80) });
      }
      // Per-element scrollWidth heuristic is unreliable inside .ltree (elbow-connector
      // pseudo-elements overshoot the box by a few px). Real tree overflow is covered by
      // the L2 slideGeometry / treeColumnIssues checks below.
      if (!el.closest(".ltree") && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
        overflow.push({ className: String(el.className), text: text.slice(0, 80) });
      }
    });

    const slideReports = slides.map((slide, index) => {
      const title = slide.querySelector(".title, .cover-title")?.textContent?.trim() || "";
      const source = slide.querySelector(".source")?.textContent?.trim() || "";
      const isCover = slide.classList.contains("cover");
      const hasJapanese = /[぀-ヿ㐀-鿿]/.test(title);
      // English claim/action title: long enough, not a bare topic label, contains an action verb.
      const enAction =
        title.length > 20 &&
        !/^(overview|market overview|agenda|background|summary|current state)$/i.test(title) &&
        /\b(is|are|can|could|should|depend|depends|require|requires|offer|offers|show|shows|need|needs|remain|remains|reach|reaches|shift|shifts|shifting|create|creates|creating|protect|protecting|limit|limiting|differ|differs|expose|exposes|sequence|sequences|approve|rest|rests|convert|converts|decide|decides|drive|drives|driven|lead|leads|hold|holds|turn|turns|cut|cuts|close|closes|reshape|reshapes|reshaped|outpace|outpaces|absorb|absorbs|erode|erodes|widen|widens|narrow|narrows|stall|stalls|carry|carries|rely|relies|hinge|hinges)\b/i.test(title);
      // Japanese claim title: a substantive assertion (>=12 chars) that does NOT end as a bare
      // 体言止め topic label. NOTE: 体言止め (noun-ending) titles ARE allowed — house style.
      // Predicate-ending is fine too; only vacuous topic-label enders (概要/一覧/方針/計画/現状 …)
      // are rejected. A real claim like "…BAA のみ対応中" passes.
      const jpStripped = title.replace(/[。.\s]+$/u, "");
      const jpTopicEnder = /(概要|一覧|まとめ|について|に関して|項目|論点|ポイント|全体像|現状|分析|戦略|方針|計画|体制|背景|目的|構成|フロー|マップ|イメージ|一覧表)$/u;
      const jpAction =
        jpStripped.length >= 12 &&
        !jpTopicEnder.test(jpStripped);
      // Mixed JP+EN titles may satisfy either heuristic.
      const actionTitle = isCover || (hasJapanese ? jpAction || enAction : enAction);
      const titleEl = slide.querySelector(".title");
      const titleTooTall = titleEl ? titleEl.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(titleEl).fontSize) * 2.65 : false;
      // Source is required only on slides that present an EXTERNAL-DATA object — charts, data
      // tables, matrices, KPIs, calculations. Cover, section, and conceptual/argument slides
      // (SCR, issue→solution, issue-cause-solution, chevron value chain) and your-own-plan
      // objects (gantt, roadmap) do NOT need a source. Data slides cite a source; concept slides stay sourceless.
      // Previously every slide was forced to carry a source, which read as busywork.
      const needsSource = !!slide.querySelector(
        ".axis-table, .bar-chart, .stack-chart, .waterfall, .wf-item, .twf, .heat, .heatmap, .sm-chart, .pmx, .tlm, .kpi-grid, .cf, .comparison, .scenario-table, .risk-table, .chart-unit",
      );
      return {
        slide: index + 1,
        title,
        hasSource: /source:|note:|出典|出所|ソース|注(?:記|\d*)?[):）：]/i.test(source),
        needsSource,
        actionTitle,
        isCover,
        titleTooTall,
      };
    });

    const recurringColors = [...colors.entries()].filter(([, count]) => count >= 3);

    [...document.querySelectorAll(".axis-table")].forEach((table, tableIndex) => {
      const headers = [...table.querySelectorAll(".axis-col-header")];
      const rows = [...table.querySelectorAll(".axis-cell")];
      const axisRows = [...table.querySelectorAll(".axis-row")];
      headers.forEach((header, headerIndex) => {
        const rule = header.querySelector(".axis-header-rule");
        if (!rule) {
          axisTableIssues.push({
            table: tableIndex + 1,
            header: headerIndex + 1,
            issue: "missing axis-header-rule",
            text: (header.textContent || "").trim().slice(0, 80),
          });
        } else {
          const label = header.querySelector(".axis-header-label") || header;
          const gap = rule.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
          if (gap < 6 || gap > 16) {
            axisTableIssues.push({
              table: tableIndex + 1,
              header: headerIndex + 1,
              issue: "axis-header-rule should sit 8-14px below label",
              gap: Math.round(gap),
            });
          }
        }
      });
      if (axisRows.length < 2) {
        axisTableIssues.push({
          table: tableIndex + 1,
          issue: "axis-table should expose at least two .axis-row wrappers",
          rowCount: axisRows.length,
        });
      }
      if (headers.length && rows.length % headers.length !== 0) {
        axisTableIssues.push({
          table: tableIndex + 1,
          issue: "axis-cell count should be divisible by header count",
          headerCount: headers.length,
          cellCount: rows.length,
        });
      }
      if (rows.length < headers.length * 2) {
        axisTableIssues.push({
          table: tableIndex + 1,
          issue: "axis-table should have at least two content rows",
          headerCount: headers.length,
          cellCount: rows.length,
        });
      }
      rows.forEach((cell, cellIndex) => {
        if (cell.classList.contains("banner")) return; // filled banner labels don't need a row rule
        const style = getComputedStyle(cell);
        if (!style.borderBottomStyle || style.borderBottomStyle === "none") {
          axisTableIssues.push({
            table: tableIndex + 1,
            cell: cellIndex + 1,
            issue: "axis-cell missing row separator",
            text: (cell.textContent || "").trim().slice(0, 80),
          });
        }
      });
    });

    [...document.querySelectorAll(".scr-grid")].forEach((grid, gridIndex) => {
      const tags = [...grid.querySelectorAll(".scr-tag")];
      // SCR labels are no longer forced to the English words Situation/Complication/Resolution,
      // nor to an underline — the canonical decks localize (日本語) and often drop the S/C/R
      // wording entirely in favor of a scene/section kicker. We only keep the structural hint
      // that a 3-part SCR object usually reads best with three aligned columns; this is advisory.
      if (tags.length && tags.length !== 3) {
        scrIssues.push({ grid: gridIndex + 1, issue: "SCR grid usually reads best with three aligned columns", count: tags.length });
      }
      const notes = [...grid.querySelectorAll(".scr-note")].map((note) => note.getBoundingClientRect().top);
      if (notes.length > 1 && Math.max(...notes) - Math.min(...notes) > 4) {
        scrIssues.push({ grid: gridIndex + 1, issue: "SCR lower-half notes are not aligned", delta: Math.round(Math.max(...notes) - Math.min(...notes)) });
      }
    });

    [...document.querySelectorAll(".ism")].forEach((map, mapIndex) => {
      const labels = [...map.querySelectorAll(".ism-col-label")];
      if (labels.length !== 2) {
        ismIssues.push({ map: mapIndex + 1, issue: "issue-to-solution map should have two column labels", count: labels.length });
      }
      labels.forEach((label, index) => {
        const style = getComputedStyle(label);
        if (style.borderBottomStyle === "none" || Number.parseFloat(style.borderBottomWidth) < 1) {
          ismIssues.push({ map: mapIndex + 1, label: index + 1, issue: "issue-to-solution column label missing underline rule" });
        }
      });
      const rows = [...map.querySelectorAll(".ism-row")];
      if (rows.length < 2) {
        ismIssues.push({ map: mapIndex + 1, issue: "issue-to-solution map should have at least two rows", count: rows.length });
      }
      rows.forEach((row, rowIndex) => {
        if (!row.querySelector(".ism-issue") || !row.querySelector(".ism-solution")) {
          ismIssues.push({ map: mapIndex + 1, row: rowIndex + 1, issue: "row missing issue or solution side" });
        }
        if (!row.querySelector(".ism-arrow")) {
          ismIssues.push({ map: mapIndex + 1, row: rowIndex + 1, issue: "row missing directional arrow" });
        }
      });
    });

    [...document.querySelectorAll(".heat-colhead, .tlm-colhead, .pmx-colhead, .ics-label")].forEach((header) => {
      const text = (header.textContent || "").trim();
      if (!text) return;
      const style = getComputedStyle(header);
      if (style.borderBottomStyle === "none" || Number.parseFloat(style.borderBottomWidth) < 1) {
        gridHeaderIssues.push({ className: String(header.className), issue: "grid/axis header missing underline rule", text: text.slice(0, 60) });
      }
    });

    // Process/flow & issue-cause-solution: N nodes must be joined by exactly N-1 connectors.
    [
      { container: ".flow", node: ".flow-step", arrow: ".flow-arrow", name: "process_flow" },
      { container: ".ics", node: ".ics-stage", arrow: ".ics-arrow", name: "issue_cause_solution" },
    ].forEach(({ container, node, arrow, name }) => {
      [...document.querySelectorAll(container)].forEach((el, i) => {
        const nodes = el.querySelectorAll(node).length;
        const arrows = el.querySelectorAll(arrow).length;
        if (nodes === 0) {
          flowIssues.push({ block: i + 1, name, issue: "block has no steps" });
          return;
        }
        const expected = Math.max(0, nodes - 1);
        if (arrows !== expected) {
          flowIssues.push({ block: i + 1, name, issue: `expected ${expected} connectors for ${nodes} steps, found ${arrows}` });
        }
      });
    });

    [...document.querySelectorAll(".chart-unit")].forEach((el) => {
      const style = getComputedStyle(el);
      if (style.borderBottomStyle !== "none" && Number.parseFloat(style.borderBottomWidth) >= 1) {
        chartUnitIssues.push({ issue: "chart unit caption must not carry an underline rule (reads as object-top rule)", text: (el.textContent || "").trim().slice(0, 60) });
      }
    });

    // Chart discipline (classic dataviz principles): shade count, bar count, callout count.
    const isPlain = (c) => {
      if (!c || c === "transparent") return true;
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(",").map((s) => Number.parseFloat(s.trim()));
      const [r, g, b, a = 1] = parts;
      if (a === 0) return true; // fully transparent
      if (r > 248 && g > 248 && b > 248) return true; // near-white
      return false;
    };
    // Shades: comparison-type charts should use <= 3 distinct fills (waterfall/twf use semantic role colors and are exempt).
    [
      { container: ".heat", child: ".heat-cell" },
      { container: ".stack-chart", child: ".stack-seg" },
      { container: ".bar-chart", child: ".bar" },
      { container: ".sm-chart", child: ".sm-bar" },
    ].forEach(({ container, child }) => {
      [...document.querySelectorAll(container)].forEach((el, i) => {
        const fills = new Set(
          [...el.querySelectorAll(child)].map((c) => getComputedStyle(c).backgroundColor).filter((c) => !isPlain(c)),
        );
        if (fills.size > 3) chartShadeIssues.push({ chart: container, index: i + 1, shades: fills.size, issue: "more than 3 distinct shades" });
      });
    });
    // Bar counts: <= 6 vertical bars/groups per chart panel.
    [
      { container: ".bar-chart", child: ".bar-wrap" },
      { container: ".stack-chart", child: ".stack-col" },
      { container: ".twf", child: ".twf-col" },
      { container: ".waterfall", child: ".wf-item" },
      { container: ".sm-chart", child: ".sm-bar-wrap" },
    ].forEach(({ container, child }) => {
      [...document.querySelectorAll(container)].forEach((el, i) => {
        const count = el.querySelectorAll(child).length;
        if (count > 6) chartBarIssues.push({ chart: container, index: i + 1, bars: count, issue: "more than 6 vertical bars; aggregate or switch view" });
      });
    });
    // Callouts: <= 2 per slide.
    slides.forEach((slide, i) => {
      const callouts = slide.querySelectorAll(".axis-callout, .callout").length;
      if (callouts > 2) calloutIssues.push({ slide: i + 1, count: callouts, issue: "more than 2 callouts on one slide" });
    });

    // Cell density (advisory): a comparison/axis grid whose cells are paragraphs — not short
    // phrases — reads as a spec sheet, not a boardroom slide. This is the *opposite* failure
    // mode from "forced McK devices": here the generator crams every cell full of prose. The
    // ◎○△× / tint marks and short verdicts should carry the comparison; supporting detail
    // belongs in the talk track. Flag slides with many long grid cells so the copy gets cut.
    slides.forEach((slide, i) => {
      const cells = [...slide.querySelectorAll(".axis-cell:not(.label):not(.banner), .comparison > div:not(.head):not(.row-label)")];
      const dense = cells.filter((c) => (c.textContent || "").trim().length > 70);
      if (dense.length >= 6) {
        const maxChars = Math.max(...dense.map((c) => (c.textContent || "").trim().length));
        densityIssues.push({
          slide: i + 1,
          denseCells: dense.length,
          maxChars,
          issue: "grid cells read as paragraphs — cut to short phrases; let the ◎○△×/tint marks carry the verdict, or reduce rows/columns",
        });
      }
    });

    // Non-redundancy rule (advisory, report-only): a label repeated across >=3 table cells
    // is usually a candidate to factor out into a row/column header.
    const stopwords = new Set(["with", "from", "that", "this", "into", "across", "their", "than", "have", "more", "each", "and"]);
    slides.forEach((slide, si) => {
      const cells = [...slide.querySelectorAll(".axis-cell, .pmx-cell, .pmx-rowhead, .tlm-cell, .heat-rowhead, .comparison > div, .scenario-table td, .risk-table td")];
      const counts = new Map();
      cells.forEach((c) => {
        const text = (c.textContent || "").trim();
        const tokens = text.match(/[A-Za-z]{4,}|[぀-ヿ㐀-鿿]{2,}/g) || [];
        new Set(tokens.map((t) => t.toLowerCase())).forEach((t) => {
          if (stopwords.has(t)) return;
          counts.set(t, (counts.get(t) || 0) + 1);
        });
      });
      [...counts.entries()]
        .filter(([, n]) => n >= 3)
        .forEach(([token, count]) => redundancyHints.push({ slide: si + 1, token, count, hint: "label repeats across cells — consider factoring into a row/column header (non-redundancy rule)" }));
    });

    // --- L2 geometry checks (runtime layout, not static) ---
    // Slide-level overflow: does any content element spill below the footer top or past the slide edges?
    // Reliable across flex/grid (uses bounding boxes), unlike per-element scrollHeight.
    const slideOverflow = [];
    slides.forEach((slide, i) => {
      const footer = slide.querySelector(".footer");
      const inner = slide.querySelector(".slide-inner") || slide;
      const sr = slide.getBoundingClientRect();
      const fr = footer ? footer.getBoundingClientRect() : null;
      const kids = [...inner.querySelectorAll("*")].filter((el) => {
        if (el.closest(".footer")) return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "absolute") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!kids.length) return;
      const maxBottom = Math.max(...kids.map((el) => el.getBoundingClientRect().bottom));
      const maxRight = Math.max(...kids.map((el) => el.getBoundingClientRect().right));
      if (fr && maxBottom > fr.top + 2) slideOverflow.push({ slide: i + 1, axis: "vertical", overByPx: Math.round(maxBottom - fr.top) });
      if (maxRight > sr.right + 2) slideOverflow.push({ slide: i + 1, axis: "horizontal", overByPx: Math.round(maxRight - sr.right) });
    });

    // issue_tree column discipline: same layer must be same width AND left-aligned (same x).
    const treeColumnIssues = [];
    slides.forEach((slide, i) => {
      if (!slide.querySelector(".ltree")) return;
      ["ltree-l1", "ltree-l2", "ltree-l3", "ltree-l4"].forEach((lvl) => {
        const boxes = [...slide.querySelectorAll("." + lvl)];
        if (boxes.length < 2) return;
        const rects = boxes.map((b) => b.getBoundingClientRect());
        const wSpread = Math.round(Math.max(...rects.map((r) => r.width)) - Math.min(...rects.map((r) => r.width)));
        const lSpread = Math.round(Math.max(...rects.map((r) => r.left)) - Math.min(...rects.map((r) => r.left)));
        // Tolerate a few px of width drift within a layer (differing content legitimately
        // changes box width); left-alignment stays fairly tight. Reported as advisory.
        const wTol = Math.max(6, 0.03 * Math.min(...rects.map((r) => r.width)));
        if (wSpread > wTol) treeColumnIssues.push({ slide: i + 1, level: lvl, issue: "uneven width within layer", spreadPx: wSpread });
        if (lSpread > 3) treeColumnIssues.push({ slide: i + 1, level: lvl, issue: "not left-aligned (column x differs)", spreadPx: lSpread });
      });
    });

    return {
      slideCount: slides.length,
      slideOverflow,
      treeColumnIssues,
      fonts: [...fonts.entries()].map(([family, count]) => ({ family, count })),
      disallowedFonts,
      colorCount: recurringColors.length,
      colors: recurringColors.map(([color, count]) => ({ color, count })),
      tinyText,
      overflow,
      axisTableIssues,
      scrIssues,
      ismIssues,
      gridHeaderIssues,
      chartUnitIssues,
      flowIssues,
      chartShadeIssues,
      chartBarIssues,
      calloutIssues,
      densityIssues,
      redundancyHints,
      cssVarIssues,
      typographyIssues,
      slideReports,
      actionTitleCount: slideReports.filter((slide) => slide.actionTitle).length,
      sourceCount: slideReports.filter((slide) => slide.hasSource).length,
      evidenceSlideCount: slideReports.filter((slide) => slide.needsSource).length,
      sourceMissing: slideReports.filter((slide) => slide.needsSource && !slide.hasSource).length,
    };
  },
  { allowedFontFamilies, minBodyPx, minSourcePx },
);

await browser.close();

// Two tiers of QA.
//
// checks   = universal quality lines. A failure here is a real defect (text spills its box,
//            type too small to read, undefined CSS var, uncited data) and fails the build.
// advisories = consulting-style *grammar* preferences (header underlines, SCR labels, arrow
//            counts, callout/bar density caps). These are surfaced as hints but DO NOT fail
//            the build. Demoting them from hard-fail is the whole point of this rework: the
//            old all-checks-must-pass gate pushed the generator to satisfy the template
//            (stuff in rules, SCR tags, circle-arrows) instead of the argument, which read as
//            forced. The canonical decks use these devices sparingly, not by rule — so here
//            they inform, they don't gate. Treat a non-empty advisory as "look, is this
//            actually earning its place?", not "add the device to make it green."
const checks = {
  fontFamilyCount: report.fonts.length <= maxFontFamilies,
  disallowedFonts: report.disallowedFonts.length === 0,
  tinyText: report.tinyText.length === 0,
  overflow: report.overflow.length === 0,
  slideGeometry: report.slideOverflow.length === 0,
  cssCustomProperties: report.cssVarIssues.length === 0,
  typographyRoles: report.typographyIssues.length === 0 && report.slideReports.every((slide) => !slide.titleTooTall),
  // Cite your data: every slide carrying a chart/table/matrix must show a source or note.
  // Cover, section, and concept/prose slides are exempt (see needsSource above).
  sourcePresence: report.sourceMissing === 0,
  // Most slides should carry a claim/action title, but the bar is a guideline (75%), not 90%.
  actionTitles: report.slideCount === 0 || report.actionTitleCount / report.slideCount >= 0.75,
};

const advisories = {
  recurringColorCount: report.colorCount <= maxRecurringColors,
  treeColumnAlignment: report.treeColumnIssues.length === 0,
  axisTableGrammar: report.axisTableIssues.length === 0,
  scrGrammar: report.scrIssues.length === 0,
  ismGrammar: report.ismIssues.length === 0,
  gridHeaderGrammar: report.gridHeaderIssues.length === 0,
  chartUnitGrammar: report.chartUnitIssues.length === 0,
  chartShadeCount: report.chartShadeIssues.length === 0,
  chartBarCount: report.chartBarIssues.length === 0,
  calloutCount: report.calloutIssues.length === 0,
  cellDensity: report.densityIssues.length === 0,
  flowGrammar: report.flowIssues.length === 0,
};

const result = {
  htmlPath,
  thresholds: {
    allowedFontFamilies,
    maxFontFamilies,
    maxRecurringColors,
    minBodyPx,
    minSourcePx,
  },
  checks,
  advisories,
  advisoryHints: Object.entries(advisories)
    .filter(([, ok]) => !ok)
    .map(([name]) => name),
  pass: Object.values(checks).every(Boolean),
  ...report,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

if (result.advisoryHints.length) {
  console.warn(`\n[advisory] non-blocking grammar hints (design guidance, not build failures): ${result.advisoryHints.join(", ")}`);
}

if (!result.pass) {
  process.exitCode = 1;
}
