// パーツ09: 軸のある表（行=軸・列=観点。最終行の下は罫線なし）
import { FRAME, contentW, contentH, table } from "./_helpers.mjs";
import * as H from "./_html.mjs";

export const id = "axis_table";
export const name = "軸のある表";
export const part = 9;
export const doc = "parts.headers: 列見出し（先頭が軸）／parts.cols: [{w, axis}] 幅比と軸指定／parts.rows: セルは文字列か {text|bullets:[], bold}";

export const example = {
  template: id,
  kicker: "パーツ09｜軸のある表",
  title: name,
  source: "出典：Source 1",
  parts: {
    headers: ["ラベル 1（軸）", "ラベル 2", "ラベル 3", "ラベル 4"],
    cols: [{ w: 52, axis: true }, { w: 106 }, { w: 70 }, { w: 78 }],
    rows: [
      ["ラベル 5", "Text 1", "ラベル 6", { bullets: ["Text 1", "Text 2"] }],
      ["ラベル 8", "Text 2", "ラベル 9", { bullets: ["Text 3", "Text 4"] }],
      ["ラベル 11", "Text 3", "ラベル 12", { bullets: ["Text 5", "Text 6"] }],
    ],
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  table(ctx, slide, {
    headers: p.headers || [], rows: p.rows || [], cols: p.cols,
    x: FRAME.M, y: FRAME.contentTop, w: contentW(), h: contentH(), fontSize: 10, headSize: 11.5,
  });
}

// HTML プレビュー（パーツ09 table: th 太下罫、軸列 th.ax/td.ax、最終行の下は罫なし。列幅は parts.cols の w 比）
export function html(ctx, item, n) {
  const p = item.parts || {}, e = ctx.esc;
  const headers = p.headers || [];
  const cols = p.cols || headers.map(() => ({}));
  const sum = cols.reduce((a, c) => a + (c.w || 1), 0);
  const isAxis = (ci) => !!(cols[ci] && cols[ci].axis);
  const ths = headers
    .map((h, ci) => `<th${isAxis(ci) ? ' class="ax"' : ""} style="width:${(((cols[ci] && cols[ci].w) || 1) / sum * 100).toFixed(1)}%">${e(h)}</th>`)
    .join("");
  const trs = (p.rows || [])
    .map((r) => `<tr>${r.map((c, ci) => `<td class="${[isAxis(ci) ? "ax" : "", H.isBold(c) ? "b" : ""].filter(Boolean).join(" ")}">${H.cell(e, c)}</td>`).join("")}</tr>`)
    .join("");
  return H.wrap(ctx, item, n, `<table><tr>${ths}</tr>${trs}</table>`);
}
