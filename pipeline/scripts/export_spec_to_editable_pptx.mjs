import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pptxgen from "pptxgenjs";

const inputArg = process.argv[2] || "slide-spec/synthetic_b2b_growth.json";
const outputArg = process.argv[3] || "generated/synthetic_b2b_growth_editable.pptx";

const root = fileURLToPath(new URL("..", import.meta.url));
const inputPath = path.resolve(root, inputArg);
const outputPath = path.resolve(root, outputArg);
const deck = JSON.parse(await fs.readFile(inputPath, "utf8"));

// Pick a font with Japanese glyph coverage when the deck contains Japanese; Arial lacks CJK glyphs.
const HAS_JP = /[぀-ヿ㐀-鿿]/.test(JSON.stringify(deck));
const FONT = HAS_JP ? "Yu Gothic" : "Arial";
// 見出し・ロゴは明朝。HTMLパーツ集（Yu Mincho）と外枠を揃えるため
// （統合カタログでPPTX由来ページとHTML由来ページの書体・版面がずれていた）。
const FONT_SERIF = HAS_JP ? "Yu Mincho Demibold" : "Georgia";  // HTML側 h1(font-weight:600) と同じ太さ
const LANG = HAS_JP ? "ja-JP" : "en-US";

const W = 13.333;
const H = 7.5;
const M = 0.63;              // 16mm
const TOP = 0.47;            // ヘッダーバーの文字上端 12mm
const CONTENT_TOP = 1.72;    // 本文開始 43.7mm
const FOOTER_Y = 7.09;       // フッター罫線 180mm
// Base palette. A spec may override any key via a root-level "palette" object
// (e.g. {"palette": {"navy": "1F3A5F"}}) — used for brand-recolored decks.
const PALETTE = deck.palette || {};
const INK = PALETTE.ink || "050505";
const NAVY = PALETTE.navy || "071B2C";
const MUTED = PALETTE.muted || "666B70";
const HAIR = PALETTE.hair || "D9DCDF";
const BLUE = PALETTE.blue || "1E5F8C";
const CYAN = PALETTE.cyan || "79C8DC";
const ROSE = PALETTE.rose || "D94C68";
const WARNING = PALETTE.warning || "E0B22E";
const GREEN = PALETTE.green || "00856F";
const WHITE = "FFFFFF";
const SOFTYELLOW = PALETTE.softYellow || "FFF3BD";
const SOFTBLUE = PALETTE.softBlue || "E7F4F8";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Consulting Slide Lab";
pptx.company = "Consulting Slide Lab";
pptx.subject = "Editable synthetic consulting deck generated from SlideSpec";
pptx.title = deck.deckTitle;
pptx.lang = LANG;
pptx.theme = {
  headFontFace: FONT,
  bodyFontFace: FONT,
  lang: LANG,
};

function addKicker(slide, text) {
  // 左: 資料名（明朝）／右: 型ID・章ラベル／下に細罫。HTMLパーツ集の .bar と同じ構成。
  slide.addText(String(deck.deckTitle || ""), {
    x: M, y: TOP - 0.12, w: 7.0, h: 0.3,
    fontFace: FONT_SERIF, fontSize: 14, bold: false, color: INK,
    margin: 0, breakLine: false, valign: "bottom", fit: "shrink",
  });
  slide.addText(String(text || "").toUpperCase(), {
    x: W - M - 5.0, y: TOP - 0.02, w: 5.0, h: 0.2,
    fontFace: FONT, fontSize: 8, bold: false, color: MUTED,
    align: "right", margin: 0, breakLine: false, fit: "shrink",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: M, y: 0.858, w: W - M * 2, h: 0, line: { color: INK, width: 1.1 },
  });
}

// スキル有無検証の反映（slide-rules §2.13 / §5.13）
// 全角換算の文字数（半角は0.5）
function fwLen(str) {
  let n = 0;
  for (const ch of String(str || "")) n += ch.charCodeAt(0) < 0x3000 ? 0.5 : 1;
  return n;
}
// 1行に入る全角換算文字数（箱幅 in ／ フォントサイズ pt）
function lineCapacity(wIn, fontPt, factor = 1.0) {
  return Math.max(4, Math.floor(wIn / ((fontPt / 72) * factor)));
}
// 意味の切れ目で改行を入れて泣き別れ（末尾1〜3字）を防ぐ。容量を超えないときはそのまま返す。
function smartBreak(text, cap, minTail = 4) {
  const t = String(text || "").replace(/\r/g, "");
  if (!t || t.includes("\n")) return t;
  if (fwLen(t) <= cap) return t;
  const chars = [...t];
  // 位置 i で切る＝chars[0..i) が1行目
  const isBreakAfter = (ch) => /[、。：:）)」』\s／/・]/.test(ch);
  const isBreakBefore = (ch) => /[（(「『]/.test(ch);
  let best = -1;
  let acc = 0;
  const total = fwLen(t);
  for (let i = 1; i < chars.length; i++) {
    acc += chars[i - 1].charCodeAt(0) < 0x3000 ? 0.5 : 1;
    if (acc > cap) break;
    const tail = total - acc;
    if (tail < minTail) break;
    if (isBreakAfter(chars[i - 1]) || isBreakBefore(chars[i])) best = i;
  }
  if (best < 0) {
    // 切れ目が無ければ容量の手前で、末尾が minTail 以上残る位置で切る
    acc = 0;
    for (let i = 1; i < chars.length; i++) {
      acc += chars[i - 1].charCodeAt(0) < 0x3000 ? 0.5 : 1;
      if (acc > cap - 1) break;
      if (total - acc >= minTail) best = i;
    }
  }
  if (best <= 0) return t;
  return chars.slice(0, best).join("") + "\n" + chars.slice(best).join("");
}
// テキストの実高さ（in）を推定する。宣言した箱の高さより小さければ、その値で中央寄せに使う。
function estTextHeight(text, wIn, fontPt) {
  const cap = lineCapacity(Math.max(0.3, wIn - 0.1), fontPt);
  const paras = Array.isArray(text)
    ? text.map((r) => (r && typeof r === "object" ? String(r.text || "") : String(r || "")))
    : String(text || "").split("\n");
  let lines = 0;
  for (const p of paras) lines += Math.max(1, Math.ceil(fwLen(p) / cap));
  return lines * (fontPt / 72) * 1.35 + 0.08;
}

function addTitle(slide, title, opts = {}) {
  // slide-rules §2.1/§2.13: 2行タイトルは意味の切れ目で明示改行し、文字を縮小して1行に詰めない
  const cap = lineCapacity(W - M * 2, 22, 1.0);
  const text = smartBreak(title, cap - 1);
  const twoLines = text.includes("\n");
  slide.addText(text, {
    x: M,
    y: 1.00,
    w: W - M * 2,
    h: twoLines ? 0.95 : 0.55,
    fontFace: FONT_SERIF,
    fontSize: 22,
    bold: false,
    color: INK,
    margin: 0,
    breakLine: false,
    fit: "none",
    valign: "top",
  });
  // Client rule: no title-underline by default. Opt in with { titleRule: true }.
  if (opts.titleRule === true) {
    slide.addShape(pptx.ShapeType.line, {
      x: M,
      y: 1.62,
      w: W - M * 2,
      h: 0,
      line: { color: INK, width: 0.7 },
    });
  }
}

function addFooter(slide, item, pageNum) {
  // 出典は罫線の「上」（HTMLパーツ集の .src と同じ位置）
  slide.addText([item.note, item.source].filter(Boolean).join(" ") || "", {
    x: M, y: FOOTER_Y - 0.26, w: 9.8, h: 0.2,
    fontFace: FONT, fontSize: 7.5, color: MUTED, margin: 0, fit: "shrink",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: M, y: FOOTER_Y, w: W - M * 2, h: 0, line: { color: HAIR, width: 0.7 },
  });
  slide.addText(String(deck.deckTitle || ""), {
    x: M, y: FOOTER_Y + 0.09, w: 6.0, h: 0.2,
    fontFace: FONT, fontSize: 8.5, bold: true, color: INK, margin: 0, fit: "shrink",
  });
  slide.addText(String(pageNum), {
    x: W - M - 0.4, y: FOOTER_Y + 0.09, w: 0.4, h: 0.2,
    fontFace: FONT, fontSize: 7.5, color: MUTED, align: "right", margin: 0,
  });
}

// Vertical balancing: content elements are buffered per slide, then shifted
// down as a block so the body sits centered between the title zone and the
// footer, instead of cramming against the title and leaving the bottom empty.
const CONTENT_AREA_TOP = 1.70;
const CONTENT_AREA_BOTTOM = FOOTER_Y - 0.34;  // 出典行の分を空ける
const pendingBalancedSlides = [];

// slide-rules §5.3「塗りありボックスに枠線を付けない」に合わせ、
// 図形オプションを書き出し直前に正規化する。98か所の line: を個別に消すのではなく
// ここで一括して落とす（check_deck の「塗りあり図形に枠線」WARN の発生源）。
function normalizeShapeOpts(opts) {
  if (!opts || typeof opts !== "object") return opts;
  const fill = opts.fill;
  const line = opts.line;
  if (!fill || !line) return opts;
  const fillColor = typeof fill === "string" ? fill : fill.color;
  const lineColor = typeof line === "string" ? line : line.color;
  if (!fillColor || fill.type === "none") return opts;
  if (fillColor === lineColor) {
    // 塗りと同色の枠線＝完全に冗長。落とす
    const { line: _drop, ...rest } = opts;
    return rest;
  }
  if (String(fillColor).toUpperCase() === "FFFFFF") {
    // 白塗り＋濃色枠は「塗りなし＋枠線」と見た目が同じ。ルール適合側に寄せる
    return { ...opts, fill: { type: "none" } };
  }
  // 塗りに対して意味の違う枠線が付いているものは枠線を落とす（塗りが領域を示す）
  const { line: _drop2, ...rest } = opts;
  return rest;
}

// slide-rules §7.3「マーカー記号を本文テキストに直打ちしない」。
// 「• 」を文字として連結せず、PPTX の書式ブレット（buChar）で付ける。
function toFormattedBullets(list) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return null;
  return items.map((b, i) => ({
    text: String(b),
    options: { bullet: { code: "2022", indent: 12 }, breakLine: i < items.length - 1 },
  }));
}

function makeBalancingProxy(slide, fixed = false) {
  // fixed=true: 版面いっぱいに組む型（行リスト・表など）は縦中央寄せをしない（枠線正規化だけ通す）
  const ops = [];
  pendingBalancedSlides.push({ slide, ops, fixed });
  const buffer = (method) => (...args) => {
    if (method === "addShape" && args[1]) args[1] = normalizeShapeOpts(args[1]);
    ops.push([method, args]);
  };
  return {
    addText: buffer("addText"),
    addShape: buffer("addShape"),
    addTable: buffer("addTable"),
    addImage: buffer("addImage"),
    addChart: buffer("addChart"),
  };
}

