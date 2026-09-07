// 型プラグイン共通ヘルパー（自由記述パーツ集 templates/freeform_parts_16x9.html の見た目を pptxgenjs で再現する）
//
// 単位: すべてインチ。HTML 側は mm なので mm() で換算する（スライド 338.67×190.5mm = 13.333×7.5in）。
// 配色: HTML パーツ集の暖色プレースホルダーを ctx.colors に写像する。
//   #241a10 濃色（文字・濃い塗り） → INK / NAVY
//   #6b4a2b アクセント（見出し・軸ラベル・番号） → BLUE
//   #c9a97e 淡いアクセント（三角・バー） → CYAN
//   #8a7c6c 補助文字 → MUTED     #c7b69e 罫線 → HAIR     #f1ebe0/#efe8da カード塗り → SOFTBLUE
//   本文 #4a3d30 は INK で代用（濃さの差は太字の有無で出す）
// 規約（slide-rules）: 角丸なし・塗りありに枠線なし・最終行に罫線なし・ブレットは書式（buChar）・表の軸は太下罫。

export const mm = (v) => v / 25.4;

// 余白・版面（exporter の定数と同じ値。ctx からも取れるが、型モジュール内の見通しのため再掲）
export const FRAME = {
  W: 13.333, H: 7.5, M: 0.63,
  contentTop: 1.72,       // 本文開始（タイトル1行のとき）
  contentBottom: 6.75,    // 本文下端（.c の margin-bottom 19mm）
};
export const contentW = () => FRAME.W - FRAME.M * 2;
export const contentH = () => FRAME.contentBottom - FRAME.contentTop;

// 明朝の見出し（.l / .colh / .axh / .tn 等）
export function serif(ctx, text, x, y, w, h, opts = {}) {
  return {
    text: String(text ?? ""),
    opts: {
      x, y, w, h, fontFace: ctx.FONT_SERIF, fontSize: opts.fontSize || 11.5, bold: opts.bold ?? true,
      color: opts.color || ctx.colors.BLUE, margin: 0, valign: opts.valign || "top", align: opts.align || "left",
      fit: "shrink", breakLine: false, charSpacing: opts.charSpacing,
    },
  };
}
export function addSerif(ctx, slide, text, x, y, w, h, opts = {}) {
  const t = serif(ctx, text, x, y, w, h, opts);
  slide.addText(t.text, t.opts);
}

// 本文（ゴシック）。ctx.addBodyText の薄いラッパー
export function addText(ctx, slide, text, x, y, w, h, opts = {}) {
  ctx.addBodyText(slide, text, x, y, w, h, { fontSize: 10, margin: 0, ...opts });
}

// 書式ブレット（§7.3）。items が1件でも配列で渡す
export function addBullets(ctx, slide, items, x, y, w, h, opts = {}) {
  const runs = ctx.toFormattedBullets(items);
  if (!runs) return;
  slide.addText(runs, {
    x, y, w, h, fontFace: ctx.FONT, fontSize: opts.fontSize || 10, color: opts.color || ctx.colors.INK,
    margin: 0, valign: opts.valign || "top", fit: "shrink", paraSpaceAfter: opts.paraSpaceAfter ?? 4,
  });
}

// 水平罫線
export function hline(ctx, slide, x, y, w, opts = {}) {
  slide.addShape(ctx.pptx.ShapeType.line, { x, y, w, h: 0, line: { color: opts.color || ctx.colors.HAIR, width: opts.width || 0.75 } });
}
// 垂直罫線
export function vline(ctx, slide, x, y, h, opts = {}) {
  slide.addShape(ctx.pptx.ShapeType.line, { x, y, w: 0, h, line: { color: opts.color || ctx.colors.HAIR, width: opts.width || 0.75 } });
}
// 塗り矩形（枠線なし）
export function rect(ctx, slide, x, y, w, h, color) {
  slide.addShape(ctx.pptx.ShapeType.rect, { x, y, w, h, fill: { color }, line: { color, width: 0 } });
}

