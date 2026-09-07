// パーツ08: 並列カード 2×2（粒度・縦幅・語尾を統一。4枚で版面いっぱい）
import { FRAME, contentW, contentH, card, mm } from "./_helpers.mjs";

export const id = "card_grid_2x2";
export const name = "並列カード 2×2";
export const part = 8;
export const doc = "parts.cards: [{n?, title, bullets:[] | body}] 4枚（左上→右上→左下→右下）。title は「主語＋何をする」で統一、bullets は2〜3行。n は任意の番号（省略可）";

export const example = {
  template: id,
  kicker: "パーツ08｜並列カード 2×2",
  title: name,
  source: "出典：Source 1",
  parts: {
    cards: [
      { title: "ラベル 1：ラベル 2（主語＋何をする で統一）", bullets: ["Text 1", "Text 2"] },
      { title: "ラベル 3：ラベル 4", bullets: ["Text 3", "Text 4"] },
      { title: "ラベル 5：ラベル 6", bullets: ["Text 5", "Text 6"] },
      { title: "ラベル 7：ラベル 8", bullets: ["Text 7", "Text 8"] },
    ],
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const cards = ((item.parts && item.parts.cards) || []).slice(0, 4);
  if (!cards.length) return;
  const gap = mm(4);                                   // .grid gap 4mm
  const cols = 2, rowsN = Math.ceil(cards.length / cols);
  const cw = (contentW() - gap * (cols - 1)) / cols;
  const ch = (contentH() - gap * (rowsN - 1)) / rowsN;
  cards.forEach((c, i) => {
    const x = FRAME.M + (i % cols) * (cw + gap);
    const y = FRAME.contentTop + Math.floor(i / cols) * (ch + gap);
    const bullets = Array.isArray(c.bullets) && c.bullets.length ? c.bullets : undefined;
    card(ctx, slide, x, y, cw, ch, { n: c.n, title: c.title, bullets, body: bullets ? undefined : c.body });
  });
}
