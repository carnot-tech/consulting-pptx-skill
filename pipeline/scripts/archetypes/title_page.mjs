// パーツ01: 表紙（h1 なし。ヘッダーバー＋大タイトル＋アクセント短罫＋副題＋フッター）
import { FRAME, mm, addSerif, rect } from "./_helpers.mjs";

export const id = "title_page";
export const name = "表紙";
export const part = 1;
export const doc = "parts.title: 資料タイトル（明朝 34pt）／parts.subtitle: 副題（明朝アクセント 15pt。「ラベル：Text に基づく整理」のように何に基づく資料かを1行で）／parts.lead: 任意。副題の下に置く2〜3行の説明（11pt）";

export const example = {
  template: id,
  kicker: "パーツ01｜表紙",
  title: name,
  parts: { title: "Text 1", subtitle: "ラベル 1：Text 2に基づく整理" },
};

// HTML .cover: bar 下端(≈22.2mm) + .big margin-top 38mm → 60mm。34pt/line-height1.25 ≈ 15mm。
// .rule: 32×1mm、margin 8mm 0 4mm。.sub: 15pt、margin-top 3mm。
const BAR_BOTTOM = mm(22.2);
const BIG_Y = BAR_BOTTOM + mm(39.5);   // LibreOffice の行頭アキ分を補正して HTML 実測位置に合わせる
const BIG_LINE = mm(15);
const W_TEXT = mm(220);

export function pptx(ctx, item, pageNum) {
  const slide = ctx.pptx.addSlide();
  slide.background = { color: ctx.colors.WHITE };
  ctx.addKicker(slide, item.kicker || item.template);
  const p = item.parts || {};

  // 大タイトル（意味の切れ目で改行。泣き別れ防止）
  const big = ctx.smartBreak(p.title || "", ctx.lineCapacity(W_TEXT, 34, 1.0) - 1);
  const lines = big.split("\n").length;
  const bigH = BIG_LINE * lines;
  slide.addText(big, {
    x: FRAME.M, y: BIG_Y, w: W_TEXT, h: bigH,
    fontFace: ctx.FONT_SERIF, fontSize: 34, bold: true, color: ctx.colors.INK,
    margin: 0, valign: "top", fit: "none", breakLine: false,
  });

  // アクセント短罫 32×1mm
  const ruleY = BIG_Y + bigH + mm(8);
  rect(ctx, slide, FRAME.M, ruleY, mm(32), mm(1), ctx.colors.BLUE);

  // 副題（明朝アクセント 15pt）
  const subY = ruleY + mm(1) + mm(4) + mm(3);
  addSerif(ctx, slide, p.subtitle || "", FRAME.M, subY, W_TEXT, mm(9), { fontSize: 15, bold: true, color: ctx.colors.BLUE, valign: "top" });

  // 任意の説明文（カタログ表紙などで使う。11pt・行間広め）
  if (p.lead) {
    ctx.addBodyText(slide, p.lead, FRAME.M, subY + mm(9) + mm(6), mm(180), mm(30), { fontSize: 11, color: ctx.colors.INK, margin: 0 });
  }

  ctx.addFooter(slide, item, pageNum);
}
