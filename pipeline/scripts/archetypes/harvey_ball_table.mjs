// パーツ14: 充足度評価表（ハーベイボール）。選択肢×評価軸を充填円 q0..q4 で示す。凡例必須
import { FRAME, contentW, mm, table, addText } from "./_helpers.mjs";

export const id = "harvey_ball_table";
export const name = "充足度評価表（ハーベイボール）";
export const part = 14;
export const doc =
  "parts.headers: 列見出し [評価軸, 案1, 案2, ..., 判断の理由]（先頭が軸列、最後が理由列、その間が玉の列）／" +
  "parts.rows: [{axis: 評価軸名, values: [0〜4, ...] 案ごとの充足度（4=満たす, 2=半分, 0=満たさない）, bullets: [理由1, 理由2]}] 3〜5行。" +
  "bullets の代わりに text（文字列）も可／parts.legend: [{q: 0〜4, label}]（既定: 満たす/一部満たす/満たさない）";

export const example = {
  template: id,
  kicker: "パーツ14｜充足度評価表（ハーベイボール）",
  title: name,
  source: "出典：Source 1",
  parts: {
    headers: ["評価軸", "ラベル 1案", "ラベル 2案", "判断の理由"],
    rows: [
      { axis: "ラベル 3", values: [4, 2], bullets: ["Text 1", "Text 2"] },
      { axis: "ラベル 4", values: [3, 0], bullets: ["Text 3", "Text 4"] },
      { axis: "ラベル 5", values: [2, 4], bullets: ["Text 5", "Text 6"] },
    ],
    legend: [
      { q: 4, label: "満たす" },
      { q: 2, label: "一部満たす" },
      { q: 0, label: "満たさない" },
    ],
  },
};

// ハーベイボール（直径 d、中心 cx,cy）。q=4 塗り円／q=0 輪郭のみ／q=1..3 輪郭＋pie（12時から時計回りに q/4）
function harveyBall(ctx, slide, cx, cy, q, d = mm(4.6)) {
  const lvl = Math.min(4, Math.max(0, Math.round(Number(q) || 0)));
  const box = { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
  if (lvl === 4) {
    slide.addShape(ctx.pptx.ShapeType.ellipse, { ...box, fill: { color: ctx.colors.INK } });
    return;
  }
  if (lvl > 0) {
    // OOXML の角度は 3時起点・時計回り。12時=270° から q/4 周ぶん
    const end = [null, 0, 90, 180][lvl];
    slide.addShape(ctx.pptx.ShapeType.pie, { ...box, angleRange: [270, end], fill: { color: ctx.colors.INK } });
  }
  slide.addShape(ctx.pptx.ShapeType.ellipse, { ...box, fill: { type: "none" }, line: { color: ctx.colors.INK, width: 0.75 } });
}

// 凡例（右寄せ・玉＋8pt）。戻り値は下端 y
function legend(ctx, slide, items, xRight, y) {
  const d = mm(4.6), gapIn = mm(1.5), gapOut = mm(6), lineH = 0.2;
  const widths = items.map((it) => d + gapIn + ctx.fwLen(it.label) * 0.118 + 0.04);
  let x = xRight - widths.reduce((a, b) => a + b, 0) - gapOut * (items.length - 1);
  items.forEach((it, i) => {
    harveyBall(ctx, slide, x + d / 2, y + lineH / 2, it.q, d);
    addText(ctx, slide, it.label, x + d + gapIn, y, widths[i] - d - gapIn, lineH, { fontSize: 8, valign: "middle" });
    x += widths[i] + gapOut;
  });
  return y + lineH;
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const headers = p.headers || ["評価軸", "ラベル 1案", "ラベル 2案", "判断の理由"];
  const rows = p.rows || [];
  const legendItems = p.legend || [{ q: 4, label: "満たす" }, { q: 2, label: "一部満たす" }, { q: 0, label: "満たさない" }];

  const x0 = FRAME.M, w = contentW();
  const legendBottom = legend(ctx, slide, legendItems, x0 + w, FRAME.contentTop + 0.04);

  // 表（行高を明示して玉の重ね位置を確定させる）
  const tableY = legendBottom + mm(5);
  const h = FRAME.contentBottom - tableY;
  const headH = 0.4;
  const n = rows.length || 1;
  const rh = Math.max(0.36, (h - headH) / n);
  const nBall = Math.max(1, headers.length - 2);
  const reasonMm = Math.max(40, w / mm(1) - 50 - 34 * nBall);
  const cols = [{ w: 50, axis: true }, ...Array.from({ length: nBall }, () => ({ w: 34, align: "center" })), { w: reasonMm }];
  const sumW = cols.reduce((a, c) => a + c.w, 0);
  const colW = cols.map((c) => (w * c.w) / sumW);
  const bodyRows = rows.map((r) => [
    r.axis ?? "",
    ...Array.from({ length: nBall }, () => ""),
    Array.isArray(r.bullets) && r.bullets.length ? { bullets: r.bullets } : (Array.isArray(r.text) ? { bullets: r.text } : (r.text ?? "")),
  ]);
  table(ctx, slide, { headers, rows: bodyRows, cols, x: x0, y: tableY, w, h, fontSize: 10, headSize: 11.5, rowH: [headH, ...rows.map(() => rh)] });

  // 玉（セルの中央）
  rows.forEach((r, i) => {
    const cy = tableY + headH + rh * i + rh / 2;
    (r.values || []).slice(0, nBall).forEach((q, ci) => {
      const cx = x0 + colW.slice(0, ci + 1).reduce((a, b) => a + b, 0) + colW[ci + 1] / 2;
      harveyBall(ctx, slide, cx, cy, q);
    });
  });
}
