// パーツ17: 分布の順位棒＋注記（多数の縦棒を降順に並べ、上位だけ濃色。右に「だから」の読み取り）
// HTML: .two(1.6fr auto 1fr) ＝ 左 [.axh ＋ 縦棒 SVG ＋ 凡例] ／ 三角 ／ 右 [.colh ＋ ul]
// 棒はネイティブの縦棒グラフ（1系列・点ごとの色）で描く（README: チャートは addChart）。
import { FRAME, contentW, mm, colHeader, addBullets, addText, rect } from "./_helpers.mjs";

// 軸見出し（.axh）: 明朝 INK ＋ 右端に単位（8.5pt MUTED）＋ 濃色の太下罫。
// colHeader の unit は箱の上端が 1.72in でタイトル直下の「サブタイトル疑い」WARN に掛かるため、単位だけ少し下げて自前で置く
function axisHeader(ctx, slide, title, unit, x, y, w) {
  const next = colHeader(ctx, slide, title, x, y, w, { color: ctx.colors.INK });
  if (unit) addText(ctx, slide, unit, x + w - 2.4, y + 0.06, 2.4, 0.26, { fontSize: 8.5, color: ctx.colors.MUTED, align: "right", valign: "bottom" });
  return next;
}

// 右向き三角（.tri: 幅 6mm × 高さ 10mm）。triangle を 90° 回すので、回転前の w が高さ・h が幅になる
function triangleRightTall(ctx, slide, cx, cy, wIn, color) {
  const hIn = wIn * 10 / 6;
  const fill = color || ctx.colors.CYAN;
  slide.addShape(ctx.pptx.ShapeType.triangle, { x: cx - hIn / 2, y: cy - wIn / 2, w: hIn, h: wIn, rotate: 90, fill: { color: fill }, line: { color: fill, width: 0 } });
}


export const id = "ranked_bar_annotated";
export const name = "分布の順位棒＋注記";
export const part = 17;
export const doc =
  "parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.bars: [{label, value, highlight?}] 降順に並べる（多数可。15本以下なら項目名と値を表示）／" +
  "parts.topLabel・parts.otherLabel: 凡例の文言（既定「上位N社」「その他」）／parts.readout: {title, bullets:[]} 右の「だから」見出しと箇条書き";

const topValues = [240, 224, 210, 192, 180, 154, 140, 130, 118, 110, 100, 92, 86, 80, 74, 70, 64, 60, 56, 52, 48, 45, 42, 39, 36, 33, 31, 29, 27, 25, 23, 21, 20, 18, 17, 15, 14, 13, 12, 11, 10, 9, 8, 8, 7, 6, 6, 5, 5, 4];

export const example = {
  template: id,
  kicker: "パーツ17｜分布の順位棒＋注記",
  title: name,
  source: "出典：Source 1",
  parts: {
    axisTitle: "指標名",
    unit: "単位、YYYY〜YYYY年",
    bars: topValues.map((v, i) => ({ label: `ラベル ${i + 1}`, value: v, highlight: i < 5 })),
    topLabel: "上位N社",
    otherLabel: "その他",
    readout: { title: "だから、Text 4に絞る", bullets: ["Text 1", "Text 2", "Text 3"] },
  },
};

// 凡例（.legend）: 4mm の色角＋8pt。align: "left" | "right"
function legend(ctx, slide, items, x, y, w, align = "left") {
  const sq = mm(4), gapIn = mm(1.5), gapOut = mm(6), size = 8;
  const widths = items.map((it) => sq + gapIn + ctx.fwLen(it.label) * (size / 72) * 1.05 + 0.05);
  const total = widths.reduce((a, b) => a + b, 0) + gapOut * (items.length - 1);
  let cx = align === "right" ? x + w - total : x;
  items.forEach((it, i) => {
    rect(ctx, slide, cx, y + (0.2 - sq) / 2, sq, sq, it.color);
    addText(ctx, slide, it.label, cx + sq + gapIn, y, widths[i] - sq - gapIn, 0.2, { fontSize: size, valign: "middle" });
    cx += widths[i] + gapOut;
  });
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const bars = (p.bars || []).filter((b) => b && b.label != null);
  const C = ctx.colors;

  // 版面の分割: 1.6fr | 6mm 三角 | 1fr、列間 6mm
  const W = contentW();
  const tri = mm(6), gap = mm(6);
  const fr = (W - tri - gap * 2) / 2.6;
  const leftX = FRAME.M, leftW = fr * 1.6;
  const triX = leftX + leftW + gap;
  const rightX = triX + tri + gap, rightW = fr;
  const top = FRAME.contentTop, bottom = FRAME.contentBottom;

  // 左: 軸見出し（.axh）
  let y = axisHeader(ctx, slide, p.axisTitle || "", p.unit, leftX, top, leftW);

  // 左: 凡例（上位／その他）は棒の下 2mm
  const hasHi = bars.some((b) => b.highlight);
  const legendH = hasHi ? 0.2 : 0;
  const chartBottom = bottom - legendH - (hasHi ? mm(2) : 0);

  // 左: 縦棒グラフ（1系列・点ごとの色。上位=BLUE／その他=CYAN）
  const few = bars.length <= 15;
  if (bars.length) {
    const data = [{ name: p.axisTitle || "値", labels: bars.map((b) => String(b.label)), values: bars.map((b) => Number(b.value) || 0) }];
    const colors = bars.map((b) => (b.highlight || !hasHi ? C.BLUE : C.CYAN));
    if (colors.length === 1) colors.push(colors[0]); // 点色配列は 2 要素以上で有効
    slide.addChart(ctx.pptx.ChartType.bar, data, {
      x: leftX, y, w: leftW, h: chartBottom - y,
      barDir: "col", barGapWidthPct: few ? 60 : 30,
      chartColors: colors,
      layout: { x: 0, y: 0.03, w: 1, h: few ? 0.9 : 0.96 },
      catAxisLabelPos: few ? "low" : "none",
      catAxisLabelFontFace: ctx.FONT, catAxisLabelFontSize: 9, catAxisLabelColor: C.INK,
      catAxisLineShow: true, catAxisLineColor: C.INK, catAxisLineSize: 1.5, catAxisMajorTickMark: "none",
      valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: Math.max(...bars.map((b) => Number(b.value) || 0), 1) / 0.96,
      catGridLine: { style: "none" }, valGridLine: { style: "none" },
      showLegend: false, showTitle: false,
      showValue: few, dataLabelPosition: "outEnd", dataLabelFontFace: ctx.FONT, dataLabelFontSize: 9, dataLabelColor: C.INK,
    });
  }
  if (hasHi) {
    legend(ctx, slide, [
      { color: C.BLUE, label: p.topLabel || "上位N社" },
      { color: C.CYAN, label: p.otherLabel || "その他" },
    ], leftX, bottom - legendH, leftW, "left");
  }

  // 中央: 右向き三角（縦中央）
  triangleRightTall(ctx, slide, triX + tri / 2, (top + bottom) / 2, tri);

  // 右: .colh ＋ 箇条書き（縦中央）
  const r = p.readout || {};
  const ry = colHeader(ctx, slide, r.title || "", rightX, top, rightW);
  addBullets(ctx, slide, r.bullets || [], rightX, ry, rightW, bottom - ry, { fontSize: 10, valign: "middle", paraSpaceAfter: 6 });
}
