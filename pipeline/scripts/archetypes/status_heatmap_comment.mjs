// パーツ13: 状態ヒートマップ＋右コメント（定点観測。凡例必須。左=色ブロックの表、三角、右=だから見るべき点）
import { FRAME, contentW, mm, table, addText, rect, colHeader, addBullets } from "./_helpers.mjs";

export const id = "status_heatmap_comment";
export const name = "状態ヒートマップ＋右コメント";
export const part = 13;
export const doc =
  "parts.axisTitle: 左の軸見出し（例「指標カテゴリー別の状況」）／parts.unit: 右寄せの時点（YYYY年M月時点）／" +
  "parts.colHeaders: 列見出し（先頭が軸列、以降が比較軸。例 [指標カテゴリー, 前月比, 前年比]）／" +
  "parts.rows: [{label, values: [0〜4, ...]}] 3〜6行。値は 4=大きく改善（濃）… 0=横ばい（淡灰）／" +
  "parts.legend: [{v: 0〜4, label}] 凡例（既定: 大きく改善/改善/横ばい/悪化）／" +
  "parts.commentTitle: 右カラム見出し（既定「だから、次に見るべき点」）／parts.comments: [文字列] 2〜4件";

export const example = {
  template: id,
  kicker: "パーツ13｜状態ヒートマップ＋右コメント",
  title: name,
  source: "出典：Source 1",
  parts: {
    axisTitle: "指標カテゴリー別の状況",
    unit: "YYYY年M月時点",
    colHeaders: ["指標カテゴリー", "前月比", "前年比"],
    rows: [
      { label: "ラベル 1", values: [4, 2] },
      { label: "ラベル 2", values: [3, 3] },
      { label: "ラベル 3", values: [0, 4] },
      { label: "ラベル 4", values: [2, 0] },
    ],
    legend: [
      { v: 4, label: "大きく改善" },
      { v: 3, label: "改善" },
      { v: 0, label: "横ばい" },
      { v: 2, label: "悪化" },
    ],
    commentTitle: "だから、次に見るべき点",
    comments: ["Text 1", "Text 2", "Text 3"],
  },
};

// v0..v4 → 色（.hm .v4 濃色 / .v3 アクセント / .v2 淡アクセント / .v1 カード塗り / .v0 淡灰）
function levelColor(ctx, v) {
  const c = ctx.colors;
  return [c.HAIR, c.SOFTBLUE, c.CYAN, c.BLUE, c.NAVY][Math.min(4, Math.max(0, Number(v) || 0))];
}

// 右向き三角（.tri: 幅 6mm・高さ 10mm）。中心 (cx, cy)。上向き三角を 90° 回すので、回転前の箱は w=高さ・h=幅
function triRight(ctx, slide, cx, cy, w = mm(6), h = mm(10)) {
  const c = ctx.colors.CYAN;
  slide.addShape(ctx.pptx.ShapeType.triangle, { x: cx - h / 2, y: cy - w / 2, w: h, h: w, rotate: 90, fill: { color: c } });
}

// 凡例（右寄せ・4mm角＋8pt）。戻り値は下端 y
function legend(ctx, slide, items, xRight, y) {
  const sq = mm(4), gapIn = mm(1.5), gapOut = mm(6), lineH = 0.2;
  const widths = items.map((it) => sq + gapIn + ctx.fwLen(it.label) * 0.118 + 0.04);
  let x = xRight - widths.reduce((a, b) => a + b, 0) - gapOut * (items.length - 1);
  items.forEach((it, i) => {
    rect(ctx, slide, x, y + (lineH - sq) / 2, sq, sq, levelColor(ctx, it.v));
    addText(ctx, slide, it.label, x + sq + gapIn, y, widths[i] - sq - gapIn, lineH, { fontSize: 8, valign: "middle" });
    x += widths[i] + gapOut;
  });
  return y + lineH;
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const colHeaders = p.colHeaders || ["指標カテゴリー", "前月比", "前年比"];
  const rows = p.rows || [];
  const legendItems = p.legend || [
    { v: 4, label: "大きく改善" }, { v: 3, label: "改善" }, { v: 0, label: "横ばい" }, { v: 2, label: "悪化" },
  ];

  const x0 = FRAME.M, W = contentW();
  const legendBottom = legend(ctx, slide, legendItems, x0 + W, FRAME.contentTop + 0.04);
  const top = legendBottom + mm(5);
  const bottom = FRAME.contentBottom;

  // .two（1.25fr auto 1fr, gap 6mm）
  const gap = mm(6), triW = mm(6);
  const flexW = W - triW - gap * 2;
  const leftW = (flexW * 1.25) / 2.25;
  const rightX = x0 + leftW + gap + triW + gap;
  const rightW = x0 + W - rightX;

  // ── 左: 軸見出し＋ヒートマップ表
  const tableY = colHeader(ctx, slide, p.axisTitle ?? "", x0, top, leftW, { unit: p.unit, color: ctx.colors.INK, h: 0.3, gap: 0.12 });
  const h = bottom - tableY;
  const headH = 0.4;
  const n = rows.length || 1;
  const rh = Math.max(0.36, (h - headH) / n);
  const nCmp = Math.max(1, colHeaders.length - 1);
  const cols = [{ w: 38, axis: true }, ...Array.from({ length: nCmp }, () => ({ w: 26 }))];
  const sumW = cols.reduce((a, c) => a + c.w, 0);
  const colW = cols.map((c) => (leftW * c.w) / sumW);
  const bodyRows = rows.map((r) => [r.label ?? "", ...Array.from({ length: nCmp }, () => "")]);
  table(ctx, slide, { headers: colHeaders, rows: bodyRows, cols, x: x0, y: tableY, w: leftW, h, fontSize: 10, headSize: 10.5, rowH: [headH, ...rows.map(() => rh)] });

  // 色ブロック（高さ 5mm・セル内幅いっぱい・行の縦中央）
  const blockH = mm(5);
  rows.forEach((r, i) => {
    const cy = tableY + headH + rh * i + rh / 2;
    (r.values || []).slice(0, nCmp).forEach((v, ci) => {
      const cx = x0 + colW.slice(0, ci + 1).reduce((a, b) => a + b, 0) + mm(2.5);
      rect(ctx, slide, cx, cy - blockH / 2, colW[ci + 1] - mm(5), blockH, levelColor(ctx, v));
    });
  });

  // ── 中央: 右向き三角（版面の縦中央）
  triRight(ctx, slide, x0 + leftW + gap + triW / 2, top + (bottom - top) / 2, triW);

  // ── 右: カラム見出し＋ブレット（残り高さの縦中央）
  const by = colHeader(ctx, slide, p.commentTitle ?? "だから、次に見るべき点", rightX, top, rightW, { h: 0.3, gap: 0.12 });
  addBullets(ctx, slide, p.comments || [], rightX, by, rightW, bottom - by, { fontSize: 10, valign: "middle", paraSpaceAfter: 6 });
}
