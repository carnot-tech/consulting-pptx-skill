// パーツ16: 進捗バブル行列（行=対象、列=段階、円の面積＝件数。数値は円の中）
import { FRAME, contentW, addText, addSerif, hline, mm } from "./_helpers.mjs";

export const id = "progress_bubble_matrix";
export const name = "進捗バブル行列";
export const part = 16;
export const doc =
  "parts.header: 軸見出し／parts.unit: 単位・母数（例「件、n=ラベル 1」）／parts.colHeaders: 列見出し（段階）3〜5列／" +
  "parts.rows: [{axis, values:[number]}] 3〜6行。values は件数（0 は円なし）。円の面積が値に比例し、最大値が最大径になる／" +
  "parts.legend: 任意。右下の凡例文（例「円の面積＝件数」）";

export const example = {
  template: id,
  kicker: "パーツ16｜進捗バブル行列",
  title: name,
  source: "出典：Source 1",
  parts: {
    header: "取り組み段階別の件数",
    unit: "件、n=ラベル 1",
    colHeaders: ["構想", "試行", "部分展開", "全面展開"],
    rows: [
      { axis: "ラベル 2層", values: [30, 9, 9, 4] },
      { axis: "ラベル 3層", values: [15, 12, 6, 6] },
      { axis: "ラベル 4層", values: [54, 13, 13, 6] },
      { axis: "ラベル 5層", values: [8, 9, 6, 4] },
    ],
  },
};

// .axh（軸見出し＋右端の単位・母数）。_helpers.colHeader は単位箱が 2.0in 固定で長い母数表記が折り返すため手元で描く
function axisHeader(ctx, slide, text, unit, x, y, w) {
  const h = 0.32;
  const unitW = unit ? Math.min(w * 0.55, 4.6) : 0;
  addSerif(ctx, slide, text || "", x, y, w - unitW, h, { fontSize: 11.5, valign: "bottom", color: ctx.colors.INK });
  // 単位箱の上端は 1.75in より下に置く（check_deck の「タイトル直下のサブタイトル疑い」を避ける。下揃えなので見た目は同じ）
  if (unit) addText(ctx, slide, unit, x + w - unitW, y + 0.05, unitW, h - 0.05, { fontSize: 8.5, color: ctx.colors.MUTED, align: "right", valign: "bottom" });
  hline(ctx, slide, x, y + h + 0.04, w, { color: ctx.colors.INK, width: 1.4 });
  return y + h + 0.04 + 0.1;
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const heads = Array.isArray(p.colHeaders) ? p.colHeaders : [];
  const rows = Array.isArray(p.rows) ? p.rows : [];
  const x0 = FRAME.M;
  const w = contentW();

  let y = FRAME.contentTop;
  if (p.header || p.unit) {
    y = axisHeader(ctx, slide, p.header, p.unit, x0, y, w);
  }

  // 版面: 左に軸ラベル列（HTML の SVG 900 単位中 165 相当）、右に段階列を等分
  const legendH = p.legend ? 0.28 : 0;
  const areaTop = y;
  const areaBottom = FRAME.contentBottom - legendH;
  const labelW = w * (165 / 900);
  const nCols = Math.max(1, heads.length, ...rows.map((r) => (r.values || []).length));
  const gridX = x0 + labelW;
  const gridW = w - labelW - mm(8);
  const colPitch = gridW / nCols;
  const colCX = (ci) => gridX + (ci + 0.5) * colPitch;

  // 列見出し（.svg の text font-size 14 ≒ 13pt、濃色・細字）
  const headH = 0.3;
  heads.forEach((h, ci) => {
    addText(ctx, slide, h, colCX(ci) - colPitch / 2, areaTop, colPitch, headH, {
      fontSize: 13, color: ctx.colors.INK, align: "center", valign: "top",
    });
  });

  // 行
  const nRows = Math.max(1, rows.length);
  const rowsTop = areaTop + headH + 0.08;
  const rowPitch = (areaBottom - rowsTop) / nRows;
  const rMax = Math.min(rowPitch * 0.42, colPitch * 0.36, 0.5);
  const vMax = Math.max(1, ...rows.flatMap((r) => (r.values || []).map((v) => Number(v) || 0)));

  rows.forEach((r, ri) => {
    const cy = rowsTop + (ri + 0.5) * rowPitch;
    // 軸ラベル（太字 14pt 相当）
    addText(ctx, slide, r.axis ?? "", x0, cy - 0.2, labelW - mm(3), 0.4, {
      fontSize: 14, bold: true, color: ctx.colors.INK, valign: "middle",
    });
    (r.values || []).forEach((raw, ci) => {
      const v = Number(raw) || 0;
      if (v <= 0) return;
      const rad = rMax * Math.sqrt(v / vMax);
      const cx = colCX(ci);
      slide.addShape(ctx.pptx.ShapeType.ellipse, {
        x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2,
        fill: { color: ctx.colors.NAVY }, line: { color: ctx.colors.NAVY, width: 0 },
      });
      // 数値（白・太字。箱は円より大きめにして縮小させない）
      const box = Math.max(rad * 2, 0.5);
      addText(ctx, slide, String(raw), cx - box / 2, cy - box / 2, box, box, {
        fontSize: 12, bold: true, color: ctx.colors.WHITE, align: "center", valign: "middle",
      });
    });
  });

  if (p.legend) {
    addText(ctx, slide, p.legend, x0, FRAME.contentBottom - legendH, w, legendH, {
      fontSize: 8, color: ctx.colors.MUTED, align: "right", valign: "bottom",
    });
  }
}
