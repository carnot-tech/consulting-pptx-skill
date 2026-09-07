// パーツ11: 主張パネル＋図（左=濃色パネルに番号・区分・主張、右=軸見出し＋表）
import { FRAME, contentW, contentH, mm, darkPanel, addSerif, colHeader } from "./_helpers.mjs";

export const id = "claim_panel_figure";
export const name = "主張パネル＋図";
export const part = 11;
export const doc =
  "parts.panel: {n: 番号, label: 区分名, claim: この1枚の主張（1文）}／" +
  "parts.right: {axisTitle: 指標名, unit: 単位・期間（右寄せ）, rows: [[軸ラベル, 大きめの値ラベル, 本文], ...]} 2〜4行。" +
  "右の表は見出し行なし（軸列＝明朝アクセント＋右太罫、2列目＝14pt太字、3列目＝本文）";

export const example = {
  template: id,
  kicker: "パーツ11｜主張パネル＋図",
  title: name,
  source: "出典：Source 1",
  parts: {
    panel: { n: "2", label: "ラベル 1（区分名）", claim: "Text 1（この1枚の主張を1文で）" },
    right: {
      axisTitle: "指標名",
      unit: "単位、YYYY〜YYYY年",
      rows: [
        ["ラベル 7", "ラベル 8", "Text 1"],
        ["ラベル 9", "ラベル 10", "Text 2"],
        ["ラベル 11", "ラベル 12", "Text 3"],
      ],
    },
  },
};

// 見出し行なしの3列表（.side .sb table）。軸列は明朝アクセント＋右太罫、行間は細罫、最終行は罫なし
function figureTable(ctx, slide, rows, x, y, w, h) {
  const n = rows.length || 1;
  const colW = [mm(40), mm(32), Math.max(1, w - mm(72))];
  const rh = h / n;
  const border0 = { type: "none", pt: 0, color: ctx.colors.WHITE };
  const inkB = { type: "solid", pt: 1.4, color: ctx.colors.INK };
  const hairB = { type: "solid", pt: 0.6, color: ctx.colors.HAIR };
  const body = rows.map((r, ri) => {
    const last = ri === n - 1;
    const bottom = last ? border0 : hairB;
    const cells = Array.isArray(r) ? r : [r.axis, r.value, r.text];
    return [
      { text: String(cells[0] ?? ""), options: { fontFace: ctx.FONT_SERIF, fontSize: 11, bold: true, color: ctx.colors.BLUE, valign: "middle", margin: [0.06, 0.1, 0.06, 0.1], border: [border0, inkB, bottom, border0] } },
      { text: String(cells[1] ?? ""), options: { fontFace: ctx.FONT, fontSize: 14, bold: true, color: ctx.colors.INK, valign: "middle", margin: [0.06, 0.1, 0.06, 0.1], border: [border0, border0, bottom, border0] } },
      { text: String(cells[2] ?? ""), options: { fontFace: ctx.FONT, fontSize: 10, color: ctx.colors.INK, valign: "middle", margin: [0.06, 0.1, 0.06, 0.1], border: [border0, border0, bottom, border0] } },
    ];
  });
  slide.addTable(body, { x, y, w, colW, rowH: rows.map(() => rh), fontFace: ctx.FONT, autoPage: false });
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const panel = p.panel || {};
  const right = p.right || {};

  const x0 = FRAME.M, y0 = FRAME.contentTop, H = contentH();
  const panelW = mm(62);
  const pad = mm(6);

  // ── 左: 濃色パネル（番号・区分名は上、主張は下）
  darkPanel(ctx, slide, x0, y0, panelW, H);
  const innerX = x0 + pad, innerW = panelW - pad * 2;
  addSerif(ctx, slide, panel.n ?? "", innerX, y0 + pad, innerW, 0.42, { fontSize: 26, color: ctx.colors.CYAN, valign: "top" });
  slide.addText(String(panel.label ?? ""), {
    x: innerX, y: y0 + pad + 0.46, w: innerW, h: 0.24, fontFace: ctx.FONT, fontSize: 9.5, bold: true,
    color: ctx.colors.HAIR, charSpacing: 1, margin: 0, valign: "top", fit: "shrink", breakLine: false,
  });
  const claimH = 1.4;
  addSerif(ctx, slide, panel.claim ?? "", innerX, y0 + H - pad - claimH, innerW, claimH, { fontSize: 14, color: ctx.colors.WHITE, valign: "bottom" });

  // ── 右: 軸見出し（指標名＋単位）＋ 表
  const rx = x0 + panelW + mm(8);
  const rw = contentW() - panelW - mm(8);
  const tableY = colHeader(ctx, slide, right.axisTitle ?? "", rx, y0 + 0.04, rw, { unit: right.unit, color: ctx.colors.INK, h: 0.26, gap: 0.12 });
  figureTable(ctx, slide, right.rows || [], rx, tableY, rw, y0 + H - tableY);
}
