// パーツ24: シナリオ線＋成長率チップ（線の終点に直接値・右に年平均成長率のチップ。凡例に逃がさない）
// HTML: .axh ＋ SVG(900×300): 基準線（INK 2px、x=60..760）、3本の折れ線（INK / BLUE / 淡色、3px）、終点の右に太字の値、
//       下に年ラベル、右端に「年平均成長率」見出し＋ 100×26px のチップ（線色の塗り・白抜き）。最下段右に凡例。
// 線はネイティブの折れ線グラフ。plotArea を layout で固定し、終点の値・チップ・凡例をテキスト／図形で重ねる。
import { FRAME, contentW, mm, colHeader, addText, rect } from "./_helpers.mjs";

// 軸見出し（.axh）: 明朝 INK ＋ 右端に単位（8.5pt MUTED）＋ 濃色の太下罫。
// colHeader の unit は箱の上端が 1.72in でタイトル直下の「サブタイトル疑い」WARN に掛かるため、単位だけ少し下げて自前で置く
function axisHeader(ctx, slide, title, unit, x, y, w) {
  const next = colHeader(ctx, slide, title, x, y, w, { color: ctx.colors.INK });
  if (unit) addText(ctx, slide, unit, x + w - 2.4, y + 0.06, 2.4, 0.26, { fontSize: 8.5, color: ctx.colors.MUTED, align: "right", valign: "bottom" });
  return next;
}


export const id = "scenario_lines_cagr";
export const name = "シナリオ線＋成長率チップ";
export const part = 24;
export const doc =
  "parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.categories: ['YYYY', ...] 年（3〜8点）／" +
  "parts.series: [{name, values:[], chip}] 上から濃色→淡色（最大3本）。name は凡例の文言、chip は成長率チップの表示（「27%」）／" +
  "parts.chipTitle: チップ列の見出し（既定「年平均成長率」）／parts.endLabels: 終点に値を出す（既定 true）／parts.yMin: 値軸の下限（既定 0。高い水準から始まる系列で差を見せたいときだけ）";

export const example = {
  template: id,
  kicker: "パーツ24｜シナリオ線＋成長率チップ",
  title: name,
  source: "出典：Source 1",
  parts: {
    axisTitle: "指標名",
    unit: "単位、YYYY〜YYYY年",
    categories: ["YYYY", "YYYY", "YYYY", "YYYY", "YYYY", "YYYY"],
    series: [
      { name: "Text 3が進む場合", values: [35, 44, 56, 72, 91, 114], chip: "27%" },
      { name: "現状の延長", values: [35, 43, 53, 65, 80, 96], chip: "23%" },
      { name: "Text 4が遅れる場合", values: [35, 42, 50, 59, 70, 81], chip: "19%" },
    ],
    chipTitle: "年平均成長率",
  },
};

// 凡例（.legend）: 4mm の色角＋8pt
function legend(ctx, slide, items, x, y, w, align = "right") {
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

// 縦位置の重なりをほどく（中心 y の配列を minGap 以上に広げる。範囲 [lo, hi] に収める）
function spread(ys, minGap, lo, hi) {
  const idx = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
  const out = idx.map(([y]) => y);
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + minGap);
  const over = out[out.length - 1] - hi;
  if (over > 0) for (let i = 0; i < out.length; i++) out[i] -= over;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], lo + i * minGap);
  const res = new Array(ys.length);
  idx.forEach(([, i], k) => (res[i] = out[k]));
  return res;
}

