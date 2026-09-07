// パーツ15: 割合のドットマトリクス（100点＝全体。先頭 N% を塗る）
import { FRAME, contentW, rect, addText, addSerif, hline, mm } from "./_helpers.mjs";

export const id = "dot_matrix_share";
export const name = "割合のドットマトリクス";
export const part = 15;
export const doc =
  "parts.header: 軸見出し（明朝）／parts.unit: 右端の単位・母数（例「回答者に占める割合、n=ラベル 2、複数回答」）／" +
  "parts.columns: [{value:'00%', pct:0-100, label}] 2〜5列。pct の分だけ 10×10 の点を左上から行方向に塗る（value は表示文字列）";

export const example = {
  template: id,
  kicker: "パーツ15｜割合のドットマトリクス",
  title: name,
  source: "出典：Source 1",
  parts: {
    header: "Text 1に取り組んでいる領域",
    unit: "回答者に占める割合、n=ラベル 2、複数回答",
    columns: [
      { value: "58%", pct: 58, label: "ラベル 3" },
      { value: "42%", pct: 42, label: "ラベル 4" },
      { value: "21%", pct: 21, label: "ラベル 5" },
      { value: "13%", pct: 13, label: "ラベル 6" },
    ],
  },
};

// .dots: 2.1mm 角・間隔 .9mm・10×10
const DOT = mm(2.1);
const GAP = mm(0.9);
const GRID = DOT * 10 + GAP * 9;

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
  const cols = Array.isArray(p.columns) ? p.columns : [];
  const x0 = FRAME.M;
  const w = contentW();

  // .axh（軸見出し＋右端の単位。文字色は濃色）
  let y = FRAME.contentTop;
  if (p.header || p.unit) {
    y = axisHeader(ctx, slide, p.header, p.unit, x0, y, w);
  }

  // 残り高さの中央に .dotcol を置く（HTML: .grid g4 align-items:center）
  const valueH = 0.3;   // .dv 15pt
  const labelH = 0.36;  // .dl 9pt ×2行分
  const gapV = mm(2.5);
  const blockH = valueH + gapV + GRID + gapV + labelH;
  const areaTop = y;
  const areaBottom = FRAME.contentBottom;
  const top = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2);

  const n = Math.max(1, cols.length);
  const gutter = mm(4);
  const colW = (w - gutter * (n - 1)) / n;

  cols.forEach((c, i) => {
    const cx = x0 + i * (colW + gutter) + colW / 2;
    // .dv 数値
    addText(ctx, slide, c.value ?? "", cx - colW / 2, top, colW, valueH, {
      fontSize: 15, bold: true, color: ctx.colors.INK, align: "center", valign: "bottom",
    });
    // .dots 10×10（先頭 N 個を塗る）
    const gx = cx - GRID / 2;
    const gy = top + valueH + gapV;
    const pct = Number.isFinite(Number(c.pct)) ? Number(c.pct) : parseFloat(String(c.value || "").replace(/[^\d.]/g, "")) || 0;
    const on = Math.max(0, Math.min(100, Math.round(pct)));
    for (let k = 0; k < 100; k++) {
      const r = Math.floor(k / 10), q = k % 10;
      rect(ctx, slide, gx + q * (DOT + GAP), gy + r * (DOT + GAP), DOT, DOT, k < on ? ctx.colors.BLUE : ctx.colors.HAIR);
    }
    // .dl ラベル
    addText(ctx, slide, c.label ?? "", cx - colW / 2, gy + GRID + gapV, colW, labelH, {
      fontSize: 9, color: ctx.colors.INK, align: "center", valign: "top",
    });
  });
}
