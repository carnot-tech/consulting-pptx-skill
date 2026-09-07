// パーツ20: 対向シェブロン（左右の項目列を、中央の下向き五角形ブロックの目的に束ねる）
import { FRAME, contentW, contentH, hline, addText, mm } from "./_helpers.mjs";

export const id = "opposing_chevrons";
export const name = "対向シェブロン";
export const part = 20;
export const doc =
  "parts.left / parts.right: 文字列の配列（各 3〜5項目、10pt、細罫で区切って縦に等分）／" +
  "parts.center: [{text, alt?}] 中央の目的ブロック 1〜3個（濃色、alt:true はアクセント色。改行は \\n）。中央幅は 46mm 固定";

export const example = {
  template: id,
  kicker: "パーツ20｜対向シェブロン",
  title: name,
  source: "出典：Source 1",
  parts: {
    left: ["Text 1", "Text 2", "Text 3", "Text 4"],
    center: [
      { text: "収益を\n拡大する" },
      { text: "損失を\n抑える", alt: true },
    ],
    right: ["Text 5", "Text 6", "Text 7", "Text 8"],
  },
};

// 下向き五角形（clip-path 0 0,100% 0,100% 78%,50% 100%,0 78%）を編集可能なカスタム図形で描く
function downPentagon(ctx, slide, x, y, w, h, color) {
  slide.addShape(ctx.pptx.ShapeType.custGeom, {
    x, y, w, h,
    fill: { color }, line: { color, width: 0 },
    points: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h * 0.78 },
      { x: w / 2, y: h },
      { x: 0, y: h * 0.78 },
      { close: true },
    ],
  });
}

function listColumn(ctx, slide, items, x, y, w, h) {
  const n = items.length || 1;
  const rh = h / n;
  items.forEach((t, i) => {
    const ry = y + i * rh;
    if (i > 0) hline(ctx, slide, x, ry, w, { color: ctx.colors.HAIR });
    addText(ctx, slide, t, x, ry + mm(2), w, rh - mm(4), { fontSize: 10, color: ctx.colors.INK, valign: "middle" });
  });
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const left = Array.isArray(p.left) ? p.left.map(String) : [];
  const right = Array.isArray(p.right) ? p.right.map(String) : [];
  const center = Array.isArray(p.center) ? p.center : [];

  const x0 = FRAME.M;
  const w = contentW();
  const top = FRAME.contentTop;
  const h = contentH();
  const gutter = mm(6);
  const midW = mm(46);
  const sideW = (w - midW - gutter * 2) / 2;
  const midX = x0 + sideW + gutter;

  // 左右の項目列
  listColumn(ctx, slide, left, x0, top, sideW, h);
  listColumn(ctx, slide, right, midX + midW + gutter, top, sideW, h);

  // 中央ブロック（padding 9mm 上下 ＋ 14pt 明朝の行数）。積み上げて縦中央
  const gap = mm(3);
  const blocks = center.map((b) => {
    const text = String(b.text ?? "").replace(/<br\s*\/?>/gi, "\n");
    const lines = Math.max(1, text.split("\n").length);
    return { text, alt: !!b.alt, h: mm(18) + (lines * 14 * 1.25) / 72 };
  });
  const stackH = blocks.reduce((a, b) => a + b.h, 0) + gap * Math.max(0, blocks.length - 1);
  let by = top + Math.max(0, (h - stackH) / 2);
  blocks.forEach((b) => {
    const color = b.alt ? ctx.colors.BLUE : ctx.colors.NAVY;
    downPentagon(ctx, slide, midX, by, midW, b.h, color);
    slide.addText(b.text, {
      x: midX + mm(3), y: by, w: midW - mm(6), h: b.h,
      fontFace: ctx.FONT_SERIF, fontSize: 14, bold: true, color: ctx.colors.WHITE,
      align: "center", valign: "middle", margin: 0, fit: "shrink",
    });
    by += b.h + gap;
  });
}