function opGeometry(method, args) {
  const opts = method === "addShape" ? args[1] : method === "addImage" ? args[0] : method === "addChart" ? args[2] : args[1];
  if (!opts || typeof opts.y !== "number") return null;
  let h = typeof opts.h === "number" ? opts.h : null;
  if (h === null && method === "addTable" && Array.isArray(args[0])) {
    // Use the real row heights when provided; the 0.35in-per-row guess badly
    // underestimates tall rows and made centered tables sit too low.
    h = Array.isArray(opts.rowH) ? opts.rowH.reduce((a, b) => a + b, 0) : args[0].length * 0.35;
  }
  if (h === null) h = 0;
  // §5.13: 宣言した箱の高さでなく、テキストの実高さ推定で下端を測る（下半分が空く原因の除去）
  if (method === "addText" && typeof opts.w === "number" && opts.fontSize) {
    const est = estTextHeight(args[0], opts.w, opts.fontSize);
    if (est < h) h = est;
  }
  return { opts, top: opts.y, bottom: opts.y + h };
}

function flushBalancedSlides() {
  for (const { slide, ops, fixed } of pendingBalancedSlides) {
    let minY = Infinity;
    let maxBottom = -Infinity;
    let measurable = ops.length > 0;
    for (const [method, args] of ops) {
      const geo = opGeometry(method, args);
      if (!geo) {
        measurable = false;
        break;
      }
      minY = Math.min(minY, geo.top);
      maxBottom = Math.max(maxBottom, geo.bottom);
    }
    let offset = 0;
    if (!fixed && measurable && minY >= CONTENT_AREA_TOP - 0.35) {
      const centeredTop = CONTENT_AREA_TOP + (CONTENT_AREA_BOTTOM - CONTENT_AREA_TOP - (maxBottom - minY)) / 2;
      offset = Math.max(0, Math.min(centeredTop - minY, CONTENT_AREA_BOTTOM - maxBottom));
    }
    for (const [method, args] of ops) {
      if (offset) {
        const geo = opGeometry(method, args);
        if (geo) geo.opts.y += offset;
      }
      slide[method](...args);
    }
  }
  pendingBalancedSlides.length = 0;
}

function addShell(item, pageNum, opts = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  addKicker(slide, item.kicker || item.template);
  addTitle(slide, item.title, opts);
  addFooter(slide, item, pageNum);
  return makeBalancingProxy(slide, opts.balance === false);
}

function addBodyText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: opts.fontSize || 13,
    bold: opts.bold || false,
    color: opts.color || INK,
    breakLine: false,
    fit: "shrink",
    margin: opts.margin ?? 0.03,
    valign: opts.valign || "top",
    align: opts.align || "left",
    bullet: opts.bullet,
  });
}

function addInsightPanel(slide, section, x, y, w, h) {
  slide.addShape(pptx.ShapeType.line, {
    x,
    y,
    w: 0,
    h,
    line: { color: BLUE, width: 2.2 },
  });
  addBodyText(slide, section?.title || "", x + 0.22, y, w - 0.22, 0.45, { fontSize: 15, bold: true });
  addBodyText(slide, section?.copy || "", x + 0.22, y + 0.55, w - 0.22, h - 0.55, { fontSize: 13.5 });
}

function addCover(item, pageNum) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  slide.addShape(pptx.ShapeType.rect, {
    x: 9.6,
    y: -0.45,
    w: 4.9,
    h: 4.9,
    rotate: 28,
    // 透明度100%の白塗り＝実質「塗りなし」。塗りあり＋枠線に見えるので type:"none" にする（slide-rules §5.3）
    fill: { type: "none" },
    line: { color: CYAN, transparency: 25, width: 0.7 },
  });
  addKicker(slide, item.kicker);
  // 表紙タイトル・サブタイトルも意味の切れ目で改行（泣き別れ防止）。サブタイトル幅は本文幅に拡大
  const cTitle = smartBreak(item.title, lineCapacity(7.6, 38, 1.0) - 1);
  const cLines = cTitle.split("\n").length;
  const cTitleH = Math.max(1.15, cLines * 0.62);
  slide.addText(cTitle, {
    x: M,
    y: 2.75,
    w: 7.6,
    h: cTitleH,
    fontFace: FONT,
    fontSize: 38,
    bold: true,
    color: INK,
    margin: 0,
    fit: "none",
  });
  const cSub = smartBreak(item.subtitle || "", lineCapacity(7.6, 14, 1.0) - 1);
  slide.addText(cSub, {
    x: M,
    y: 2.75 + cTitleH + 0.15,
    w: 7.6,
    h: 0.3 * cSub.split("\n").length + 0.1,
    fontFace: FONT,
    fontSize: 14,
    color: INK,
    margin: 0,
  });
  addFooter(slide, item, pageNum);
}

function addExecutiveSummary(item, pageNum) {
  const slide = addShell(item, pageNum);
  const cols = item.sections || [];
  const colW = 3.72;
  // Up to 3 columns per row; wrap to a second row for 4+ sections so nothing
  // runs off the right edge of the slide (matches the HTML renderer's wrap).
  const perRow = 3;
  cols.forEach((section, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = M + col * (colW + 0.45);
    const y = 2.35 + row * 1.95;
    addBodyText(slide, section.title, x, y, colW, 0.48, { fontSize: 14.5, bold: true });
    addBodyText(slide, section.copy, x, y + 0.65, colW, 1.2, { fontSize: 15 });
  });
}

function addChartInsight(item, pageNum) {
  const slide = addShell(item, pageNum);
  const chart = item.chart || { series: [] };
  addBodyText(slide, chart.unit || "", M, 2.1, 6.7, 0.3, { fontSize: 15, bold: true });
  const max = Math.max(...chart.series.map((d) => d.value), 1);
  const baseY = 6.1;
  const x0 = M + 0.9;
  const gap = 1.15;
  chart.series.forEach((d, i) => {
    const h = (d.value / max) * 2.25;
    const x = x0 + i * gap;
    const color = i === chart.series.length - 1 ? BLUE : i === chart.series.length - 2 ? CYAN : NAVY;
    slide.addShape(pptx.ShapeType.rect, { x, y: baseY - h, w: 0.62, h, fill: { color } });
    addBodyText(slide, String(d.value), x - 0.05, baseY - h - 0.25, 0.72, 0.2, { fontSize: 12, bold: true });
    addBodyText(slide, d.label, x - 0.25, baseY + 0.1, 1.12, 0.28, { fontSize: 9.5 });
  });
  slide.addShape(pptx.ShapeType.line, { x: M, y: baseY, w: 6.3, h: 0, line: { color: INK, width: 1 } });
  addInsightPanel(slide, item.sections?.[0], 7.5, 2.25, 4.8, 1.55);
}

function addMatrix(item, pageNum) {
  const slide = addShell(item, pageNum);
  const x = M;
  const y = 2.08;
  const w = 6.8;
  const h = 3.95;
  slide.addShape(pptx.ShapeType.line, { x, y: y + h, w, h: 0, line: { color: INK, width: 1.1 } });
  slide.addShape(pptx.ShapeType.line, { x, y, w: 0, h, line: { color: INK, width: 1.1 } });
  slide.addShape(pptx.ShapeType.line, { x: x + w / 2, y, w: 0, h, line: { color: HAIR, width: 0.7 } });
  slide.addShape(pptx.ShapeType.line, { x, y: y + h / 2, w, h: 0, line: { color: HAIR, width: 0.7 } });
  // Axis names sit OUTSIDE the plot area (y-axis above top-left, x-axis below
  // bottom-right), and come from the spec (matrix: {yAxis, xAxis}) when given.
  const yAxis = item.matrix?.yAxis || "Higher impact";
  const xAxis = item.matrix?.xAxis || "Higher feasibility";
  addBodyText(slide, yAxis, x, y - 0.3, 3.2, 0.22, { fontSize: 10.5, bold: true, color: MUTED });
  addBodyText(slide, xAxis, x + w - 3.2, y + h + 0.06, 3.2, 0.22, { fontSize: 10.5, bold: true, color: MUTED, align: "right" });
  (item.items || []).forEach((p) => {
    const px = x + (p.x / 100) * w;
    const py = y + (p.y / 100) * h;
    const fill = p.priority ? BLUE : WHITE;
    const color = p.priority ? WHITE : INK;
    slide.addShape(pptx.ShapeType.rect, { x: px - 0.58, y: py - 0.18, w: 1.16, h: 0.36, fill: { color: fill }, line: { color: BLUE, width: 0.6 } });
    addBodyText(slide, p.label, px - 0.53, py - 0.13, 1.06, 0.24, { fontSize: 7.7, bold: true, color });
  });
  const s = item.sections?.[0] || {};
  addBodyText(slide, s.title || "", 8.0, 2.15, 4.4, 0.7, { fontSize: 14, bold: true });
  (s.bullets || []).forEach((b, i) => addBodyText(slide, b, 8.15, 3.0 + i * 0.55, 4.0, 0.38, { fontSize: 12.5 }));
}

function addWaterfall(item, pageNum) {
  const slide = addShell(item, pageNum);
  addBodyText(slide, item.chart?.unit || "", M, 2.1, 6.6, 0.3, { fontSize: 15, bold: true });
  const series = item.chart?.series || [];
  const max = Math.max(...series.map((d) => Math.abs(d.value)), 1);
  const baseY = 6.1;
  const x0 = M + 0.25;
  const gap = 1.12;
  series.forEach((d, i) => {
    const h = (Math.abs(d.value) / max) * 2.25;
    const x = x0 + i * gap;
    const color = d.kind === "down" ? ROSE : d.kind === "up" ? BLUE : NAVY;
    slide.addShape(pptx.ShapeType.rect, { x, y: baseY - h, w: 0.66, h, fill: { color } });
    const value = `${d.value > 0 && d.kind === "up" ? "+" : ""}${d.value}`;
    addBodyText(slide, value, x - 0.08, baseY - h - 0.26, 0.82, 0.2, { fontSize: 12, bold: true });
    addBodyText(slide, d.label, x - 0.18, baseY + 0.1, 1.05, 0.32, { fontSize: 9.2 });
  });
  slide.addShape(pptx.ShapeType.line, { x: M, y: baseY, w: 6.4, h: 0, line: { color: INK, width: 1 } });
  addInsightPanel(slide, item.sections?.[0], 7.5, 2.15, 4.7, 1.45);
}

function addComparison(item, pageNum) {
  const slide = addShell(item, pageNum);
  const h = item.headers || {};
  const headers = [h.criterion || "評価軸", h.company || "自社", h.competitor || "他社", h.implication || "読み取り"];
  const rows = (item.table || []).map((r) => [r.criterion, r.company, r.competitor, r.implication]);
  addTableLike(slide, headers, rows, [2.4, 2.4, 2.4, 4.93], 2.22, {});
}

function addScenario(item, pageNum) {
  const slide = addShell(item, pageNum);
  const h = item.headers || {};
  const headers = [h.case || "シナリオ", h.outcome || "結果", h.assumptions || "置いた前提", h.implication || "経営の打ち手"];
  const rows = (item.table || []).map((r) => [r.case, r.outcome, r.assumptions, r.implication]);
  addTableLike(slide, headers, rows, [1.7, 1.9, 4.3, 4.23], 2.22, { numericCol: 1 });
}

function addRisk(item, pageNum) {
  const slide = addShell(item, pageNum);
  const h = item.headers || {};
  const headers = [h.risk || "リスク", h.signal || "見るべき兆候", h.mitigation || "打ち手", h.owner || "担当"];
  const rows = (item.table || []).map((r) => [r.risk, r.signal, r.mitigation, r.owner]);
  addTableLike(slide, headers, rows, [3.1, 2.8, 5.0, 1.23], 2.22, {});
}

