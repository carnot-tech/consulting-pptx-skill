// パーツ03: 目次（1列。番号=明朝アクセント／項目／右端にページ。行間は細罫、最終行の下は罫なし）
import { FRAME, contentW, contentH, mm, addSerif, addText, hline } from "./_helpers.mjs";

export const id = "table_of_contents";
export const name = "目次";
export const part = 3;
export const doc = "parts.items: [{n, text, page}] 3〜6行。n は「01」等の番号、text は章タイトル（章扉・セパレーターと同じ文言）、page は「P.4」";

export const example = {
  template: id,
  kicker: "パーツ03｜目次",
  title: name,
  parts: {
    items: [
      { n: "01", text: "ラベル 1", page: "P.3" },
      { n: "02", text: "ラベル 2", page: "P.6" },
      { n: "03", text: "ラベル 3", page: "P.9" },
      { n: "04", text: "ラベル 4", page: "P.12" },
      { n: "05", text: "ラベル 5", page: "P.15" },
    ],
  },
};

// HTML .toc .ti: grid 14mm | 1fr | 14mm, gap 4mm, 11.5pt, .tn 明朝アクセント, .tp 9pt 補助色 右寄せ
const COL_N = mm(14);
const COL_P = mm(14);
const GAP = mm(4);
const MAX_ROW_H = mm(22);

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const items = (item.parts && item.parts.items) || [];
  const n = items.length || 1;
  const x = FRAME.M, w = contentW();
  const y0 = FRAME.contentTop + mm(4);           // .toc margin-top 4mm
  const rh = Math.min(MAX_ROW_H, (contentH() - mm(4)) / n);
  items.forEach((it, i) => {
    const ry = y0 + i * rh;
    addSerif(ctx, slide, it.n, x, ry, COL_N, rh, { fontSize: 11.5, bold: true, color: ctx.colors.BLUE, valign: "middle" });
    addText(ctx, slide, it.text, x + COL_N + GAP, ry, w - COL_N - COL_P - GAP * 2, rh, { fontSize: 11.5, valign: "middle" });
    addText(ctx, slide, it.page, x + w - COL_P, ry, COL_P, rh, { fontSize: 9, color: ctx.colors.MUTED, align: "right", valign: "middle" });
    if (i < n - 1) hline(ctx, slide, x, ry + rh, w, { color: ctx.colors.HAIR });
  });
}
