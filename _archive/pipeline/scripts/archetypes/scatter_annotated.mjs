// パーツ18: 注記つき散布図（点の横に直接ラベル。象限の意味と参照線を図中に置く）
// HTML: .axh ＋ SVG(900×330): 左下に L 字の軸（INK 2px）、破線の参照線（CYAN）＋斜体ラベル、点（INK r6）＋右隣ラベル、
//       図中の斜体注記（左上／左下／右下、BLUE）。
// 点はネイティブの散布図。軸線・参照線・注記は、plotArea を layout で固定して図形で重ねる。
import { FRAME, contentW, colHeader, hline, vline } from "./_helpers.mjs";
import * as H from "./_html.mjs";

// 斜体を使うので addBodyText を経由せず直接 addText する（addBodyText は italic を通さない）
function addText(ctx, slide, text, x, y, w, h, opts = {}) {
  slide.addText(String(text ?? ""), {
    x, y, w, h, fontFace: ctx.FONT, fontSize: opts.fontSize || 10, bold: !!opts.bold, italic: !!opts.italic,
    color: opts.color || ctx.colors.INK, margin: 0, valign: opts.valign || "top", align: opts.align || "left",
    fit: "shrink", breakLine: false,
  });
}

// 軸見出し（.axh）: 明朝 INK ＋ 右端に単位（8.5pt MUTED）＋ 濃色の太下罫。
// colHeader の unit は箱の上端が 1.72in でタイトル直下の「サブタイトル疑い」WARN に掛かるため、単位だけ少し下げて自前で置く
function axisHeader(ctx, slide, title, unit, x, y, w) {
  const next = colHeader(ctx, slide, title, x, y, w, { color: ctx.colors.INK });
  if (unit) addText(ctx, slide, unit, x + w - 2.4, y + 0.06, 2.4, 0.26, { fontSize: 8.5, color: ctx.colors.MUTED, align: "right", valign: "bottom" });
  return next;
}

export const id = "scatter_annotated";
export const name = "注記つき散布図";
export const part = 18;
export const doc =
  "parts.axisTitle: 軸見出し（「Text 1とText 2の関係」）／parts.unit: 単位行／parts.points: [{label, x, y, highlight?}] x・y は 0〜100 の位置（実値なら parts.xMax/yMax を与える）／" +
  "parts.refLines: [{axis:'x'|'y', value, label}] 破線の参照線／parts.annotations: {topLeft, bottomLeft, bottomRight, topRight} 図中の斜体注記";

