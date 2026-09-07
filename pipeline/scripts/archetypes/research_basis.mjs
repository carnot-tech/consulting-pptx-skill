// パーツ25: 調査の土台（左=調べ方のブレット、三角、右=調べた対象を大型数値で縦に積む）
import { FRAME, contentW, contentH, mm, colHeader, addBullets, addText, hline } from "./_helpers.mjs";

export const id = "research_basis";
export const name = "調査の土台";
export const part = 25;
export const doc =
  "parts.methodTitle: 左カラム見出し（既定「調べ方」）／parts.methods: [文字列] 調べ方のブレット 2〜4件／" +
  "parts.targetTitle: 右カラム見出し（既定「調べた対象」）／parts.targets: [{n: 大型数値＋単位（ラベル 1社 / Nか月）, text: 内訳の説明}] 2〜4行";

export const example = {
  template: id,
  kicker: "パーツ25｜調査の土台",
  title: name,
  source: "出典：Source 1（調査期間 YYYY年M月〜M月）",
  parts: {
    methodTitle: "調べ方",
    methods: ["Text 1", "Text 2", "Text 3"],
    targetTitle: "調べた対象",
    targets: [
      { n: "ラベル 1社", text: "Text 4" },
      { n: "ラベル 2件", text: "Text 5" },
      { n: "Nか月", text: "Text 6" },
    ],
  },
};

// 右向き三角（.tri: 幅 6mm・高さ 10mm）。中心 (cx, cy)。上向き三角を 90° 回すので、回転前の箱は w=高さ・h=幅
function triRight(ctx, slide, cx, cy, w = mm(6), h = mm(10)) {
  const c = ctx.colors.CYAN;
  slide.addShape(ctx.pptx.ShapeType.triangle, { x: cx - h / 2, y: cy - w / 2, w: h, h: w, rotate: 90, fill: { color: c } });
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const methods = p.methods || [];
  const targets = p.targets || [];

  const x0 = FRAME.M, top = FRAME.contentTop, W = contentW(), H = contentH();
  const bottom = top + H;

  // .two（1fr auto 1.35fr, gap 6mm）
  const gap = mm(6), triW = mm(6);
  const flexW = W - triW - gap * 2;
  const leftW = flexW / 2.35;
  const rightX = x0 + leftW + gap + triW + gap;
  const rightW = x0 + W - rightX;

  // ── 左: 調べ方（見出し＋ブレット。上詰め）
  const ly = colHeader(ctx, slide, p.methodTitle ?? "調べ方", x0, top, leftW, { h: 0.3, gap: 0.14 });
  addBullets(ctx, slide, methods, x0, ly, leftW, bottom - ly, { fontSize: 10, paraSpaceAfter: 8 });

  // ── 中央: 右向き三角（版面の縦中央）
  triRight(ctx, slide, x0 + leftW + gap + triW / 2, top + H / 2, triW);

  // ── 右: 調べた対象（見出し＋大型数値の行。行間は細罫、最終行は罫なし）
  const ry = colHeader(ctx, slide, p.targetTitle ?? "調べた対象", rightX, top, rightW, { h: 0.3, gap: 0.14 });
  const n = targets.length || 1;
  const rh = (bottom - ry) / n;
  const numW = mm(40), pad = mm(2.5);
  targets.forEach((t, i) => {
    const y = ry + i * rh;
    if (i > 0) hline(ctx, slide, rightX, y, rightW, { color: ctx.colors.HAIR });
    slide.addText(String(t.n ?? ""), {
      x: rightX + pad, y, w: numW, h: rh, fontFace: ctx.FONT, fontSize: 17, bold: true, color: ctx.colors.INK,
      margin: 0, valign: "middle", breakLine: false,
    });
    addText(ctx, slide, t.text ?? "", rightX + pad + numW + pad, y, rightW - numW - pad * 3, rh, { fontSize: 10, valign: "middle" });
  });
}