// カラム見出し（.colh / .axh）: 明朝太字アクセント＋濃色の太い下罫。戻り値は次の要素の y
export function colHeader(ctx, slide, text, x, y, w, opts = {}) {
  const h = opts.h || 0.32;
  addSerif(ctx, slide, text, x, y, w - (opts.unit ? 2.0 : 0), h, { fontSize: opts.fontSize || 11.5, valign: "bottom", color: opts.color || ctx.colors.BLUE });
  if (opts.unit) addText(ctx, slide, opts.unit, x + w - 2.0, y, 2.0, h, { fontSize: 8.5, color: ctx.colors.MUTED, align: "right", valign: "bottom" });
  hline(ctx, slide, x, y + h + 0.04, w, { color: ctx.colors.INK, width: 1.4 });
  return y + h + 0.04 + (opts.gap ?? 0.14);
}

// 行リスト（.rows）: 左に明朝ラベル、右に本文、行間は細罫（先頭行に罫なし）。高さ h を行数で等分し縦中央
export function rowsList(ctx, slide, rows, x, y, w, h, opts = {}) {
  const labelW = opts.labelW ?? mm(44);
  const gap = opts.gap ?? mm(6);
  const n = rows.length || 1;
  const rh = h / n;
  rows.forEach((r, i) => {
    const ry = y + i * rh;
    if (i > 0) hline(ctx, slide, x, ry, w, { color: ctx.colors.HAIR });
    addSerif(ctx, slide, r.label, x, ry, labelW, rh, { fontSize: opts.labelSize || 11.5, valign: "middle" });
    const refW = r.ref ? 0.9 : 0;
    addText(ctx, slide, r.text, x + labelW + gap, ry, w - labelW - gap - refW, rh, { fontSize: opts.fontSize || 10.5, valign: "middle" });
    if (r.ref) addText(ctx, slide, r.ref, x + w - refW, ry, refW, rh, { fontSize: 8, bold: true, color: ctx.colors.BLUE, align: "right", valign: "middle" });
  });
}

// 表（th 太字＋濃色太下罫／td 細罫／最終行罫なし／軸列は明朝アクセント＋右太罫）
// cols: [{w, axis?:bool, align?}] rows: string[][] または {text, bullets?:string[], bold?}[]
export function table(ctx, slide, { headers, rows, cols, x, y, w, h, fontSize = 10, headSize = 11.5, rowH, autoFill = true }) {
  const nCols = headers.length;
  const weights = (cols || headers.map(() => ({}))).map((c) => c.w || 1);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const colW = weights.map((v) => (w * v) / sumW);
  const headH = rowH?.[0] || 0.4;
  const bodyRows = rows.length;
  const eachH = rowH ? undefined : autoFill ? Math.max(0.36, (h - headH) / Math.max(1, bodyRows)) : 0.42;
  const border0 = { type: "none", pt: 0, color: ctx.colors.WHITE };
  const inkB = { type: "solid", pt: 1.4, color: ctx.colors.INK };
  const hairB = { type: "solid", pt: 0.6, color: ctx.colors.HAIR };
  const isAxis = (ci) => !!(cols && cols[ci] && cols[ci].axis);
  const head = headers.map((t, ci) => ({
    text: String(t ?? ""),
    options: {
      bold: true, fontSize: headSize, fontFace: ctx.FONT, color: ctx.colors.INK, valign: "bottom",
      align: (cols && cols[ci] && cols[ci].align) || "left", margin: [0.02, 0.06, 0.06, 0.06],
      border: [border0, isAxis(ci) ? inkB : border0, inkB, border0],
    },
  }));
  const body = rows.map((r, ri) =>
    r.map((cell, ci) => {
      const c = typeof cell === "object" && cell !== null ? cell : { text: cell };
      const last = ri === bodyRows - 1;
      const base = {
        fontSize, fontFace: isAxis(ci) ? ctx.FONT_SERIF : ctx.FONT, color: isAxis(ci) ? ctx.colors.BLUE : ctx.colors.INK,
        bold: !!(c.bold || isAxis(ci)), valign: "middle", align: c.align || (cols && cols[ci] && cols[ci].align) || "left",
        margin: [0.06, 0.06, 0.06, 0.06],
        border: [border0, isAxis(ci) ? inkB : border0, last ? border0 : hairB, border0],
        fill: c.fill ? { color: c.fill } : undefined,
      };
      if (c.bullets && c.bullets.length) {
        return { text: c.bullets.map((b, i) => ({ text: String(b), options: { bullet: { code: "2022", indent: 10 }, breakLine: i < c.bullets.length - 1 } })), options: base };
      }
      return { text: String(c.text ?? ""), options: base };
    }),
  );
  const rowHeights = rowH || [headH, ...rows.map(() => eachH)];
  slide.addTable([head, ...body], { x, y, w, colW, rowH: rowHeights, fontFace: ctx.FONT, autoPage: false });
  return y + rowHeights.reduce((a, b) => a + b, 0);
}