// Native, editable PowerPoint table that mirrors the lab's table grammar:
// bold header row with a solid bottom rule, body rows with thin hairline separators,
// optional numeric-emphasis column.
function addTableLike(slide, headers, rows, widths, y, opts = {}) {
  const headerRow = headers.map((h) => ({
    text: h,
    options: {
      bold: true,
      fontSize: 12.5, // rule 6: header 2pt larger than body (10.5)
      color: INK,
      align: "left",
      valign: "top",
      border: [{ type: "none" }, { type: "none" }, { type: "solid", pt: 1.2, color: INK }, { type: "none" }],
    },
  }));
  const bodyRows = rows.map((row) =>
    row.map((txt, i) => {
      const isNum = i === opts.numericCol;
      const cellText = Array.isArray(txt)
        ? txt.filter(Boolean).map((b, bi, arr) => ({
            text: String(b),
            options: { bullet: { code: "2022", indent: 10 }, breakLine: bi < arr.length - 1 },
          }))
        : String(txt ?? "");
      return {
        text: cellText,
        options: {
          bold: i === 0 || isNum,
          color: isNum ? BLUE : INK,
          fontSize: 10.5, // rule 6: emphasis is bold+color only, never larger than the header
          align: "left",
          valign: "top",
          border: [{ type: "none" }, { type: "none" }, { type: "solid", pt: 0.5, color: HAIR }, { type: "none" }],
        },
      };
    }),
  );
  // Explicit row heights: without them pptxgenjs emits <a:tr h="0">, which PowerPoint may collapse.
  const headerH = 0.42;
  const available = FOOTER_Y - 0.3 - y - headerH;
  const bodyH = Math.min(1.3, available / Math.max(rows.length, 1));
  slide.addTable([headerRow, ...bodyRows], {
    x: M,
    y,
    w: widths.reduce((a, b) => a + b, 0),
    // h を明示しないと graphicFrame の cy が 1in になり、check_deck の版面充填率が実態より低く出る
    h: headerH + bodyH * rows.length,
    colW: widths,
    rowH: [headerH, ...rows.map(() => bodyH)],
    fontFace: FONT,
    autoPage: false,
    valign: "top",
    margin: [5, 6, 9, 0],
  });
}

function addRoadmap(item, pageNum) {
  const slide = addShell(item, pageNum);
  const phases = item.sections || [];
  const w = (W - M * 2) / phases.length;
  phases.forEach((p, i) => {
    const x = M + i * w;
    slide.addShape(pptx.ShapeType.line, { x, y: 2.22, w: w - 0.02, h: 0, line: { color: INK, width: 1.1 } });
    if (i > 0) slide.addShape(pptx.ShapeType.line, { x, y: 2.22, w: 0, h: 2.8, line: { color: HAIR, width: 0.5 } });
    addBodyText(slide, p.title, x + 0.14, 2.45, w - 0.25, 0.38, { fontSize: 16, bold: true, color: BLUE });
    addBodyText(slide, p.copy, x + 0.14, 3.05, w - 0.3, 1.5, { fontSize: 11.2, color: MUTED });
  });
}

function addDecision(item, pageNum) {
  const slide = addShell(item, pageNum);
  slide.addShape(pptx.ShapeType.line, { x: M, y: 2.22, w: 5.7, h: 0, line: { color: BLUE, width: 2.2 } });
  addBodyText(slide, ((item.headers || {}).recommended || "RECOMMENDED DECISION"), M, 2.45, 2.4, 0.24, { fontSize: 10.5, bold: true, color: MUTED });
  addBodyText(slide, item.ask || "", M, 2.85, 5.8, 1.5, { fontSize: 22, bold: true });
  (item.decisions || []).forEach((d, i) => {
    const y = 2.25 + i * 0.78;
    addBodyText(slide, String(i + 1), 6.8, y, 0.3, 0.28, { fontSize: 16, bold: true, color: BLUE });
    addBodyText(slide, d, 7.35, y, 5.0, 0.42, { fontSize: 13.5 });
    slide.addShape(pptx.ShapeType.line, { x: 6.75, y: y + 0.53, w: 5.55, h: 0, line: { color: HAIR, width: 0.5 } });
  });
}

function addScr(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const cols = item.scr || [];
  const gap = 0.45;
  const colW = (W - M * 2 - gap * 2) / 3;
  const tagY = 2.1;
  const headingY = 2.7;
  const copyY = 3.7;
  const noteRuleY = 5.4;
  const noteY = 5.55;
  cols.forEach((c, i) => {
    const x = M + i * (colW + gap);
    addBodyText(slide, c.label || "", x, tagY, colW, 0.34, { fontSize: 15, bold: true });
    slide.addShape(pptx.ShapeType.line, { x, y: tagY + 0.42, w: colW, h: 0, line: { color: INK, width: 2 } });
    addBodyText(slide, c.heading || "", x, headingY, colW, 0.95, { fontSize: 15, bold: true });
    addBodyText(slide, c.copy || "", x, copyY, colW, 1.55, { fontSize: 12.5 });
    slide.addShape(pptx.ShapeType.line, { x, y: noteRuleY, w: colW, h: 0, line: { color: MUTED, width: 0.75, dashType: "sysDot" } });
    addBodyText(slide, c.note || "", x, noteY, colW, 1.0, { fontSize: 12, bold: true });
  });
}

function addAxisTable(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const axis = item.axis || { headers: [], rows: [] };
  const headers = axis.headers || [];
  const colCount = headers.length || 1;
  const colGap = 0.2;
  const totalW = W - M * 2;
  const weights =
    Array.isArray(axis.weights) && axis.weights.length === colCount
      ? axis.weights
      : new Array(colCount).fill(1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const usableW = totalW - colGap * (colCount - 1);
  const colWidths = weights.map((w) => (w / weightSum) * usableW);
  const colX = [];
  let cx = M;
  for (let i = 0; i < colCount; i += 1) {
    colX.push(cx);
    cx += colWidths[i] + colGap;
  }

  const flow = axis.flow === true;
  const rowBanner = axis.rowBanner === true;
  const dotCol = Number.isInteger(axis.dotColumn) ? axis.dotColumn : -1;
  const dotFill = { high: ROSE, med: WARNING, low: MUTED };
  const dotOf = (v) => {
    const s = String(v || "").toLowerCase();
    if (s.startsWith("high") || s === "大") return "high";
    if (s.startsWith("med") || s === "中") return "med";
    return "low";
  };

  let topY = 2.1;
  // dot legend (top-right)
  if (Array.isArray(axis.dotLegend) && axis.dotLegend.length) {
    let lx = W - M - 3.6;
    axis.dotLegend.forEach((label, i) => {
      const lvl = ["high", "med", "low"][i] || "low";
      slide.addShape(pptx.ShapeType.ellipse, { x: lx, y: topY + 0.02, w: 0.18, h: 0.18, fill: { color: dotFill[lvl] }, line: { color: dotFill[lvl] } });
      addBodyText(slide, label, lx + 0.26, topY, 1.5, 0.22, { fontSize: 11, bold: true });
      lx += 1.8;
    });
    topY += 0.4;
  }
  if (axis.callout) {
    addBodyText(slide, `●  ${axis.callout}`, M, topY, totalW, 0.3, { fontSize: 12.5, bold: true });
    slide.addShape(pptx.ShapeType.line, { x: M, y: topY + 0.36, w: totalW, h: 0, line: { color: MUTED, width: 0.6, dashType: "sysDot" } });
    topY += 0.55;
  }

  const headerY = topY;
  headers.forEach((h, i) => {
    addBodyText(slide, h, colX[i], headerY, colWidths[i], 0.3, { fontSize: 12, bold: true });
    slide.addShape(pptx.ShapeType.line, { x: colX[i], y: headerY + 0.38, w: colWidths[i], h: 0, line: { color: INK, width: 1.6 } });
  });
  // flow circle-arrows centered on the header rule (below column titles, no label overlap)
  if (flow) {
    const ay = headerY + 0.38 - 0.21; // rule y = headerY + 0.38; arrow center on rule
    for (let i = 0; i < colCount - 1; i += 1) {
      if (rowBanner && i === 0) continue;
      const bx = colX[i] + colWidths[i] + colGap / 2;
      slide.addShape(pptx.ShapeType.ellipse, { x: bx - 0.21, y: ay, w: 0.42, h: 0.42, fill: { color: NAVY }, line: { color: NAVY } });
      addBodyText(slide, "›", bx - 0.21, ay, 0.42, 0.42, { fontSize: 16, bold: true, color: WHITE, align: "center", valign: "middle" });
    }
  }

  const rows = axis.rows || [];
  const rowY0 = headerY + 0.55;
  const available = FOOTER_Y - 0.25 - rowY0;
  const rowH = Math.min(0.95, available / Math.max(rows.length, 1));
  rows.forEach((row, ri) => {
    const yy = rowY0 + ri * rowH;
    if (row.highlight) {
      slide.addShape(pptx.ShapeType.rect, { x: M - 0.05, y: yy - 0.04, w: totalW + 0.1, h: rowH - 0.04, fill: { color: SOFTBLUE }, line: { color: SOFTBLUE } });
    }
    (row.cells || []).forEach((cell, ci) => {
      if (ci >= colCount) return;
      if (ci === dotCol) {
        const lvl = dotOf(cell);
        slide.addShape(pptx.ShapeType.ellipse, { x: colX[ci] + colWidths[ci] / 2 - 0.11, y: yy + rowH / 2 - 0.11, w: 0.22, h: 0.22, fill: { color: dotFill[lvl] }, line: { color: dotFill[lvl] } });
        return;
      }
      if (ci === 0 && rowBanner) {
        slide.addShape(pptx.ShapeType.rect, { x: colX[0], y: yy + 0.05, w: colWidths[0] - 0.1, h: rowH - 0.16, fill: { color: NAVY }, line: { color: NAVY } });
        addBodyText(slide, cell, colX[0], yy + 0.05, colWidths[0] - 0.1, rowH - 0.16, { fontSize: 11.5, bold: true, color: WHITE, align: "center", valign: "middle" });
        return;
      }
      addBodyText(slide, cell, colX[ci], yy + 0.04, colWidths[ci], rowH - 0.12, { fontSize: 10.5, bold: ci === 0 });
    });
    slide.addShape(pptx.ShapeType.line, { x: M, y: yy + rowH - 0.04, w: totalW, h: 0, line: { color: HAIR, width: 0.5, dashType: "dash" } });
  });
}

function addIssueToSolution(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const mappings = item.mappings || [];
  // Equal-width columns with a clear gutter; a single triangle sits in the
  // gutter, vertically centered on the whole mapping block.
  const gapW = 0.9;
  const colW = (W - M * 2 - gapW) / 2;
  const issueX = M;
  const solX = M + colW + gapW;

  const headerY = 2.15;
  addBodyText(slide, ((item.headers || {}).issue || "Issue"), issueX, headerY, colW, 0.3, { fontSize: 14, bold: true });
  slide.addShape(pptx.ShapeType.line, { x: issueX, y: headerY + 0.4, w: colW, h: 0, line: { color: INK, width: 2 } });
  addBodyText(slide, ((item.headers || {}).resolution || "Resolution"), solX, headerY, colW, 0.3, { fontSize: 14, bold: true });
  slide.addShape(pptx.ShapeType.line, { x: solX, y: headerY + 0.4, w: colW, h: 0, line: { color: INK, width: 2 } });

  const rowY0 = headerY + 0.65;
  const available = FOOTER_Y - 0.25 - rowY0;
  const rowH = Math.min(1.15, available / Math.max(mappings.length, 1));
  mappings.forEach((m, i) => {
    const yy = rowY0 + i * rowH;
    addBodyText(slide, m.issue || "", issueX, yy + 0.06, colW, rowH - 0.2, { fontSize: 12.5 });
    addBodyText(slide, m.solution || "", solX, yy + 0.06, colW, 0.45, { fontSize: 12.5, bold: true });
    if (m.impact) {
      addBodyText(slide, m.impact, solX, yy + 0.5, colW, 0.4, { fontSize: 10.5, color: MUTED });
    }
    if (i < mappings.length - 1) {
      // Keep the gutter clean: separate rules per column, none across the gap.
      slide.addShape(pptx.ShapeType.line, { x: issueX, y: yy + rowH - 0.06, w: colW, h: 0, line: { color: HAIR, width: 0.5, dashType: "dash" } });
      slide.addShape(pptx.ShapeType.line, { x: solX, y: yy + rowH - 0.06, w: colW, h: 0, line: { color: HAIR, width: 0.5, dashType: "dash" } });
    }
  });
  const blockH = rowH * Math.max(mappings.length, 1);
  slide.addShape(pptx.ShapeType.triangle, {
    x: M + colW + gapW / 2 - 0.12,
    y: rowY0 + blockH / 2 - 0.11,
    w: 0.24,
    h: 0.22,
    rotate: 90,
    fill: { color: NAVY },
    line: { color: NAVY },
  });
}

function addProcessFlow(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const steps = item.steps || [];
  const n = steps.length || 1;
  const colW = (W - M * 2) / n;
  const topY = 2.35;
  steps.forEach((s, i) => {
    const x = M + i * colW;
    slide.addShape(pptx.ShapeType.ellipse, { x, y: topY, w: 0.5, h: 0.5, fill: { color: WHITE }, line: { color: INK, width: 1.5 } });
    addBodyText(slide, String(i + 1), x, topY, 0.5, 0.5, { fontSize: 15, bold: true, align: "center", valign: "middle" });
    addBodyText(slide, s.title, x, topY + 0.72, colW - 0.35, 0.42, { fontSize: 14.5, bold: true });
    addBodyText(slide, s.copy || "", x, topY + 1.18, colW - 0.35, 1.5, { fontSize: 11.5 });
    if (i < n - 1) {
      // light flow connector (the filled circle-arrow is reserved for the current->target "leads to" link)
      addBodyText(slide, "›", x + colW - 0.5, topY, 0.4, 0.5, { fontSize: 22, bold: true, color: NAVY, align: "center", valign: "middle" });
    }
  });
}

function addCycle(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const steps = item.steps || [];
  const cx = W / 2;
  const cy = 4.35;
  const rx = 4.2;
  const ry = 1.75;
  const step = (Math.PI * 2) / Math.max(steps.length, 1);
  slide.addShape(pptx.ShapeType.ellipse, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, fill: { type: "none" }, line: { color: HAIR, width: 1, dashType: "dash" } });
  steps.forEach((_, i) => {
    const mid = step * (i + 0.5) - Math.PI / 2;
    const ax = cx + rx * 0.62 * Math.cos(mid);
    const ay = cy + ry * 0.62 * Math.sin(mid);
    const deg = ((mid + Math.PI / 2) * 180) / Math.PI;
    slide.addShape(pptx.ShapeType.rightArrow, { x: ax - 0.18, y: ay - 0.1, w: 0.36, h: 0.2, rotate: deg, fill: { color: BLUE }, line: { color: BLUE } });
  });
  steps.forEach((s, i) => {
    const a = step * i - Math.PI / 2;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    slide.addShape(pptx.ShapeType.ellipse, { x: x - 0.25, y: y - 0.62, w: 0.5, h: 0.5, fill: { color: WHITE }, line: { color: INK, width: 1.5 } });
    addBodyText(slide, String(i + 1), x - 0.25, y - 0.62, 0.5, 0.5, { fontSize: 14, bold: true, align: "center", valign: "middle" });
    addBodyText(slide, s.title, x - 1.3, y + 0.02, 2.6, 0.36, { fontSize: 13.5, bold: true, align: "center" });
    addBodyText(slide, s.copy || "", x - 1.3, y + 0.42, 2.6, 0.7, { fontSize: 11, align: "center" });
  });
}

