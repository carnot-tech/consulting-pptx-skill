// パーツ10: 裏表紙（メッセージなし。会社名＋連絡先だけ。CTA は手前の通常スライドへ）
import { FRAME, mm, addSerif } from "./_helpers.mjs";

export const id = "back_cover";
export const name = "裏表紙";
export const part = 10;
export const doc = "parts.company: 会社名（明朝 22pt）／parts.contact: 連絡先（明朝アクセント 15pt。部署・メール等を1行）。主張文や CTA は置かない";

export const example = {
  template: id,
  kicker: "パーツ10｜裏表紙",
  title: name,
  parts: { company: "会社名", contact: "連絡先" },
};

// HTML .cover: bar 下端(≈22.2mm) + .big margin-top 60mm → 82.2mm。22pt/line-height1.25 ≈ 9.7mm。
// .sub: 15pt、margin-top 3mm。
const BAR_BOTTOM = mm(22.2);
const BIG_Y = BAR_BOTTOM + mm(61.5);   // LibreOffice の行頭アキ分を補正して HTML 実測位置に合わせる
const BIG_H = mm(10);
const W_TEXT = mm(220);

export function pptx(ctx, item, pageNum) {
  const slide = ctx.pptx.addSlide();
  slide.background = { color: ctx.colors.WHITE };
  ctx.addKicker(slide, item.kicker || item.template);
  const p = item.parts || {};

  addSerif(ctx, slide, p.company || "", FRAME.M, BIG_Y, W_TEXT, BIG_H, { fontSize: 22, bold: true, color: ctx.colors.INK, valign: "top" });
  addSerif(ctx, slide, p.contact || "", FRAME.M, BIG_Y + BIG_H + mm(3), W_TEXT, mm(9), { fontSize: 15, bold: true, color: ctx.colors.BLUE, valign: "top" });

  ctx.addFooter(slide, item, pageNum);
}