// 矢羽（chevron）。first=true は左端が平らな homePlate
export function chevron(ctx, slide, x, y, w, h, { first = false, color, text, sub, n, textColor } = {}) {
  const fill = color || ctx.colors.SOFTBLUE;
  // rectRadius は preset 図形の汎用 adj に書かれるので、矢羽の切り込み深さ（HTML は 6mm）を固定できる
  slide.addShape(first ? ctx.pptx.ShapeType.homePlate : ctx.pptx.ShapeType.chevron, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: mm(6) });
  const padL = first ? mm(5) : mm(9);
  const tx = x + padL, tw = w - padL - mm(6);
  let ty = y + mm(4);
  if (n != null) { addText(ctx, slide, String(n), tx, ty, tw, 0.28, { fontSize: 12, bold: true, color: textColor || ctx.colors.BLUE }); ty += 0.3; }
  if (text) { addText(ctx, slide, text, tx, ty, tw, 0.3, { fontSize: 10.5, bold: true, color: textColor || ctx.colors.INK }); ty += 0.34; }
  if (sub) addText(ctx, slide, sub, tx, ty, tw, y + h - ty - mm(3), { fontSize: 9, color: textColor || ctx.colors.INK });
}

// 右向き三角（前提→帰結の「だから」）。中心 (cx, cy)
// HTML .tri は幅 6mm × 高さ 10mm。rotate:90 で幅と高さが入れ替わるので、回転前の箱は w=10mm, h=6mm
export function triangleRight(ctx, slide, cx, cy, size = mm(6), color) {
  const tall = size * 1.667;
  slide.addShape(ctx.pptx.ShapeType.triangle, { x: cx - tall / 2, y: cy - size / 2, w: tall, h: size, rotate: 90, fill: { color: color || ctx.colors.CYAN }, line: { color: color || ctx.colors.CYAN, width: 0 } });
}

// カード（.card）: 薄い塗り＋番号・見出し行（下に細罫）＋本文
export function card(ctx, slide, x, y, w, h, { n, title, body, bullets, fill } = {}) {
  rect(ctx, slide, x, y, w, h, fill || ctx.colors.SOFTBLUE);
  const px = x + mm(4);
  const headH = 0.42;
  let tx = px;
  if (n != null) { addText(ctx, slide, String(n), px, y + mm(3.5), 0.4, headH - mm(3.5), { fontSize: 14, bold: true, color: ctx.colors.BLUE, valign: "bottom" }); tx += 0.42; }
  addText(ctx, slide, title || "", tx, y + mm(3.5), x + w - mm(4) - tx, headH - mm(3.5), { fontSize: 11, bold: true, valign: "bottom" });
  hline(ctx, slide, px, y + headH + 0.04, w - mm(8), { color: ctx.colors.HAIR });
  const by = y + headH + 0.14;
  if (bullets && bullets.length) addBullets(ctx, slide, bullets, px, by, w - mm(8.5), y + h - by - mm(3), { fontSize: 10 });
  else if (body) addText(ctx, slide, body, px, by, w - mm(8.5), y + h - by - mm(3), { fontSize: 10 });
}

// 濃色パネル（.stat / .side .sp / .base）
export function darkPanel(ctx, slide, x, y, w, h) {
  rect(ctx, slide, x, y, w, h, ctx.colors.NAVY);
}

// 出典行は exporter の addFooter が item.source / item.note を刷るので、型モジュールでは描かない。
//
// addShell のオプション:
//   { titleRule: false }  … タイトル下罫なし（既定。常にこれ）
//   { balance: false }    … 縦中央寄せをしない。版面いっぱいに組む型（行リスト・表・グリッド）は必ず指定する。
//                          中身が版面より明らかに小さい型（数枚のカード等）だけ既定の中央寄せに任せる。
