// パーツ27: セパレーター（章扉＝アジェンダ再掲。目次と同じ並びを再掲し、現在地の行だけ濃く大きく出す）
import { FRAME, contentW, contentH, mm, addSerif, addText, hline } from "./_helpers.mjs";

export const id = "agenda_separator";
export const name = "セパレーター（章扉＝アジェンダ再掲）";
export const part = 27;
export const doc = "parts.items: [{n, text, page, current}] 目次（パーツ03）と並び・文言を完全一致させる。current:true の1行だけ現在地として強調（番号 19pt アクセント・タイトル 21pt 濃色）、他行は補助色";

export const example = {
  template: id,
  kicker: "パーツ27｜セパレーター（章扉＝アジェンダ再掲）",
  title: name,
  parts: {
    items: [
      { n: "01", text: "ラベル 1", page: "P.4", current: false },
      { n: "02", text: "ラベル 2", page: "P.9", current: true },
      { n: "03", text: "ラベル 3", page: "P.15", current: false },
      { n: "04", text: "ラベル 4", page: "P.21", current: false },
    ],
  },
};

// HTML .agd .ai: grid 14mm | 1fr | 16mm, gap 5mm, padding 4.6mm 0, 罫 #e3dccf（最終行なし）
// 通常行: 明朝 14pt/15pt・9pt、色 #b3a798（MUTED）。現在地: 番号 19pt アクセント・タイトル 21pt 濃色・頁 9pt 補助色
const COL_N = mm(14);
const COL_P = mm(16);
const GAP = mm(5);
const PAD = mm(4.6);
const ROW_H = PAD * 2 + mm(9);        // 15pt 行（HTML 実測 ≈18.5mm）
const ROW_H_ON = PAD * 2 + mm(10.5);  // 21pt 行（HTML 実測 ≈19.7mm）

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const items = (item.parts && item.parts.items) || [];
  const n = items.length;
  const x = FRAME.M, w = contentW();
  // .agd は版面内で縦中央寄せ
  const total = items.reduce((a, it) => a + (it.current ? ROW_H_ON : ROW_H), 0);
  let y = FRAME.contentTop + Math.max(0, (contentH() - total) / 2);
  items.forEach((it, i) => {
    const on = !!it.current;
    const rh = on ? ROW_H_ON : ROW_H;
    const c = ctx.colors;
    addSerif(ctx, slide, it.n, x, y, COL_N, rh, { fontSize: on ? 19 : 14, bold: true, color: on ? c.BLUE : c.MUTED, valign: "middle" });
    addSerif(ctx, slide, it.text, x + COL_N + GAP, y, w - COL_N - COL_P - GAP * 2, rh, { fontSize: on ? 21 : 15, bold: true, color: on ? c.INK : c.MUTED, valign: "middle" });
    addText(ctx, slide, it.page, x + w - COL_P, y, COL_P, rh, { fontSize: 9, color: c.MUTED, align: "right", valign: "middle" });
    if (i < n - 1) hline(ctx, slide, x, y + rh, w, { color: c.HAIR });
    y += rh;
  });
}