function addIssueCauseSolution(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const stages = item.stages || [];
  const n = stages.length || 1;
  const colW = (W - M * 2) / n;
  const topY = 2.3;
  stages.forEach((s, i) => {
    const x = M + i * colW;
    addBodyText(slide, s.label, x, topY, colW - 0.5, 0.34, { fontSize: 15, bold: true });
    slide.addShape(pptx.ShapeType.line, { x, y: topY + 0.42, w: colW - 0.5, h: 0, line: { color: INK, width: 2 } });
    addBodyText(slide, s.heading, x, topY + 0.6, colW - 0.5, 0.7, { fontSize: 14, bold: true });
    addBodyText(slide, s.copy || "", x, topY + 1.35, colW - 0.5, 1.6, { fontSize: 12 });
    if (i < n - 1) {
      slide.addShape(pptx.ShapeType.rightArrow, { x: x + colW - 0.46, y: topY + 1.4, w: 0.32, h: 0.22, fill: { color: BLUE }, line: { color: BLUE } });
    }
  });
}

function addCurrentTargetState(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const panels = item.panels || [];
  const gap = 0.9;
  const panelW = (W - M * 2 - gap) / 2;
  const y = 2.2;
  const panelH = 3.6;
  panels.slice(0, 2).forEach((p, idx) => {
    const x = M + idx * (panelW + gap);
    const isTarget = p.tone === "target";
    // No frame around either panel — the label + rule carries the structure.
    addBodyText(slide, p.label, x + 0.3, y + 0.28, panelW - 0.6, 0.32, { fontSize: 14, bold: true, color: isTarget ? BLUE : INK });
    slide.addShape(pptx.ShapeType.line, { x: x + 0.3, y: y + 0.66, w: panelW - 0.6, h: 0, line: { color: isTarget ? BLUE : INK, width: 1.6 } });
    if (p.heading) addBodyText(slide, p.heading, x + 0.3, y + 0.82, panelW - 0.6, 0.4, { fontSize: 15, bold: true });
    // A/B/C の丸チップは不要（後続で参照しない番号は装飾 — slide-rules §7.13）。
    // 両パネルとも書式ブレットで列挙する
    const bl = toFormattedBullets(p.bullets);
    if (bl) addBodyText(slide, bl, x + 0.3, y + 1.4, panelW - 0.6, panelH - 1.5, { fontSize: 12 });
  });
  // 塗り円＋三角の「▶」は意味を持たない飾りに見える（slide-rules §7.13/§5.13）。
  // 現状→あるべき姿の遷移は細いシェブロン1本で示す（パーツ集の対向シェブロンと同じ文法）。
  const ax = M + panelW + gap / 2;
  const acy = y + 0.9;
  slide.addText("›", { x: ax - 0.2, y: acy - 0.3, w: 0.4, h: 0.6, fontFace: FONT, fontSize: 30, color: MUTED, align: "center", valign: "middle", margin: 0 });
}

function addDecisionFork(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const fork = item.fork || { branches: [] };
  const qX = M;
  const qW = 4.4;
  slide.addShape(pptx.ShapeType.rect, { x: qX, y: 3.0, w: 0.06, h: 1.4, fill: { color: BLUE }, line: { color: BLUE } });
  addBodyText(slide, fork.question || "", qX + 0.28, 3.05, qW - 0.28, 1.3, { fontSize: 17, bold: true });
  const branches = fork.branches || [];
  const spineX = M + 4.7;
  const bX = M + 5.0;
  const bW = W - M - bX;
  const topY = 2.2;
  const bH = Math.min(1.3, (FOOTER_Y - 0.3 - topY) / Math.max(branches.length, 1));
  // vertical spine the branches fan out from
  const spineTop = topY + (bH - 0.18) / 2;
  const spineBot = topY + (branches.length - 1) * bH + (bH - 0.18) / 2;
  if (branches.length > 1) {
    slide.addShape(pptx.ShapeType.line, { x: spineX, y: spineTop, w: 0, h: spineBot - spineTop, line: { color: HAIR, width: 1 } });
  }
  branches.forEach((b, i) => {
    const y = topY + i * bH;
    const rec = !!b.recommended;
    // horizontal connector stub from spine into the branch
    slide.addShape(pptx.ShapeType.line, { x: spineX, y: y + (bH - 0.18) / 2, w: bX - spineX, h: 0, line: { color: rec ? BLUE : HAIR, width: rec ? 1.6 : 0.75 } });
    slide.addShape(pptx.ShapeType.rect, { x: bX, y, w: bW, h: bH - 0.18, fill: { color: WHITE }, line: { color: rec ? BLUE : HAIR, width: rec ? 1.6 : 0.75 } });
    // Inner text positions adapt to box height so 4 compact branches don't overflow.
    const boxH = bH - 0.18;
    addBodyText(slide, b.label, bX + 0.25, y + 0.12, bW - 0.5, 0.3, { fontSize: 14.5, bold: true });
    const outcomeY = y + boxH - 0.28;
    const copyY = y + 0.46;
    const copyBottom = b.outcome ? outcomeY - 0.04 : y + boxH - 0.08;
    addBodyText(slide, b.copy || "", bX + 0.25, copyY, bW - 0.5, Math.max(0.18, copyBottom - copyY), { fontSize: 12 });
    if (b.outcome) addBodyText(slide, b.outcome, bX + 0.25, outcomeY, bW - 0.5, 0.24, { fontSize: 11, bold: true, color: MUTED });
  });
}

function addHeatmap(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const hm = item.heatmap || { colHeaders: [], rows: [] };
  const cols = hm.colHeaders.length || 1;
  const labelW = 2.6;
  const totalW = W - M * 2;
  const cellGap = 0.08;
  const cellW = (totalW - labelW - cellGap * cols) / cols;
  const headerY = 2.2;
  addBodyText(slide, hm.rowLabel || "", M, headerY, labelW, 0.3, { fontSize: 12.5, bold: true });
  hm.colHeaders.forEach((h, ci) => {
    const x = M + labelW + ci * (cellW + cellGap);
    addBodyText(slide, h, x, headerY, cellW, 0.3, { fontSize: 12, bold: true });
    slide.addShape(pptx.ShapeType.line, { x, y: headerY + 0.36, w: cellW, h: 0, line: { color: INK, width: 1.4 } });
  });
  const rowY0 = headerY + 0.55;
  const rowH = 0.72;
  const levelFill = [WHITE, SOFTBLUE, CYAN, BLUE];
  (hm.rows || []).forEach((row, ri) => {
    const y = rowY0 + ri * (rowH + cellGap);
    addBodyText(slide, row.label, M, y + 0.16, labelW - 0.1, 0.4, { fontSize: 12, bold: true });
    (row.cells || []).forEach((c, ci) => {
      const x = M + labelW + ci * (cellW + cellGap);
      const fill = levelFill[c.level] || WHITE;
      slide.addShape(pptx.ShapeType.rect, { x, y, w: cellW, h: rowH, fill: { color: fill }, line: { color: c.level === 0 ? HAIR : fill, width: 0.5 } });
      addBodyText(slide, c.text || "", x, y, cellW, rowH, { fontSize: 11.5, bold: true, align: "center", valign: "middle", color: c.level >= 3 ? WHITE : c.level === 0 ? MUTED : INK });
    });
  });
  const legendY = rowY0 + (hm.rows || []).length * (rowH + cellGap) + 0.15;
  let lx = M;
  (hm.legend || []).forEach((label, i) => {
    slide.addShape(pptx.ShapeType.rect, { x: lx, y: legendY, w: 0.22, h: 0.22, fill: { color: levelFill[i] || WHITE }, line: { color: HAIR, width: 0.5 } });
    addBodyText(slide, label, lx + 0.32, legendY, 1.7, 0.24, { fontSize: 11, color: MUTED });
    lx += 2.1;
  });
}