const fmt = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-US") : String(v ?? ""));

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const C = ctx.colors;
  const cats = (p.categories || []).map(String);
  const series = (p.series || []).filter((sr) => sr && Array.isArray(sr.values)).slice(0, 4);
  const lineColors = [C.NAVY, C.BLUE, C.CYAN, C.MUTED];
  const chipText = [C.WHITE, C.WHITE, C.INK, C.WHITE];

  const y0 = axisHeader(ctx, slide, p.axisTitle || "", p.unit, FRAME.M, FRAME.contentTop, contentW());

  // 最下段に凡例、その上に SVG(900×300, meet) 相当の領域
  const legendH = 0.2;
  const legendY = FRAME.contentBottom - legendH;
  const s = contentW() / 900;
  const svgH = 300 * s;
  const availH = legendY - mm(5) - y0;
  const top = y0 + Math.max(0, (availH - svgH) / 2);

  // 折れ線の幾何: 点は x=60..660（カテゴリ中央）、基準線 y=270。plotArea をこの範囲に固定する
  const n = Math.max(cats.length, 2);
  const firstX = FRAME.M + 60 * s, lastX = FRAME.M + 660 * s;
  const slot = (lastX - firstX) / (n - 1);
  const plotX = firstX - slot / 2, plotW = slot * n;
  const plotY = top + 20 * s, plotBottom = top + 270 * s, plotH = plotBottom - plotY;
  const allVals = series.flatMap((sr) => sr.values.map((v) => Number(v) || 0));
  const vMax = Math.max(...allVals, 1);
  const yMin = Math.min(Number(p.yMin) || 0, Math.min(...allVals)); // 下限は指定値と最小値の小さい方
  const lim = Math.ceil((yMin + (vMax - yMin) * 1.08) / 10) * 10;
  const toY = (v) => plotY + plotH * (1 - ((Number(v) || 0) - yMin) / (lim - yMin || 1));

  if (series.length && cats.length) {
    const fx = Math.max(0, plotX), fy = plotY - 0.1;
    const fw = plotX + plotW - fx + 0.05, fh = plotBottom + 0.4 - fy;
    slide.addChart(ctx.pptx.ChartType.line, series.map((sr) => ({ name: String(sr.name || ""), labels: cats, values: cats.map((_, i) => Number(sr.values[i]) || 0) })), {
      x: fx, y: fy, w: fw, h: fh,
      layout: { x: (plotX - fx) / fw, y: (plotY - fy) / fh, w: plotW / fw, h: plotH / fh },
      chartColors: series.map((_, i) => lineColors[i % lineColors.length]),
      lineSize: 2.25, lineDataSymbol: "none",
      catAxisLabelPos: "low", catAxisLabelFontFace: ctx.FONT, catAxisLabelFontSize: 10.5, catAxisLabelColor: C.INK,
      catAxisLineShow: true, catAxisLineColor: C.INK, catAxisLineSize: 1.5, catAxisMajorTickMark: "none",
      valAxisHidden: true, valAxisMinVal: yMin, valAxisMaxVal: lim,
      catGridLine: { style: "none" }, valGridLine: { style: "none" },
      showLegend: false, showTitle: false, showValue: false,
    });
  }

  // 終点の値（太字 12pt INK）: 重なりをほどく
  const endYs = series.map((sr) => toY(sr.values[cats.length - 1]));
  const labelYs = spread(endYs, 0.26, plotY, plotBottom);
  if (p.endLabels !== false) {
    series.forEach((sr, i) => {
      const v = sr.values[cats.length - 1];
      if (v == null) return;
      addText(ctx, slide, fmt(v), lastX + 0.1, labelYs[i] - 0.14, 0.9, 0.28, { fontSize: 12, bold: true, valign: "middle" });
    });
  }

  // 右端: 「年平均成長率」見出し＋チップ（100×26px、線色の塗り）
  const chipX = FRAME.M + 770 * s, chipW = 100 * s, chipH = 26 * s;
  const chips = series.filter((sr) => sr.chip != null && sr.chip !== "");
  if (chips.length) {
    addText(ctx, slide, p.chipTitle || "年平均成長率", chipX, top, chipW + 0.6, 0.24, { fontSize: 10, bold: true, valign: "middle" });
    const chipYs = spread(endYs, chipH + 0.08, top + 0.3 + chipH / 2, plotBottom - chipH / 2);
    series.forEach((sr, i) => {
      if (sr.chip == null || sr.chip === "") return;
      const cy = chipYs[i];
      const fill = lineColors[i % lineColors.length];
      rect(ctx, slide, chipX, cy - chipH / 2, chipW, chipH, fill);
      slide.addText(String(sr.chip), {
        x: chipX, y: cy - chipH / 2, w: chipW, h: chipH, fontFace: ctx.FONT, fontSize: 11, bold: true, color: chipText[i % chipText.length],
        align: "center", valign: "middle", margin: 0, fit: "shrink", breakLine: false,
      });
    });
  }

  // 最下段右: 凡例（線色＝系列名）
  legend(ctx, slide, series.map((sr, i) => ({ color: lineColors[i % lineColors.length], label: String(sr.name || "") })), FRAME.M, legendY, contentW(), "right");
}
