// パーツ23: 増減の縦棒＋左右合計（増える側と減る側が同時に起きる話。合計を大型数値で左に置く）
// HTML: .axh ＋ SVG(900×300): 左に「＋200 増える分」（明朝 BLUE）と「−185 減る分」（明朝 INK）、
//       中央〜右に基準線（INK 2px）から上へ BLUE の棒・下へ INK の棒（項目ごとに対）、下に項目名。右下に凡例。
// 棒はネイティブの積み上げ縦棒（系列1=増分 正値／系列2=減分 負値）。合計と凡例はテキスト・図形。
import { FRAME, contentW, mm, colHeader, addText, rect } from "./_helpers.mjs";

// 軸見出し（.axh）: 明朝 INK ＋ 右端に単位（8.5pt MUTED）＋ 濃色の太下罫。
// colHeader の unit は箱の上端が 1.72in でタイトル直下の「サブタイトル疑い」WARN に掛かるため、単位だけ少し下げて自前で置く
function axisHeader(ctx, slide, title, unit, x, y, w) {
  const next = colHeader(ctx, slide, title, x, y, w, { color: ctx.colors.INK });
  if (unit) addText(ctx, slide, unit, x + w - 2.4, y + 0.06, 2.4, 0.26, { fontSize: 8.5, color: ctx.colors.MUTED, align: "right", valign: "bottom" });
  return next;
}


export const id = "delta_bars_totals";
export const name = "増減の縦棒＋左右合計";
export const part = 23;
export const doc =
  "parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.categories: [{label, up, down}] 項目ごとの増分（正数）と減分（正数で与える）／" +
  "parts.upLabel・parts.downLabel: 「増える分」「減る分」／parts.upTotal・parts.downTotal: 左の大型数値（省略時は合計）／parts.showValues: 棒内に値を出す（既定 false）";

export const example = {
  template: id,
  kicker: "パーツ23｜増減の縦棒＋左右合計",
  title: name,
  source: "出典：Source 1",
  parts: {
    axisTitle: "指標名",
    unit: "単位、YYYY〜YYYY年",
    upLabel: "増える分",
    downLabel: "減る分",
    categories: [
      { label: "ラベル 2", up: 90, down: 50 },
      { label: "ラベル 3", up: 68, down: 88 },
      { label: "ラベル 4", up: 32, down: 12 },
      { label: "ラベル 5", up: 10, down: 43 },
      { label: "ラベル 6", up: 52, down: 46 },
    ],
    upTotal: 200,
    downTotal: 185,
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

const fmt = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-US") : String(v ?? ""));

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const C = ctx.colors;
  const cats = (p.categories || []).filter((c) => c && c.label != null);
  const upLabel = p.upLabel || "増える分";
  const downLabel = p.downLabel || "減る分";

  const y0 = axisHeader(ctx, slide, p.axisTitle || "", p.unit, FRAME.M, FRAME.contentTop, contentW());

  // 凡例は最下段（右寄せ）。その上に SVG(900×300, meet) 相当の領域
  const legendH = 0.2;
  const legendY = FRAME.contentBottom - legendH;
  const s = contentW() / 900;
  const svgH = 300 * s;
  const availH = legendY - mm(5) - y0;
  const top = y0 + Math.max(0, (availH - svgH) / 2);

  // 左: 合計の大型数値（明朝 30pt）＋ 説明（10.5pt）
  const ups = cats.map((c) => Math.abs(Number(c.up) || 0));
  const downs = cats.map((c) => Math.abs(Number(c.down) || 0));
  const upTotal = p.upTotal ?? ups.reduce((a, b) => a + b, 0);
  const downTotal = p.downTotal ?? downs.reduce((a, b) => a + b, 0);
  const lx = FRAME.M + 20 * s, lw = 150 * s;
  slide.addText(`＋${fmt(upTotal)}`, {
    x: lx, y: top + 45 * s, w: lw, h: 0.55, fontFace: ctx.FONT_SERIF, fontSize: 30, bold: true, color: C.BLUE,
    margin: 0, valign: "bottom", fit: "shrink", breakLine: false,
  });
  addText(ctx, slide, upLabel, lx, top + 45 * s + 0.57, lw, 0.24, { fontSize: 10.5 });
  slide.addText(`−${fmt(downTotal)}`, {
    x: lx, y: top + 185 * s, w: lw, h: 0.55, fontFace: ctx.FONT_SERIF, fontSize: 30, bold: true, color: C.INK,
    margin: 0, valign: "bottom", fit: "shrink", breakLine: false,
  });
  addText(ctx, slide, downLabel, lx, top + 185 * s + 0.57, lw, 0.24, { fontSize: 10.5 });

  // 中央〜右: 積み上げ縦棒（増分=正／減分=負）。基準線を中央に置くため値域を対称にする
  if (cats.length) {
    const maxAbs = Math.max(...ups, ...downs, 1);
    const lim = Math.ceil((maxAbs * 1.15) / 10) * 10;
    const labels = cats.map((c) => String(c.label));
    const data = [
      { name: upLabel, labels, values: ups },
      { name: downLabel, labels, values: downs.map((v) => -v) },
    ];
    const cx = FRAME.M + 180 * s, cw = contentW() - 180 * s;
    const cy = top + 20 * s, ch = svgH - 20 * s;
    slide.addChart(ctx.pptx.ChartType.bar, data, {
      x: cx, y: cy, w: cw, h: ch,
      barDir: "col", barGrouping: "stacked", barGapWidthPct: 100,
      chartColors: [C.BLUE, C.NAVY],
      layout: { x: 0, y: 0.02, w: 1, h: 0.86 },
      catAxisLabelPos: "low", catAxisLabelFontFace: ctx.FONT, catAxisLabelFontSize: 10.5, catAxisLabelColor: C.INK,
      catAxisLineShow: true, catAxisLineColor: C.INK, catAxisLineSize: 1.5, catAxisMajorTickMark: "none",
      valAxisHidden: true, valAxisMinVal: -lim, valAxisMaxVal: lim,
      catGridLine: { style: "none" }, valGridLine: { style: "none" },
      showLegend: false, showTitle: false,
      showValue: !!p.showValues, dataLabelPosition: "inEnd", dataLabelFontFace: ctx.FONT, dataLabelFontSize: 9, dataLabelColor: C.WHITE,
      dataLabelFormatCode: "#,##0;#,##0",
    });
  }

  // 右下: 凡例
  legend(ctx, slide, [{ color: C.BLUE, label: upLabel }, { color: C.NAVY, label: downLabel }], FRAME.M, legendY, contentW(), "right");
}
