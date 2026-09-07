// パーツ12: 打ち手の効果表（項目 × 方向つき矢印 × 効果幅 × 補足。凡例必須）
import { FRAME, contentW, mm, table, addText, rect } from "./_helpers.mjs";

export const id = "lever_effect_table";
export const name = "打ち手の効果表";
export const part = 12;
export const doc =
  "parts.headers: 列見出し3つ [打ち手, 効果の幅（単位）, 前提・制約]／" +
  "parts.rows: [{axis: 打ち手名, effect: {dir: 'up'|'dn', label: 矢印内の文字（＋00〜00 等）, pct: 0〜1 の幅比}, bullets: [補足1, 補足2]}] 2〜5行。" +
  "bullets の代わりに text（文字列）も可／parts.legend: {up, dn} 凡例の文言（既定「増やす方向」「減らす方向」）";

export const example = {
  template: id,
  kicker: "パーツ12｜打ち手の効果表",
  title: name,
  source: "出典：Source 1",
  parts: {
    headers: ["打ち手", "効果の幅（単位）", "前提・制約"],
    rows: [
      { axis: "ラベル 2", effect: { dir: "up", label: "＋00〜00", pct: 0.8 }, bullets: ["Text 1", "Text 2"] },
      { axis: "ラベル 5", effect: { dir: "up", label: "＋00〜00", pct: 0.55 }, bullets: ["Text 3", "Text 4"] },
      { axis: "ラベル 8", effect: { dir: "dn", label: "−00", pct: 0.38 }, bullets: ["Text 5", "Text 6"] },
    ],
  },
};

// 凡例（右寄せ・4mm角の色見本＋8pt文字）。戻り値は凡例の下端 y
function legend(ctx, slide, items, xRight, y) {
  const sq = mm(4), gapIn = mm(1.5), gapOut = mm(6), lineH = 0.2;
  const widths = items.map((it) => sq + gapIn + ctx.fwLen(it.label) * 0.118 + 0.04);
  let x = xRight - widths.reduce((a, b) => a + b, 0) - gapOut * (items.length - 1);
  items.forEach((it, i) => {
    rect(ctx, slide, x, y + (lineH - sq) / 2, sq, sq, it.color);
    addText(ctx, slide, it.label, x + sq + gapIn, y, widths[i] - sq - gapIn, lineH, { fontSize: 8, valign: "middle" });
    x += widths[i] + gapOut;
  });
  return y + lineH;
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const headers = p.headers || ["打ち手", "効果の幅（単位）", "前提・制約"];
  const rows = p.rows || [];
  const lg = p.legend || {};
  const upColor = ctx.colors.BLUE, dnColor = ctx.colors.HAIR;

  const x0 = FRAME.M, w = contentW();
  // 凡例（表の上・右寄せ）
  const legendBottom = legend(ctx, slide, [
    { label: lg.up || "増やす方向", color: upColor },
    { label: lg.dn || "減らす方向", color: dnColor },
  ], x0 + w, FRAME.contentTop + 0.04);

  // 表（行高を明示して矢印の重ね位置を確定させる）
  const tableY = legendBottom + mm(5);
  const h = FRAME.contentBottom - tableY;
  const headH = 0.4;
  const n = rows.length || 1;
  const rh = Math.max(0.36, (h - headH) / n);
  const cols = [{ w: 56, axis: true }, { w: 56 }, { w: Math.max(20, w / mm(1) - 112) }];
  const sumW = cols.reduce((a, c) => a + c.w, 0);
  const colW = cols.map((c) => (w * c.w) / sumW);
  const bodyRows = rows.map((r) => [
    r.axis ?? "",
    "",
    Array.isArray(r.bullets) && r.bullets.length ? { bullets: r.bullets } : (Array.isArray(r.text) ? { bullets: r.text } : (r.text ?? "")),
  ]);
  table(ctx, slide, { headers, rows: bodyRows, cols, x: x0, y: tableY, w, h, fontSize: 10, headSize: 11.5, rowH: [headH, ...rows.map(() => rh)] });

  // 矢印（homePlate）: 幅＝pct × セル内幅、高さ 5.5mm、行の縦中央。addText の margin 配列は [左, 右, 下, 上]（pt）
  const cellX = x0 + colW[0] + 0.06;
  const cellW = colW[1] - 0.12;
  const arH = mm(5.5);
  rows.forEach((r, i) => {
    const ef = r.effect || {};
    const pct = Math.min(1, Math.max(0.08, Number(ef.pct ?? 0.5)));
    const up = (ef.dir || "up") !== "dn";
    const cy = tableY + headH + rh * i + rh / 2;
    slide.addText(String(ef.label ?? ""), {
      shape: ctx.pptx.ShapeType.homePlate,
      x: cellX, y: cy - arH / 2, w: cellW * pct, h: arH,
      fill: { color: up ? upColor : dnColor },
      fontFace: ctx.FONT, fontSize: 9, bold: true, color: up ? ctx.colors.WHITE : ctx.colors.INK,
      margin: [mm(3) * 72, 0, 0, 0], valign: "middle", align: "left", breakLine: false,
    });
  });
}
