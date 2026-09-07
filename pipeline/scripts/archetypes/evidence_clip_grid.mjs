// パーツ21: 外部動向の根拠グリッド（分類タグ＋日付＋見出し＋要旨のカード。出典URLは脚注へ）
import { FRAME, contentW, contentH, rect, addText, addSerif, mm } from "./_helpers.mjs";

export const id = "evidence_clip_grid";
export const name = "外部動向の根拠グリッド";
export const part = 21;
export const doc =
  "parts.clips: [{tag, date, headline, text}] 4〜6枚（4枚まで2列、5〜6枚は3列）。tag は濃色の小さな分類チップ、date は斜体の日付・媒体、" +
  "headline は明朝11pt太字、text は要旨 8.5pt。出典は item.source に「Source 1（YYYY年M月D日）」の形で";

export const example = {
  template: id,
  kicker: "パーツ21｜外部動向の根拠グリッド",
  title: name,
  source: "出典：Source 1（YYYY年M月D日）、Source 2（YYYY年M月D日）",
  parts: {
    clips: [
      { tag: "ラベル 1分類", date: "YYYY年M月D日", headline: "Text 1", text: "Text 2" },
      { tag: "ラベル 2分類", date: "YYYY年M月D日", headline: "Text 3", text: "Text 4" },
      { tag: "ラベル 3分類", date: "YYYY年M月D日", headline: "Text 5", text: "Text 6" },
      { tag: "ラベル 4分類", date: "YYYY年M月D日", headline: "Text 7", text: "Text 8" },
    ],
  },
};

// 全角換算の文字数（ctx.fwLen が無い環境でも動くよう手元に持つ）
function fwLen(str) {
  let n = 0;
  for (const ch of String(str || "")) n += ch.charCodeAt(0) < 0x3000 ? 0.5 : 1;
  return n;
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const clips = Array.isArray(p.clips) ? p.clips : [];
  const n = clips.length;
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));

  const x0 = FRAME.M;
  const w = contentW();
  const top = FRAME.contentTop;
  const h = contentH();
  const gutter = mm(4);
  const cw = (w - gutter * (cols - 1)) / cols;
  const ch = (h - gutter * (rows - 1)) / rows;
  const padX = mm(5), padY = mm(4.5);
  const gap = mm(2);

  clips.forEach((c, i) => {
    const cx = x0 + (i % cols) * (cw + gutter);
    const cy = top + Math.floor(i / cols) * (ch + gutter);
    rect(ctx, slide, cx, cy, cw, ch, ctx.colors.SOFTBLUE);
    const ix = cx + padX;
    const iw = cw - padX * 2;
    let y = cy + padY;

    // .cg 分類チップ（濃色・白 7.5pt 太字）
    if (c.tag) {
      const chipH = 0.2;
      const chipW = Math.min(iw, fwLen(c.tag) * (7.5 / 72) * 1.08 + mm(5));
      rect(ctx, slide, ix, y, chipW, chipH, ctx.colors.NAVY);
      addText(ctx, slide, c.tag, ix, y, chipW, chipH, {
        fontSize: 7.5, bold: true, color: ctx.colors.WHITE, align: "center", valign: "middle",
      });
      y += chipH + gap;
    }
    // .cd 日付・媒体（斜体・補助色 8pt）
    if (c.date) {
      slide.addText(String(c.date), {
        x: ix, y, w: iw, h: 0.18, fontFace: ctx.FONT, fontSize: 8, italic: true, color: ctx.colors.MUTED,
        margin: 0, valign: "top", fit: "shrink",
      });
      y += 0.18 + gap;
    }
    // .ch 見出し（明朝 11pt 太字・濃色）
    if (c.headline) {
      const hh = fwLen(c.headline) > iw / (11 / 72) ? 0.46 : 0.24;
      addSerif(ctx, slide, c.headline, ix, y, iw, hh, { fontSize: 11, color: ctx.colors.INK, valign: "top" });
      y += hh + gap;
    }
    // .cx 要旨（8.5pt）
    if (c.text) {
      addText(ctx, slide, c.text, ix, y, iw, Math.max(0.2, cy + ch - padY - y), { fontSize: 8.5, color: ctx.colors.INK, valign: "top" });
    }
  });
}
