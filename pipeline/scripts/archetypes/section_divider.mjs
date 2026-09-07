// パーツ04: 章扉（h1 なし。章番号（明朝アクセント・字間広め）＋章タイトル（明朝 30pt））
import { FRAME, mm, addSerif } from "./_helpers.mjs";

export const id = "section_divider";
export const name = "章扉";
export const part = 4;
export const doc = "parts.no: 章番号（「01」などのラベル。明朝アクセント 15pt・字間広め）／parts.title: 章タイトル（明朝 30pt。目次と同じ文言）／parts.desc: 任意。章の一行説明（12pt アクセント）";

export const example = {
  template: id,
  kicker: "パーツ04｜章扉",
  title: name,
  parts: { no: "ラベル 1", title: "Text 1" },
};

// HTML .chap: bar 下端(≈22.2mm) + .cno margin-top 55mm → 77.2mm。15pt ≈ 6.4mm行。
// .cbig: margin-top 4mm、30pt ≈ 12.7mm行。
const BAR_BOTTOM = mm(22.2);
const NO_Y = BAR_BOTTOM + mm(57.5);    // HTML 実測位置に合わせて補正
const NO_H = mm(6.5);
const W_TEXT = mm(220);

export function pptx(ctx, item, pageNum) {
  const slide = ctx.pptx.addSlide();
  slide.background = { color: ctx.colors.WHITE };
  ctx.addKicker(slide, item.kicker || item.template);
  const p = item.parts || {};

  // 章番号（letter-spacing .2em ≒ 3pt）
  addSerif(ctx, slide, p.no || "", FRAME.M, NO_Y, W_TEXT, NO_H, { fontSize: 15, bold: true, color: ctx.colors.BLUE, valign: "top", charSpacing: 3 });

  // 章タイトル
  const big = ctx.smartBreak(p.title || "", ctx.lineCapacity(W_TEXT, 30, 1.0) - 1);
  const lines = big.split("\n").length;
  slide.addText(big, {
    x: FRAME.M, y: NO_Y + NO_H + mm(6.5), w: W_TEXT, h: mm(13) * lines,
    fontFace: ctx.FONT_SERIF, fontSize: 30, bold: true, color: ctx.colors.INK,
    margin: 0, valign: "top", fit: "none", breakLine: false,
  });

  // 任意の一行説明
  if (p.desc) {
    ctx.addBodyText(slide, p.desc, FRAME.M, NO_Y + NO_H + mm(6.5) + mm(13) * lines + mm(4), W_TEXT, mm(8), { fontSize: 12, color: ctx.colors.BLUE, margin: 0 });
  }

  ctx.addFooter(slide, item, pageNum);
}
