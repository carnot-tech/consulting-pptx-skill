// パーツ19: 柱＋土台（個別テーマの柱と、全体に効く共通条件の帯を分ける）
import { FRAME, contentW, contentH, rect, darkPanel, mm } from "./_helpers.mjs";

export const id = "pillars_foundation";
export const name = "柱＋土台";
export const part = 19;
export const doc =
  "parts.pillars: [{title, text}] 3〜5本（薄い塗り・見出し11pt太字＋本文9pt・縦中央）／" +
  "parts.bases: [{lead, text}] 1〜3本の濃色帯（lead はアクセント色太字、text は白）。単数なら parts.base:{lead,text} でも可";

export const example = {
  template: id,
  kicker: "パーツ19｜柱＋土台",
  title: name,
  source: "出典：Source 1",
  parts: {
    pillars: [
      { title: "ラベル 1", text: "Text 1" },
      { title: "ラベル 2", text: "Text 2" },
      { title: "ラベル 3", text: "Text 3" },
      { title: "ラベル 4", text: "Text 4" },
    ],
    bases: [
      { lead: "共通条件1", text: "Text 5を全社で整えること" },
      { lead: "共通条件2", text: "Text 6を継続的に確保すること" },
    ],
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const pillars = Array.isArray(p.pillars) ? p.pillars : [];
  const bases = Array.isArray(p.bases) ? p.bases : p.base ? [p.base] : [];
  const x0 = FRAME.M;
  const w = contentW();

  // 寸法（HTML: .pil 高さ 62mm、柱→帯 9mm、帯 12.5mm、帯どうし 7.5mm）
  const pilH = mm(62);
  const gapPB = mm(9);
  const baseH = mm(12.5);
  const gapBB = mm(7.5);
  const blockH = pilH + (bases.length ? gapPB + bases.length * baseH + (bases.length - 1) * gapBB : 0);
  // .c は justify-content:center。版面の縦中央に置く
  const top = FRAME.contentTop + Math.max(0, (contentH() - blockH) / 2);

  // 柱
  const n = Math.max(1, pillars.length);
  const gutter = mm(4);
  const colW = (w - gutter * (n - 1)) / n;
  const padX = mm(4.5), padY = mm(5);
  pillars.forEach((pl, i) => {
    const x = x0 + i * (colW + gutter);
    rect(ctx, slide, x, top, colW, pilH, ctx.colors.SOFTBLUE);
    const runs = [];
    if (pl.title) runs.push({ text: String(pl.title), options: { fontSize: 11, bold: true, color: ctx.colors.INK, breakLine: true, paraSpaceAfter: 5 } });
    if (pl.text) runs.push({ text: String(pl.text), options: { fontSize: 9, bold: false, color: ctx.colors.INK } });
    if (!runs.length) return;
    slide.addText(runs, {
      x: x + padX, y: top + padY, w: colW - padX * 2, h: pilH - padY * 2,
      fontFace: ctx.FONT, margin: 0, valign: "middle", align: "left", fit: "shrink", lineSpacingMultiple: 1.15,
    });
  });

  // 土台の帯
  let by = top + pilH + gapPB;
  bases.forEach((b) => {
    darkPanel(ctx, slide, x0, by, w, baseH);
    const runs = [];
    if (b.lead) runs.push({ text: String(b.lead), options: { fontSize: 10.5, bold: true, color: ctx.colors.CYAN } });
    if (b.lead && b.text) runs.push({ text: " ", options: { fontSize: 10, color: ctx.colors.WHITE } });
    if (b.text) runs.push({ text: String(b.text), options: { fontSize: 10, bold: false, color: ctx.colors.WHITE } });
    if (runs.length) {
      slide.addText(runs, {
        x: x0 + mm(5), y: by, w: w - mm(10), h: baseH,
        fontFace: ctx.FONT, margin: 0, valign: "middle", align: "left", fit: "shrink",
      });
    }
    by += baseH + gapBB;
  });
}