export const example = {
  template: id,
  kicker: "パーツ18｜注記つき散布図",
  title: name,
  source: "出典：Source 1",
  parts: {
    axisTitle: "Text 1とText 2の関係",
    unit: "単位、YYYY年",
    points: [
      { label: "ラベル 5", x: 10, y: 17 }, { label: "ラベル 6", x: 20, y: 29 }, { label: "ラベル 7", x: 32, y: 24 }, { label: "ラベル 8", x: 41, y: 41 },
      { label: "ラベル 9", x: 56, y: 52 }, { label: "ラベル 10", x: 65, y: 62 }, { label: "ラベル 11", x: 78, y: 71 }, { label: "ラベル 12", x: 90, y: 83 },
    ],
    refLines: [{ axis: "x", value: 47, label: "平均（ラベル 4）" }],
    annotations: { topLeft: "Text 13が高い", bottomLeft: "Text 14が低い", bottomRight: "Text 15が大きい →" },
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const C = ctx.colors;
  const pts = (p.points || []).filter((q) => q && q.label != null);
  const xMax = Number(p.xMax) || 100, yMax = Number(p.yMax) || 100;
  const xMin = Number(p.xMin) || 0, yMin = Number(p.yMin) || 0;

  // 軸見出し（.axh）
  const y0 = axisHeader(ctx, slide, p.axisTitle || "", p.unit, FRAME.M, FRAME.contentTop, contentW());

  // SVG(900×330, meet) を版面幅に合わせた幾何: 軸は x=70..880 / y=10..300
  const s = contentW() / 900;
  const availH = FRAME.contentBottom - y0;
  const svgH = 330 * s;
  const svgTop = y0 + Math.max(0, (availH - svgH) / 2);
  const plotX = FRAME.M + 70 * s, plotW = (880 - 70) * s;
  const plotY = svgTop + 10 * s, plotH = (300 - 10) * s;

  // 散布図（軸は消して図形で描く。plotArea は layout で枠内に固定）
  const padL = 0.25, padT = 0.15, padR = 0.35, padB = 0.25;
  const fx = plotX - padL, fy = plotY - padT, fw = plotW + padL + padR, fh = plotH + padT + padB;
  if (pts.length) {
    const hasHi = pts.some((q) => q.highlight);
    const data = [{ name: "X", values: pts.map((q) => Number(q.x) || 0) }];
    const mk = (pick) => ({
      values: pts.map((q) => (pick(q) ? Number(q.y) || 0 : null)),
      labels: pts.map((q) => (pick(q) ? String(q.label) : "")),
    });
    if (hasHi) {
      data.push({ name: "Y", ...mk((q) => !q.highlight) });
      data.push({ name: "Y2", ...mk((q) => !!q.highlight) });
    } else {
      data.push({ name: "Y", ...mk(() => true) });
    }
    slide.addChart(ctx.pptx.ChartType.scatter, data, {
      x: fx, y: fy, w: fw, h: fh,
      layout: { x: padL / fw, y: padT / fh, w: plotW / fw, h: plotH / fh },
      chartColors: hasHi ? [C.INK, C.BLUE] : [C.INK, C.INK],
      lineSize: 0, lineDataSymbol: "circle", lineDataSymbolSize: 10,
      showLabel: true, dataLabelFormatScatter: "custom", dataLabelPosition: "r",
      catAxisHidden: true, valAxisHidden: true,
      catAxisMinVal: xMin, catAxisMaxVal: xMax, valAxisMinVal: yMin, valAxisMaxVal: yMax,
      catGridLine: { style: "none" }, valGridLine: { style: "none" },
      showLegend: false, showTitle: false,
    });
  }

  // 軸（L 字）: 下辺と左辺を INK 2px
  hline(ctx, slide, plotX, plotY + plotH, plotW, { color: C.INK, width: 1.5 });
  vline(ctx, slide, plotX, plotY, plotH, { color: C.INK, width: 1.5 });

  // 参照線（破線 CYAN）＋ 斜体ラベル（MUTED）
  const toX = (v) => plotX + ((Number(v) - xMin) / (xMax - xMin || 1)) * plotW;
  const toY = (v) => plotY + plotH - ((Number(v) - yMin) / (yMax - yMin || 1)) * plotH;
  (p.refLines || []).forEach((r) => {
    if (!r) return;
    if (r.axis === "y") {
      const ry = toY(r.value);
      slide.addShape(ctx.pptx.ShapeType.line, { x: plotX, y: ry, w: plotW, h: 0, line: { color: C.CYAN, width: 1.1, dashType: "dash" } });
      if (r.label) addText(ctx, slide, r.label, plotX + plotW - 3.0, ry - 0.24, 3.0, 0.2, { fontSize: 9, italic: true, color: C.MUTED, align: "right", valign: "bottom" });
    } else {
      const rx = toX(r.value);
      slide.addShape(ctx.pptx.ShapeType.line, { x: rx, y: plotY, w: 0, h: plotH, line: { color: C.CYAN, width: 1.1, dashType: "dash" } });
      if (r.label) addText(ctx, slide, r.label, rx + 0.1, plotY + 0.06, 3.0, 0.2, { fontSize: 9, italic: true, color: C.MUTED });
    }
  });

  // 図中の注記（斜体 BLUE 10pt）
  const a = p.annotations || {};
  const pad = 0.14, aw = Math.min(4.0, plotW / 2 - 0.3), ah = 0.22;
  if (a.topLeft) addText(ctx, slide, a.topLeft, plotX + pad, plotY + pad * 0.6, aw, ah, { fontSize: 10, italic: true, color: C.BLUE });
  if (a.topRight) addText(ctx, slide, a.topRight, plotX + plotW - pad - aw, plotY + pad * 0.6, aw, ah, { fontSize: 10, italic: true, color: C.BLUE, align: "right" });
  if (a.bottomLeft) addText(ctx, slide, a.bottomLeft, plotX + pad, plotY + plotH - pad - ah, aw, ah, { fontSize: 10, italic: true, color: C.BLUE, valign: "bottom" });
  if (a.bottomRight) addText(ctx, slide, a.bottomRight, plotX + plotW - pad - aw, plotY + plotH - pad - ah, aw, ah, { fontSize: 10, italic: true, color: C.BLUE, align: "right", valign: "bottom" });
}

// HTML プレビュー（パーツ18 .axh ＋ SVG 900×330: L 字の軸、破線の参照線、点＋右隣ラベル、図中の斜体注記）
export function html(ctx, item, n) {
  const p = item.parts || {}, e = ctx.esc;
  const pts = (p.points || []).filter((q) => q && q.label != null);
  const xMax = Number(p.xMax) || 100, yMax = Number(p.yMax) || 100;
  const xMin = Number(p.xMin) || 0, yMin = Number(p.yMin) || 0;
  const toX = (v) => 70 + ((Number(v) - xMin) / (xMax - xMin || 1)) * 810;
  const toY = (v) => 300 - ((Number(v) - yMin) / (yMax - yMin || 1)) * 290;
  const T = H.svgText;
  let svg = `<svg class="pfig" viewBox="0 0 900 330" preserveAspectRatio="xMidYMid meet">`;
  svg += `<line x1="70" y1="300" x2="880" y2="300" style="stroke:var(--ink)" stroke-width="2"/><line x1="70" y1="10" x2="70" y2="300" style="stroke:var(--ink)" stroke-width="2"/>`;
  (p.refLines || []).forEach((r) => {
    if (!r) return;
    if (r.axis === "y") {
      const y = toY(r.value).toFixed(1);
      svg += `<line x1="70" y1="${y}" x2="880" y2="${y}" style="stroke:var(--cyan)" stroke-width="1.5" stroke-dasharray="6 4"/>`;
      if (r.label) svg += T(e, 872, y - 6, r.label, { size: 12, fill: "var(--muted)", italic: true, anchor: "end" });
    } else {
      const x = toX(r.value).toFixed(1);
      svg += `<line x1="${x}" y1="10" x2="${x}" y2="300" style="stroke:var(--cyan)" stroke-width="1.5" stroke-dasharray="6 4"/>`;
      if (r.label) svg += T(e, Number(x) + 8, 24, r.label, { size: 12, fill: "var(--muted)", italic: true });
    }
  });
  pts.forEach((q) => {
    const x = toX(q.x).toFixed(1), y = toY(q.y).toFixed(1);
    svg += `<circle cx="${x}" cy="${y}" r="6" style="fill:${q.highlight ? "var(--blue)" : "var(--ink)"}"/>` + T(e, Number(x) + 12, Number(y) + 5, q.label, { size: 13 });
  });
  const a = p.annotations || {};
  if (a.topLeft) svg += T(e, 82, 30, a.topLeft, { size: 13, fill: "var(--blue)", italic: true });
  if (a.topRight) svg += T(e, 870, 30, a.topRight, { size: 13, fill: "var(--blue)", italic: true, anchor: "end" });
  if (a.bottomLeft) svg += T(e, 82, 292, a.bottomLeft, { size: 13, fill: "var(--blue)", italic: true });
  if (a.bottomRight) svg += T(e, 870, 292, a.bottomRight, { size: 13, fill: "var(--blue)", italic: true, anchor: "end" });
  svg += "</svg>";
  return H.wrap(ctx, item, n, `${H.axh(e, p.axisTitle, p.unit)}${svg}`);
}
