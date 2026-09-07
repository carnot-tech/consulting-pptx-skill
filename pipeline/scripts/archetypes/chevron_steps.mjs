// パーツ05: 矢羽（プロセス・変遷）。等幅の矢羽を横一列（先頭だけ左端が平らな homePlate）。版面中央に置く
import { FRAME, contentW, contentH, addText, mm } from "./_helpers.mjs";

// 矢羽（_helpers.chevron と同じ組み立て）。違いは矢先の深さ: pptxgenjs 既定は高さの 50% で HTML の 6mm より深すぎるので、
// rectRadius（pptxgenjs はどの preset 図形でも <a:gd name="adj"> に書く）で 6mm に固定する。角丸ではない（roundRect 不使用）。
const POINT = mm(6);
function chevronShape(ctx, slide, x, y, w, h, { first = false, color, text, sub, n, textColor } = {}) {
  const fill = color || ctx.colors.SOFTBLUE;
  slide.addShape(first ? ctx.pptx.ShapeType.homePlate : ctx.pptx.ShapeType.chevron, {
    x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: POINT,
  });
  const padL = first ? mm(5) : mm(9);
  const tx = x + padL, tw = w - padL - mm(6) - POINT;
  let ty = y + mm(4);
  if (n != null) { addText(ctx, slide, String(n), tx, ty, tw, 0.28, { fontSize: 12, bold: true, color: textColor || ctx.colors.BLUE }); ty += 0.3; }
  if (text) { addText(ctx, slide, text, tx, ty, tw, 0.3, { fontSize: 10.5, bold: true, color: textColor || ctx.colors.INK }); ty += 0.34; }
  if (sub) addText(ctx, slide, sub, tx, ty, tw, y + h - ty - mm(3), { fontSize: 9, color: textColor || ctx.colors.INK });
}

export const id = "chevron_steps";
export const name = "矢羽（プロセス・変遷）";
export const part = 5;
export const doc = "parts.steps: [{n, title, text}] 3〜6個。n は時点・番号（例 YYYY年M月／現在／1）、title は矢羽の見出し、text は1〜2行の補足。色分けするなら legend で凡例を付ける";

export const example = {
  template: id,
  kicker: "パーツ05｜矢羽（プロセス・変遷）",
  title: name,
  source: "出典：Source 1",
  parts: {
    steps: [
      { n: "YYYY年M月", title: "ラベル 1", text: "Text 1" },
      { n: "YYYY年M月", title: "ラベル 2", text: "Text 2" },
      { n: "YYYY年M月", title: "ラベル 3", text: "Text 3" },
      { n: "現在", title: "ラベル 4", text: "Text 4" },
    ],
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const steps = (item.parts && item.parts.steps) || [];
  if (!steps.length) return;
  const gap = mm(1);                           // 矢羽どうしの継ぎ目（HTML の clip-path と同じ細い白い切れ目）
  const n = steps.length;
  const w = (contentW() - gap * (n - 1)) / n;
  // 高さ: 上パディング 5mm ＋ n 行 ＋ 見出し行 ＋ 補足の行数 ＋ 下パディング 5mm（HTML .cv padding 5mm 4mm 5mm 9mm）
  const tw = w - mm(9) - mm(6) - POINT;
  const cap = ctx.lineCapacity(Math.max(0.3, tw - 0.1), 9);
  const subLines = Math.max(1, ...steps.map((s) => Math.ceil(ctx.fwLen(s.text || "") / cap)));
  const h = Math.max(1.15, mm(4) + 0.3 + 0.34 + subLines * (9 / 72) * 1.55 + mm(4));
  const y = FRAME.contentTop + (contentH() - h) / 2;
  steps.forEach((s, i) => {
    chevronShape(ctx, slide, FRAME.M + i * (w + gap), y, w, h, {
      first: i === 0, n: s.n, text: s.title, sub: s.text,
    });
  });
}