function addTimelineMatrix(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const lanes = item.lanes || { columns: [], rows: [] };
  const cols = lanes.columns.length || 1;
  const periodW = 2.0;
  const totalW = W - M * 2;
  const colGap = 0.2;
  const colW = (totalW - periodW - colGap * cols) / cols;
  const headerY = 2.2;
  const colX = (ci) => M + periodW + ci * (colW + colGap);
  addBodyText(slide, ((item.headers || {}).phase || "Phase"), M, headerY, periodW, 0.3, { fontSize: 12.5, bold: true });
  slide.addShape(pptx.ShapeType.line, { x: M, y: headerY + 0.36, w: periodW - 0.2, h: 0, line: { color: INK, width: 1.4 } });
  lanes.columns.forEach((c, ci) => {
    addBodyText(slide, c, colX(ci), headerY, colW, 0.3, { fontSize: 12, bold: true });
    slide.addShape(pptx.ShapeType.line, { x: colX(ci), y: headerY + 0.36, w: colW, h: 0, line: { color: INK, width: 1.4 } });
  });
  const rowY0 = headerY + 0.55;
  const rows = lanes.rows || [];
  const rowH = Math.min(1.0, (FOOTER_Y - 0.3 - rowY0) / Math.max(rows.length, 1));
  rows.forEach((row, ri) => {
    const y = rowY0 + ri * rowH;
    addBodyText(slide, row.period, M, y + 0.12, periodW - 0.2, 0.5, { fontSize: 13, bold: true, color: BLUE });
    (row.cells || []).forEach((c, ci) => addBodyText(slide, c, colX(ci), y + 0.12, colW, rowH - 0.2, { fontSize: 12 }));
    slide.addShape(pptx.ShapeType.line, { x: M, y: y + rowH - 0.04, w: totalW, h: 0, line: { color: HAIR, width: 0.5, dashType: "dash" } });
  });
}

function addProcessMatrix(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const grid = item.grid || { colHeaders: [], rows: [] };
  const cols = grid.colHeaders.length || 1;
  const labelW = 2.4;
  const totalW = W - M * 2;
  const gap = 0.14;
  const cellW = (totalW - labelW - gap * cols) / cols;
  const headerY = 2.2;
  const colX = (ci) => M + labelW + ci * (cellW + gap);
  addBodyText(slide, grid.rowLabel || "", M, headerY, labelW, 0.3, { fontSize: 12.5, bold: true });
  grid.colHeaders.forEach((h, ci) => {
    addBodyText(slide, h, colX(ci), headerY, cellW, 0.3, { fontSize: 12, bold: true });
    slide.addShape(pptx.ShapeType.line, { x: colX(ci), y: headerY + 0.36, w: cellW, h: 0, line: { color: INK, width: 1.4 } });
  });
  const rowY0 = headerY + 0.55;
  const rows = grid.rows || [];
  const rowH = Math.min(1.15, (FOOTER_Y - 0.3 - rowY0) / Math.max(rows.length, 1));
  rows.forEach((row, ri) => {
    const y = rowY0 + ri * rowH;
    addBodyText(slide, row.label, M, y + 0.2, labelW - 0.1, rowH - 0.3, { fontSize: 12, bold: true });
    (row.cells || []).forEach((c, ci) => {
      if (!c) return;
      const x = colX(ci);
      slide.addShape(pptx.ShapeType.rect, { x, y, w: cellW, h: rowH - 0.18, fill: { color: SOFTBLUE }, line: { color: SOFTBLUE } });
      addBodyText(slide, c, x + 0.18, y + 0.16, cellW - 0.36, rowH - 0.4, { fontSize: 11.5 });
    });
  });
}

function addStackedBar(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const stacks = item.stacks || { categories: [] };
  addBodyText(slide, stacks.unit || "", M, 2.1, 7.0, 0.3, { fontSize: 14, bold: true });
  const cats = stacks.categories || [];
  const totals = cats.map((c) => (c.segments || []).reduce((a, s) => a + s.value, 0));
  const max = Math.max(...totals, 1);
  const baseY = 6.1;
  const maxH = 3.3;
  const totalW = W - M * 2 - 0.6;
  const slot = totalW / Math.max(cats.length, 1);
  const barW = Math.min(1.3, slot - 0.5);
  const segColors = [NAVY, BLUE, CYAN, SOFTBLUE];
  cats.forEach((c, i) => {
    const x = M + 0.3 + i * slot + (slot - barW) / 2;
    let cursor = baseY;
    (c.segments || []).forEach((s, si) => {
      const h = (s.value / max) * maxH;
      const color = segColors[si] || NAVY;
      slide.addShape(pptx.ShapeType.rect, { x, y: cursor - h, w: barW, h, fill: { color } });
      addBodyText(slide, String(s.value), x, cursor - h + h / 2 - 0.12, barW, 0.24, { fontSize: 11, bold: true, align: "center", color: si >= 2 ? INK : WHITE });
      cursor -= h;
    });
    addBodyText(slide, c.label, x - 0.2, baseY + 0.1, barW + 0.4, 0.28, { fontSize: 12, bold: true, align: "center" });
  });
  let lx = M;
  (stacks.legend || []).forEach((label, i) => {
    slide.addShape(pptx.ShapeType.rect, { x: lx, y: 6.5, w: 0.22, h: 0.22, fill: { color: segColors[i] || NAVY } });
    addBodyText(slide, label, lx + 0.32, 6.5, 1.6, 0.24, { fontSize: 11, color: MUTED });
    lx += 2.0;
  });
}

