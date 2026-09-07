// パーツ02: 全体マップ（P.2 必須。各行に → P.n 参照）
import { FRAME, contentW, contentH, rowsList, mm } from "./_helpers.mjs";

export const id = "overview_map";
export const name = "全体マップ";
export const part = 2;
export const doc = "parts.rows: [{label, text, ref}] 3〜6行。label は明朝の見出し語、text は1〜2行の要約、ref は「→ P.n」";

export const example = {
  template: id,
  kicker: "パーツ02｜全体マップ",
  title: name,
  source: "出典：Source 1",
  parts: {
    rows: [
      { label: "ラベル 1", text: "Text 1", ref: "→ P.3" },
      { label: "ラベル 2", text: "Text 2", ref: "→ P.4" },
      { label: "ラベル 3", text: "Text 3", ref: "→ P.5" },
      { label: "ラベル 4", text: "Text 4", ref: "→ P.6" },
    ],
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const rows = (item.parts && item.parts.rows) || [];
  const y = FRAME.contentTop;
  rowsList(ctx, slide, rows, FRAME.M, y, contentW(), contentH(), { labelW: mm(44), labelSize: 11.5, fontSize: 10.5 });
}