function addTrueWaterfall(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  addBodyText(slide, item.chart?.unit || "", M, 2.1, 7.0, 0.3, { fontSize: 14, bold: true });
  const series = item.chart?.series || [];
  let running = 0;
  const points = series.map((d) => {
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
  const domainMin = Math.min(0, ...points.map((p) => p.bottom));
  const domainMax = Math.max(1, ...points.map((p) => p.top));
  const range = domainMax - domainMin || 1;
  const baseY = 6.1;
  const maxH = 3.3;
  const totalW = W - M * 2 - 0.6;
  const slot = totalW / points.length;
  const barW = Math.min(1.1, slot - 0.4);
  const fillFor = { base: NAVY, up: BLUE, down: ROSE, total: INK };
  points.forEach((p, i) => {
    const x = M + 0.3 + i * slot + (slot - barW) / 2;
    const h = ((p.top - p.bottom) / range) * maxH;
    const yTop = baseY - ((p.top - domainMin) / range) * maxH;
    slide.addShape(pptx.ShapeType.rect, { x, y: yTop, w: barW, h, fill: { color: fillFor[p.kind] || NAVY } });
    addBodyText(slide, p.display, x - 0.2, yTop - 0.28, barW + 0.4, 0.22, { fontSize: 11, bold: true, align: "center" });
    addBodyText(slide, p.label, x - 0.3, baseY + 0.1, barW + 0.6, 0.4, { fontSize: 10.5, align: "center" });
  });
  // ゼロ基準の横線が無く、棒が宙に浮いて見えていた（addWaterfall には元からある）。
  // 棒の下端＝ゼロ位置に基準線を引く。ゼロが領域の途中にある場合はその高さに引く。
  const zeroY = baseY - ((0 - domainMin) / range) * maxH;
  slide.addShape(pptx.ShapeType.line, { x: M, y: baseY, w: totalW + 0.6, h: 0, line: { color: INK, width: 1 } });
  if (zeroY < baseY - 0.02) {
    slide.addShape(pptx.ShapeType.line, { x: M, y: zeroY, w: totalW + 0.6, h: 0, line: { color: HAIR, width: 0.75, dashType: "dash" } });
  }
}

function addCauseEffect(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const ce = item.causeEffect || { causes: [] };
  const causes = ce.causes || [];
  const leftW = 5.6;
  const topY = 2.2;
  const gap = 0.22;
  const cH = Math.min(1.3, (FOOTER_Y - 0.4 - topY - gap * (causes.length - 1)) / Math.max(causes.length, 1));
  causes.forEach((c, i) => {
    const y = topY + i * (cH + gap);
    slide.addShape(pptx.ShapeType.rect, { x: M, y, w: leftW, h: cH, fill: { color: WHITE }, line: { color: HAIR, width: 0.75 } });
    slide.addShape(pptx.ShapeType.rect, { x: M, y, w: 0.07, h: cH, fill: { color: CYAN } });
    addBodyText(slide, c.label, M + 0.3, y + 0.16, leftW - 0.5, 0.34, { fontSize: 14, bold: true });
    if (c.detail) addBodyText(slide, c.detail, M + 0.3, y + 0.56, leftW - 0.5, cH - 0.6, { fontSize: 11.5, color: MUTED });
  });
  const arrowX = M + leftW + 0.2;
  const midY = topY + ((causes.length - 1) * (cH + gap) + cH) / 2;
  slide.addShape(pptx.ShapeType.rightArrow, { x: arrowX, y: midY - 0.16, w: 0.5, h: 0.32, fill: { color: BLUE }, line: { color: BLUE } });
  const effX = arrowX + 0.85;
  const effW = W - M - effX;
  const effH = (causes.length - 1) * (cH + gap) + cH;
  slide.addShape(pptx.ShapeType.rect, { x: effX, y: topY, w: effW, h: effH, fill: { color: WHITE }, line: { color: BLUE, width: 1.6 } });
  addBodyText(slide, ((item.headers || {}).effect || "EFFECT"), effX + 0.3, topY + 0.3, effW - 0.6, 0.26, { fontSize: 11, bold: true, color: BLUE });
  addBodyText(slide, ce.effect || "", effX + 0.3, topY + 0.7, effW - 0.6, effH - 1.0, { fontSize: 17, bold: true });
}

function addChevronRail(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const steps = item.steps || [];
  const n = steps.length || 1;
  const y = 2.5;
  const h = 1.5;
  const slot = (W - M * 2) / n;
  const chevW = slot + 0.35;
  steps.forEach((s, i) => {
    const x = M + i * slot;
    slide.addShape(pptx.ShapeType.chevron, { x, y, w: chevW, h, fill: { color: SOFTBLUE }, line: { color: WHITE, width: 1 } });
    slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.3, y: y + h / 2 - 0.22, w: 0.44, h: 0.44, fill: { color: NAVY }, line: { color: NAVY } });
    addBodyText(slide, String(i + 1), x + 0.3, y + h / 2 - 0.22, 0.44, 0.44, { fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle" });
    addBodyText(slide, s.title, x + 0.85, y + 0.42, slot - 0.7, 0.32, { fontSize: 13, bold: true });
    if (s.copy) addBodyText(slide, s.copy, x + 0.85, y + 0.76, slot - 0.7, 0.5, { fontSize: 10.5 });
  });
}

function addGantt(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const g = item.gantt || { periods: [], rows: [] };
  const cols = g.periods.length || 1;
  const rows = g.rows || [];
  const bands = g.periodBands || [];
  const milestones = g.milestones || [];
  const groupW = 1.5;
  const labelW = 2.0;
  const totalW = W - M * 2;
  const trackX = M + groupW + labelW;
  const trackW = totalW - groupW - labelW;
  const colW = trackW / cols;
  const colLeft = (i) => trackX + i * colW;
  const colCenter = (i) => trackX + (i + 0.5) * colW;
  const phaseColor = { plan: CYAN, build: BLUE, scale: NAVY };

  let y = 2.0;
  // year bands
  if (bands.length) {
    let bx = trackX;
    bands.forEach((b) => {
      const w = b.span * colW;
      slide.addShape(pptx.ShapeType.rect, { x: bx, y, w, h: 0.32, fill: { color: WHITE }, line: { color: HAIR, width: 0.75 } });
      addBodyText(slide, b.label, bx, y, w, 0.32, { fontSize: 12, bold: true, align: "center", valign: "middle" });
      bx += w;
    });
    y += 0.36;
  }
  // month header
  g.periods.forEach((p, i) => addBodyText(slide, p, colLeft(i), y, colW, 0.3, { fontSize: 10.5, bold: true, align: "center" }));
  const monthsBottom = y + 0.34;
  slide.addShape(pptx.ShapeType.line, { x: M, y: monthsBottom, w: totalW, h: 0, line: { color: INK, width: 1.4 } });

  // milestone row
  let tasksTop = monthsBottom + 0.08;
  if (milestones.length) {
    const my = tasksTop;
    milestones.forEach((m) => {
      const cx = colCenter(m.at);
      slide.addShape(pptx.ShapeType.triangle, { x: cx - 0.1, y: my, w: 0.2, h: 0.18, fill: { color: INK } });
      addBodyText(slide, m.label, cx - 0.95, my + 0.2, 1.9, 0.22, { fontSize: 9, bold: true, align: "center" });
    });
    tasksTop = my + 0.52;
  }

  // grouped task rows
  const groups = [];
  rows.forEach((r) => {
    const k = r.group || "";
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.rows.push(r);
    else groups.push({ key: k, rows: [r] });
  });
  const available = FOOTER_Y - 0.3 - tasksTop;
  const rowH = Math.min(0.52, available / Math.max(rows.length, 1));
  const barH = Math.min(0.22, rowH - 0.18); // scale bar to row height so bars never overlap
  const chartBottom = tasksTop + rows.length * rowH;

  // vertical month gridlines across the task area
  for (let i = 1; i < cols; i += 1) {
    slide.addShape(pptx.ShapeType.line, { x: colLeft(i), y: monthsBottom, w: 0, h: chartBottom - monthsBottom, line: { color: HAIR, width: 0.4 } });
  }

  let ri = 0;
  groups.forEach((group) => {
    const gy = tasksTop + ri * rowH;
    const gh = group.rows.length * rowH;
    if (group.key) addBodyText(slide, group.key, M, gy, groupW - 0.1, gh, { fontSize: 12, bold: true, align: "center", valign: "middle" });
    slide.addShape(pptx.ShapeType.line, { x: M, y: gy, w: totalW, h: 0, line: { color: INK, width: 0.8 } });
    group.rows.forEach((r) => {
      const yy = tasksTop + ri * rowH;
      addBodyText(slide, r.label, M + groupW, yy, labelW - 0.1, rowH, { fontSize: 10.5, valign: "middle" });
      const bx = colLeft(r.start);
      const bw = r.span * colW;
      const barY = yy + rowH / 2 - barH / 2;
      const color = phaseColor[r.phase] || BLUE;
      if (r.ongoing) {
        slide.addShape(pptx.ShapeType.rightArrow, { x: bx + 0.04, y: barY, w: Math.max(0.25, bw - 0.08), h: barH, fill: { color } });
      } else {
        slide.addShape(pptx.ShapeType.rect, { x: bx + 0.04, y: barY, w: Math.max(0.2, bw - 0.08), h: barH, fill: { color } });
      }
      ri += 1;
    });
  });
}

function addIssueTree(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const t = item.tree || { branches: [] };
  const branches = t.branches || [];
  // Proper 3-level issue tree: root -> sub-issues -> leaves, with elbow
  // connectors, using the full slide width.
  const topY = 2.2;
  const areaH = FOOTER_Y - 0.35 - topY;
  const rowH = areaH / Math.max(branches.length, 1);
  const rootW = 2.5;
  const branchX = M + rootW + 0.7;
  const branchW = 3.0;
  const leafX = branchX + branchW + 0.7;
  const leafW = W - M - leafX;
  const branchH = 0.6;

  const branchCY = (i) => topY + i * rowH + rowH / 2;

  // Root box, vertically centered on the branch block
  const rootH = 1.1;
  const rootCY = topY + areaH / 2;
  slide.addShape(pptx.ShapeType.rect, { x: M, y: rootCY - rootH / 2, w: rootW, h: rootH, fill: { color: NAVY }, line: { color: NAVY } });
  addBodyText(slide, t.root || "", M + 0.2, rootCY - rootH / 2 + 0.1, rootW - 0.4, rootH - 0.2, { fontSize: 13, bold: true, color: WHITE, valign: "middle" });

  // Root -> branches spine
  const spine1 = M + rootW + 0.35;
  slide.addShape(pptx.ShapeType.line, { x: M + rootW, y: rootCY, w: 0.35, h: 0, line: { color: HAIR, width: 1 } });
  if (branches.length > 1)
    slide.addShape(pptx.ShapeType.line, { x: spine1, y: branchCY(0), w: 0, h: branchCY(branches.length - 1) - branchCY(0), line: { color: HAIR, width: 1 } });

  branches.forEach((b, i) => {
    const cy = branchCY(i);
    slide.addShape(pptx.ShapeType.line, { x: spine1, y: cy, w: 0.35, h: 0, line: { color: HAIR, width: 1 } });
    slide.addShape(pptx.ShapeType.rect, { x: branchX, y: cy - branchH / 2, w: branchW, h: branchH, fill: { color: SOFTBLUE }, line: { type: "none" } });
    addBodyText(slide, b.label, branchX + 0.15, cy - branchH / 2 + 0.06, branchW - 0.3, branchH - 0.12, { fontSize: 12, bold: true, valign: "middle" });

    const kids = b.children || [];
    if (!kids.length) return;
    const leafH = 0.45;
    const leafGap = Math.min(0.18, (rowH - kids.length * leafH) / Math.max(kids.length, 1));
    const blockH = kids.length * leafH + (kids.length - 1) * leafGap;
    const leafCY = (ki) => cy - blockH / 2 + leafH / 2 + ki * (leafH + leafGap);
    const spine2 = leafX - 0.35;
    slide.addShape(pptx.ShapeType.line, { x: branchX + branchW, y: cy, w: spine2 - branchX - branchW, h: 0, line: { color: HAIR, width: 1 } });
    if (kids.length > 1)
      slide.addShape(pptx.ShapeType.line, { x: spine2, y: leafCY(0), w: 0, h: leafCY(kids.length - 1) - leafCY(0), line: { color: HAIR, width: 1 } });
    kids.forEach((c, ki) => {
      const lcy = leafCY(ki);
      slide.addShape(pptx.ShapeType.line, { x: spine2, y: lcy, w: 0.35, h: 0, line: { color: HAIR, width: 1 } });
      addBodyText(slide, c, leafX + 0.05, lcy - leafH / 2 + 0.04, leafW - 0.1, leafH - 0.08, { fontSize: 11.5, valign: "middle" });
    });
  });
}

/* ===== additional archetypes (see the HTML renderer for the shared
   grammar; geometry mirrors it so renderer and exporter stay drift-free). ===== */

// The metric definition ("指標名, 単位, 期間") is its own quiet line under the
// title — never merged into the claim. Returns the y the body should start at.
function addMetricSub(slide, item) {
  if (!item.subtitle) return 2.3;
  addBodyText(slide, item.subtitle, M, 1.78, W - M * 2, 0.3, { fontSize: 12.5, bold: true, color: MUTED });
  return 2.42;
}

function addBigStatPair(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const y = addMetricSub(slide, item);
  const stats = (item.kpis || []).slice(0, 3);
  const n = stats.length || 1;
  const gap = 0.8;
  const colW = (W - M * 2 - gap * (n - 1)) / n;
  stats.forEach((k, i) => {
    const x = M + i * (colW + gap);
    addBodyText(slide, k.value, x, y + 0.2, colW, 1.5, { fontSize: 72, bold: true, color: BLUE });
    addBodyText(slide, k.label, x, y + 1.9, colW, 0.8, { fontSize: 15 });
    if (k.note) addBodyText(slide, k.note, x, y + 2.75, colW, 0.7, { fontSize: 11.5, color: MUTED });
  });
}

function addNumberedImperatives(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const y = addMetricSub(slide, item);
  const cols = item.sections || [];
  const n = cols.length || 1;
  const gap = 0.4;
  const colW = (W - M * 2 - gap * (n - 1)) / n;
  cols.forEach((c, i) => {
    const x = M + i * (colW + gap);
    addBodyText(slide, String(i + 1), x, y, colW, 0.55, { fontSize: 30, bold: true, color: BLUE });
    slide.addShape(pptx.ShapeType.line, { x, y: y + 0.62, w: colW, h: 0, line: { color: INK, width: 1 } });
    addBodyText(slide, c.title, x, y + 0.74, colW, 0.6, { fontSize: 15, bold: true });
    if (c.copy) addBodyText(slide, c.copy, x, y + 1.4, colW, 2.4, { fontSize: 12, color: MUTED });
  });
}

function addThemeCardGrid(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const y = addMetricSub(slide, item);
  const cards = item.sections || [];
  const n = cards.length || 1;
  const gap = 0.3;
  const colW = (W - M * 2 - gap * (n - 1)) / n;
  cards.forEach((c, i) => {
    const x = M + i * (colW + gap);
    let yy = y;
    if (c.label) {
      slide.addShape(pptx.ShapeType.rect, { x, y: yy, w: colW, h: 0.3, fill: { color: BLUE }, line: { color: BLUE } });
      addBodyText(slide, c.label, x + 0.08, yy + 0.03, colW - 0.16, 0.24, { fontSize: 10, bold: true, color: WHITE });
      yy += 0.5;
    }
    addBodyText(slide, c.title, x, yy, colW, 0.55, { fontSize: 14, bold: true, color: BLUE });
    if (c.copy) addBodyText(slide, c.copy, x, yy + 0.62, colW, 1.9, { fontSize: 11.5 });
    if (c.value) addBodyText(slide, c.value, x, y + 3.05, colW, 0.6, { fontSize: 26, bold: true });
    if (i < n - 1) {
      slide.addShape(pptx.ShapeType.line, { x: x + colW + gap / 2, y, w: 0, h: 3.5, line: { color: HAIR, width: 1, dashType: "dot" } });
    }
  });
}

function addQuestionFramework(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const y = addMetricSub(slide, item);
  const items = item.sections || [];
  const areas = [...new Set(items.map((s) => s.label).filter(Boolean))];
  const sideW = areas.length ? 2.0 : 0;
  if (areas.length) {
    // Fit the label rail inside the content area: the fixed 0.85 pitch overflowed
    // the footer once there were 5+ labels. No separator after the last label.
    const railPitch = Math.min(0.85, (CONTENT_AREA_BOTTOM - y - 0.55) / Math.max(areas.length, 1));
    areas.forEach((a, i) => {
      const ay = y + i * railPitch;
      addBodyText(slide, a, M, ay, sideW - 0.25, 0.32, { fontSize: 12, bold: true, color: MUTED });
      if (i < areas.length - 1)
        slide.addShape(pptx.ShapeType.line, { x: M, y: ay + railPitch - 0.18, w: sideW - 0.25, h: 0, line: { color: HAIR, width: 1, dashType: "dot" } });
    });
    const railH = (areas.length - 1) * railPitch + 0.35;
    const qH = Math.ceil((items.length || 1) / 2) * 1.3;
    slide.addShape(pptx.ShapeType.line, { x: M + sideW - 0.15, y, w: 0, h: Math.min(CONTENT_AREA_BOTTOM - y, Math.max(railH, qH)), line: { color: HAIR, width: 1 } });
  }
  const mainX = M + sideW;
  const mainW = W - M - mainX;
  const perRow = 2;
  const gap = 0.4;
  const cellW = (mainW - gap) / perRow;
  items.forEach((s, i) => {
    const x = mainX + (i % perRow) * (cellW + gap);
    const yy = y + Math.floor(i / perRow) * 1.3;
    addBodyText(slide, `${i + 1}   ${s.title}`, x, yy, cellW, 0.36, { fontSize: 14, bold: true });
    if (s.copy) addBodyText(slide, s.copy, x, yy + 0.42, cellW, 0.8, { fontSize: 11.5, color: MUTED });
  });
}

function addEvidenceBasis(item, pageNum) {
  // This archetype owns `subtitle`: it is the rationale column, not a metric line.
  const slide = addShell(item, pageNum, { titleRule: false });
  const y = 2.3;
  const whyW = 3.7;
  if (item.subtitle) addBodyText(slide, item.subtitle, M, y, whyW, 2.6, { fontSize: 13, color: MUTED });
  const rows = item.sections || [];
  const rowsX = M + whyW + 0.7;
  const rowsW = W - M - rowsX;
  rows.forEach((r, i) => {
    const ry = y + i * 0.86;
    if (r.value) addBodyText(slide, r.value, rowsX, ry, 1.9, 0.5, { fontSize: 26, bold: true, color: BLUE });
    addBodyText(slide, r.copy || r.title, rowsX + 2.05, ry + 0.08, rowsW - 2.05, 0.6, { fontSize: 12 });
    slide.addShape(pptx.ShapeType.line, { x: rowsX, y: ry + 0.7, w: rowsW, h: 0, line: { color: HAIR, width: 1 } });
  });
}

function addKpiDashboard(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const kpis = item.kpis || [];
  const n = kpis.length || 1;
  const gap = 0.4;
  const tileW = (W - M * 2 - gap * (n - 1)) / n;
  const y = 2.3;
  kpis.forEach((k, i) => {
    const x = M + i * (tileW + gap);
    slide.addShape(pptx.ShapeType.line, { x, y, w: tileW, h: 0, line: { color: INK, width: 2 } });
    addBodyText(slide, k.label, x, y + 0.16, tileW, 0.3, { fontSize: 12, bold: true, color: MUTED });
    addBodyText(slide, k.value, x, y + 0.5, tileW, 0.7, { fontSize: 34, bold: true, color: BLUE });
    if (k.delta) addBodyText(slide, k.delta, x, y + 1.3, tileW, 0.3, { fontSize: 13, bold: true, color: GREEN });
    if (k.note) addBodyText(slide, k.note, x, y + 1.65, tileW, 0.5, { fontSize: 11, color: MUTED });
  });
}

function addRecommendationPillars(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const pillars = item.sections || [];
  const n = pillars.length || 1;
  const gap = 0.5;
  const colW = (W - M * 2 - gap * (n - 1)) / n;
  const y = 2.3;
  pillars.forEach((p, i) => {
    const x = M + i * (colW + gap);
    slide.addShape(pptx.ShapeType.line, { x, y, w: colW, h: 0, line: { color: BLUE, width: 2.5 } });
    slide.addShape(pptx.ShapeType.ellipse, { x, y: y + 0.18, w: 0.5, h: 0.5, fill: { color: BLUE }, line: { color: BLUE } });
    addBodyText(slide, String(i + 1), x, y + 0.18, 0.5, 0.5, { fontSize: 16, bold: true, color: WHITE, align: "center", valign: "middle" });
    addBodyText(slide, p.title, x, y + 0.84, colW, 0.5, { fontSize: 15, bold: true });
    let yy = y + 1.4;
    if (p.copy) {
      addBodyText(slide, p.copy, x, yy, colW, 0.6, { fontSize: 12, color: INK });
      yy += 0.7;
    }
    const bullets = toFormattedBullets(p.bullets);
    if (bullets) addBodyText(slide, bullets, x, yy, colW, 2.0, { fontSize: 12 });
  });
}

function addSmallMultiples(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const panels = item.multiples || [];
  const n = panels.length || 1;
  const perRow = n <= 3 ? n : Math.ceil(n / 2);
  const rowsCount = Math.ceil(n / perRow);
  const gapX = 0.5;
  const gapY = 0.5;
  const panelW = (W - M * 2 - gapX * (perRow - 1)) / perRow;
  const areaTop = 2.2;
  const panelH = Math.min(2.2, (FOOTER_Y - 0.3 - areaTop - gapY * (rowsCount - 1)) / rowsCount);
  // Shared scale across all panels so bar magnitudes are comparable.
  const globalMax = Math.max(...panels.flatMap((p) => (p.series || []).map((d) => d.value)), 1);
  panels.forEach((p, i) => {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const x = M + c * (panelW + gapX);
    const y = areaTop + r * (panelH + gapY);
    addBodyText(slide, p.label, x, y, panelW, 0.3, { fontSize: 12, bold: true });
    slide.addShape(pptx.ShapeType.line, { x, y: y + 0.34, w: panelW, h: 0, line: { color: HAIR, width: 0.75 } });
    const series = p.series || [];
    const max = globalMax;
    const chartTop = y + 0.5;
    const baseY = y + panelH - 0.28;
    const maxBarH = baseY - chartTop;
    const slotW = panelW / series.length;
    const barW = Math.min(0.5, slotW - 0.2);
    series.forEach((d, j) => {
      const bh = (d.value / max) * maxBarH;
      const bx = x + j * slotW + (slotW - barW) / 2;
      slide.addShape(pptx.ShapeType.rect, { x: bx, y: baseY - bh, w: barW, h: bh, fill: { color: NAVY }, line: { color: NAVY } });
      addBodyText(slide, d.label, x + j * slotW, baseY + 0.02, slotW, 0.22, { fontSize: 9, color: MUTED, align: "center" });
    });
  });
}

function addNestedRowMatrix(item, pageNum) {
  // 内容の列挙で最もよく使う型。規約に合わせて作り直した
  //  - 軸（大分類・小分類）は塗りつぶしでなく太字＋罫線で示す（slide-rules §6「軸は塗りでなく罫線」）
  //  - 行区切りは点線でなく薄い実線1本。最終行の下には引かない（§5.4）
  //  - 列見出しを置き、各列が何かを言葉で示す
  const slide = addShell(item, pageNum, { titleRule: false });
  const nested = item.nested || {};
  const groups = nested.groups || [];
  const heads = nested.headers || {};
  const totalRows = groups.reduce((a, g) => a + g.rows.length, 0) || 1;
  const groupW = 2.3;
  const labelW = 2.6;
  const contentX = M + groupW + labelW + 0.2;
  const contentW = W - M - contentX;
  const headY = 2.02;
  const topY = headY + 0.42;
  const available = FOOTER_Y - 0.34 - topY;
  const rowH = Math.min(1.05, available / totalRows);

  // 列見出し＋太い下罫（表ヘッダーと同じ文法）
  addBodyText(slide, heads.group || "大分類", M, headY, groupW, 0.3, { fontSize: 12.5, bold: true, color: INK });
  addBodyText(slide, heads.row || "小分類", M + groupW, headY, labelW, 0.3, { fontSize: 12.5, bold: true, color: INK });
  addBodyText(slide, heads.content || "内容", contentX, headY, contentW, 0.3, { fontSize: 12.5, bold: true, color: INK });
  slide.addShape(pptx.ShapeType.line, { x: M, y: topY - 0.06, w: W - M * 2, h: 0, line: { color: INK, width: 1.2 } });

  let ri = 0;
  groups.forEach((group, gi) => {
    const gy = topY + ri * rowH;
    const gh = group.rows.length * rowH;
    // 大分類: 明朝の太字＋左の縦罫（塗らない）
    slide.addShape(pptx.ShapeType.line, { x: M, y: gy + 0.06, w: 0, h: gh - 0.14, line: { color: INK, width: 2 } });
    addBodyText(slide, group.label, M + 0.14, gy + 0.06, groupW - 0.24, gh - 0.14,
      { fontSize: 13.5, bold: true, color: INK, valign: "middle" });
    if (gi > 0) {
      slide.addShape(pptx.ShapeType.line, { x: M, y: gy, w: W - M * 2, h: 0, line: { color: MUTED, width: 0.9 } });
    }
    group.rows.forEach((r, riInGroup) => {
      const yy = topY + ri * rowH;
      addBodyText(slide, r.label, M + groupW, yy + 0.08, labelW - 0.2, rowH - 0.16,
        { fontSize: 12, bold: true, color: INK, valign: "middle" });
      let cy = yy + 0.1;
      if (r.copy) {
        addBodyText(slide, r.copy, contentX, cy, contentW, 0.34, { fontSize: 11.5 });
        cy += 0.34;
      }
      const bullets = toFormattedBullets(r.bullets);
      if (bullets) addBodyText(slide, bullets, contentX, cy, contentW, rowH - 0.14 - (cy - yy), { fontSize: 11.5 });
      // 行区切りは薄い実線。グループ末尾と最終行の下には引かない
      const isGroupLast = riInGroup === group.rows.length - 1;
      if (!isGroupLast) {
        slide.addShape(pptx.ShapeType.line, { x: M + groupW, y: yy + rowH, w: W - M - (M + groupW), h: 0,
          line: { color: HAIR, width: 0.6 } });
      }
      ri += 1;
    });
  });
}

function addCalcFlow(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const c = item.calc || { panels: [] };
  const panels = c.panels || [];
  if (c.unit) addBodyText(slide, c.unit, M, 2.05, W - M * 2, 0.3, { fontSize: 14, bold: true });
  const segColors = [NAVY, BLUE, CYAN, SOFTBLUE];
  const areaTop = 2.5;
  const areaH = FOOTER_Y - 0.5 - areaTop - 0.45;
  const opGap = 0.2;
  const opW = 0.4;
  const opCount = panels.filter((p) => p.op).length;
  const panelCount = panels.length || 1;
  const totalW = W - M * 2;
  const panelW = (totalW - opCount * opW - (panelCount + opCount - 1) * opGap) / panelCount;
  let x = M;
  panels.forEach((p) => {
    if (p.op) {
      const glyph = p.op === "x" ? "×" : p.op === "eq" ? "=" : "›";
      addBodyText(slide, glyph, x, areaTop, opW, areaH, { fontSize: 30, bold: true, color: NAVY, align: "center", valign: "middle" });
      x += opW + opGap;
    }
    addBodyText(slide, p.label, x, areaTop, panelW, 0.3, { fontSize: 12, bold: true });
    slide.addShape(pptx.ShapeType.line, { x, y: areaTop + 0.34, w: panelW, h: 0, line: { color: HAIR, width: 0.5 } });
    const chartTop = areaTop + 0.5;
    const baseY = areaTop + areaH - 0.3;
    const maxBarH = baseY - chartTop;
    const cats = p.categories || [];
    const totals = cats.map((cat) => (cat.segments || []).reduce((a, s) => a + s.value, 0));
    const max = Math.max(...totals, 1);
    const slotW = panelW / Math.max(cats.length, 1);
    const barW = Math.min(0.6, slotW - 0.15);
    cats.forEach((cat, ci) => {
      const bx = x + ci * slotW + (slotW - barW) / 2;
      let cursor = baseY;
      (cat.segments || []).forEach((s, si) => {
        const h = (s.value / max) * maxBarH;
        const color = segColors[si] || NAVY;
        slide.addShape(pptx.ShapeType.rect, { x: bx, y: cursor - h, w: barW, h, fill: { color } });
        if (h >= 0.2) addBodyText(slide, String(s.value), bx, cursor - h, barW, h, { fontSize: 9, bold: true, color: si >= 2 ? INK : WHITE, align: "center", valign: "middle" });
        cursor -= h;
      });
      addBodyText(slide, cat.label, x + ci * slotW, baseY + 0.05, slotW, 0.22, { fontSize: 10, bold: true, align: "center" });
    });
    x += panelW + opGap;
  });
  if (Array.isArray(c.legend) && c.legend.length) {
    let lx = M;
    c.legend.forEach((label, i) => {
      const color = segColors[i] || NAVY;
      slide.addShape(pptx.ShapeType.rect, { x: lx, y: FOOTER_Y - 0.45, w: 0.2, h: 0.2, fill: { color } });
      addBodyText(slide, label, lx + 0.28, FOOTER_Y - 0.47, 1.6, 0.22, { fontSize: 11, color: MUTED, valign: "middle" });
      lx += 1.8;
    });
  }
}

function addChevronValueChain(item, pageNum) {
  const slide = addShell(item, pageNum, { titleRule: false });
  const vc = item.valueChain || { rails: [] };
  const rails = vc.rails || [];
  const attrs = vc.attributes || [];
  const stepCount = Math.max(0, ...rails.map((r) => (r.steps || []).length)) || 1;
  const totalW = W - M * 2;
  const overlap = 0.2;
  const stepW = (totalW - overlap) / stepCount;
  const chevW = stepW + overlap;
  const chevH = 0.45;

  // Rail label sits above its band; descriptions form ruled columns below each
  // segment so real copy reads as a structured grid, not floating lines.
  const y0 = 2.05;
  const attrH = attrs.length * 0.9;
  const slotH = (FOOTER_Y - 0.3 - y0 - attrH) / Math.max(rails.length, 1);
  let y = y0;
  rails.forEach((rail, ri) => {
    const tone = rail.tone || (ri === 0 ? "primary" : "alt");
    const fill = tone === "primary" ? NAVY : CYAN;
    const textColor = tone === "primary" ? WHITE : INK;
    let ry = y;
    if (rail.label) {
      addBodyText(slide, rail.label, M, ry, totalW, 0.26, { fontSize: 11.5, bold: true, color: MUTED });
      ry += 0.34;
    }
    (rail.steps || []).forEach((s, ci) => {
      const x = M + ci * stepW;
      // First segment is a flat-left pentagon so the chain doesn't start with a notch.
      const shape = ci === 0 ? pptx.ShapeType.homePlate : pptx.ShapeType.chevron;
      slide.addShape(shape, { x, y: ry, w: chevW, h: chevH, fill: { color: fill }, line: { color: WHITE, width: 1 } });
      addBodyText(slide, s.label, x + 0.12, ry, chevW - 0.4, chevH, { fontSize: 10.5, bold: true, color: textColor, align: "center", valign: "middle" });
    });
    const railHasDesc = (rail.steps || []).some((s) => s.description);
    if (railHasDesc) {
      const dy = ry + chevH + 0.12;
      const descH = Math.max(0.5, y + slotH - dy - 0.25);
      (rail.steps || []).forEach((s, ci) => {
        const x = M + ci * stepW;
        if (ci > 0)
          slide.addShape(pptx.ShapeType.line, { x: x + 0.02, y: dy + 0.02, w: 0, h: descH - 0.08, line: { color: HAIR, width: 0.5 } });
        if (s.description)
          addBodyText(slide, s.description, x + (ci > 0 ? 0.14 : 0.02), dy, stepW - 0.3, descH, { fontSize: 10, color: INK });
      });
    }
    y += slotH;
  });
  attrs.forEach((a) => {
    const ay = y;
    slide.addShape(pptx.ShapeType.line, { x: M, y: ay, w: totalW, h: 0, line: { color: HAIR, width: 0.5 } });
    addBodyText(slide, a.label, M, ay + 0.06, 1.2, 0.6, { fontSize: 11, bold: true, color: MUTED, valign: "middle" });
    (a.values || []).forEach((v, ci) => {
      const x = M + ci * stepW;
      addBodyText(slide, v, x + 0.05, ay + 0.06, stepW - 0.15, 0.8, { fontSize: 10 });
    });
    y += 0.9;
  });
}

// ── 型プラグイン（scripts/archetypes/*.mjs） ──────────────────────────────
// 自由記述パーツ集（templates/freeform_parts_16x9.html）の各パーツを編集可能PPTXでも出すための追加型。
// 1ファイル=1型。`export const id`, `export function pptx(ctx, item, pageNum)`, 任意で `html(ctx, item, n)` / `example`。
// 本体の add* 関数と同じヘルパーを ctx 経由で使う（外枠・余白・配色・書式ブレット・縦バランス）。
const ARCHETYPES = await (async () => {
  const dir = path.resolve(root, "scripts/archetypes");
  const map = new Map();
  let files = [];
  try { files = (await fs.readdir(dir)).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort(); } catch { return map; }
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    if (mod.id && typeof mod.pptx === "function") map.set(mod.id, mod);
  }
  return map;
})();
const ctx = {
  pptx, deck, W, H, M, TOP, CONTENT_TOP, FOOTER_Y, CONTENT_AREA_TOP, CONTENT_AREA_BOTTOM,
  FONT, FONT_SERIF, LANG,
  colors: { INK, NAVY, MUTED, HAIR, BLUE, CYAN, ROSE, WARNING, GREEN, WHITE, SOFTYELLOW, SOFTBLUE },
  addShell, addKicker, addTitle, addFooter, addBodyText, addMetricSub, addInsightPanel,
  toFormattedBullets, smartBreak, lineCapacity, fwLen, estTextHeight, makeBalancingProxy, normalizeShapeOpts,
};

deck.slides.forEach((item, i) => {
  if (ARCHETYPES.has(item.template)) {
    ARCHETYPES.get(item.template).pptx(ctx, item, i + 1);
    return;
  }
  switch (item.template) {
    case "cover":
      addCover(item, i + 1);
      break;
    case "executive_summary":
      addExecutiveSummary(item, i + 1);
      break;
    case "chart_insight":
      addChartInsight(item, i + 1);
      break;
    case "matrix_2x2":
      addMatrix(item, i + 1);
      break;
    case "waterfall":
      addWaterfall(item, i + 1);
      break;
    case "comparison_table":
      addComparison(item, i + 1);
      break;
    case "scenario_table":
      addScenario(item, i + 1);
      break;
    case "risk_table":
      addRisk(item, i + 1);
      break;
    case "roadmap":
      addRoadmap(item, i + 1);
      break;
    case "decision_page":
      addDecision(item, i + 1);
      break;
    case "scr":
      addScr(item, i + 1);
      break;
    case "horizontal_axis_table":
      addAxisTable(item, i + 1);
      break;
    case "issue_to_solution_map":
      addIssueToSolution(item, i + 1);
      break;
    case "process_flow":
      addProcessFlow(item, i + 1);
      break;
    case "cycle":
      addCycle(item, i + 1);
      break;
    case "issue_cause_solution":
      addIssueCauseSolution(item, i + 1);
      break;
    case "current_target_state":
      addCurrentTargetState(item, i + 1);
      break;
    case "decision_fork":
      addDecisionFork(item, i + 1);
      break;
    case "heatmap_table":
      addHeatmap(item, i + 1);
      break;
    case "timeline_matrix":
      addTimelineMatrix(item, i + 1);
      break;
    case "process_matrix":
      addProcessMatrix(item, i + 1);
      break;
    case "stacked_bar":
      addStackedBar(item, i + 1);
      break;
    case "true_waterfall":
      addTrueWaterfall(item, i + 1);
      break;
    case "cause_effect":
      addCauseEffect(item, i + 1);
      break;
    case "chevron_rail":
      addChevronRail(item, i + 1);
      break;
    case "gantt":
      addGantt(item, i + 1);
      break;
    case "issue_tree":
      addIssueTree(item, i + 1);
      break;
    case "kpi_dashboard":
      addKpiDashboard(item, i + 1);
      break;
    case "big_stat_pair":
      addBigStatPair(item, i + 1);
      break;
    case "numbered_imperatives":
      addNumberedImperatives(item, i + 1);
      break;
    case "theme_card_grid":
      addThemeCardGrid(item, i + 1);
      break;
    case "question_framework":
      addQuestionFramework(item, i + 1);
      break;
    case "evidence_basis":
      addEvidenceBasis(item, i + 1);
      break;
    case "recommendation_pillars":
      addRecommendationPillars(item, i + 1);
      break;
    case "small_multiples":
      addSmallMultiples(item, i + 1);
      break;
    case "nested_row_matrix":
      addNestedRowMatrix(item, i + 1);
      break;
    case "calc_flow":
      addCalcFlow(item, i + 1);
      break;
    case "chevron_value_chain":
      addChevronValueChain(item, i + 1);
      break;
    default:
      throw new Error(
        `Template "${item.template}" (slide ${i + 1}) is declared in the schema but not implemented in the PPTX exporter. Implement an add* function and switch case, or remove it from the deck.`,
      );
  }
});

flushBalancedSlides();

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await pptx.writeFile({ fileName: outputPath });
console.log(JSON.stringify({ outputPath, slideCount: deck.slides.length, editable: true }, null, 2));
