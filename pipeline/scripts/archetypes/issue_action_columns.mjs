// パーツ26: 課題と打ち手の2カラム（左=いま起きている課題・右=これから打つ手。左右で行を対応させる）
import { FRAME, contentW, contentH, colHeader, rowsList, mm } from "./_helpers.mjs";

export const id = "issue_action_columns";
export const name = "課題と打ち手の2カラム";
export const part = 26;
export const doc = "parts.rows: [{issue:{label, text}, action:{label, text}}] 3〜5行（左右で行を対応させる。段階ビルドアップなら action を省いた1枚を先に出す）／parts.headers: {issue, action}（既定「いま起きている課題」「これから打つ手」）";

export const example = {
  template: id,
  kicker: "パーツ26｜課題と打ち手の2カラム",
  title: name,
  source: "出典：Source 1",
  parts: {
    headers: { issue: "いま起きている課題", action: "これから打つ手" },
    rows: [
      { issue: { label: "ラベル 1", text: "Text 1" }, action: { label: "ラベル 4", text: "Text 4" } },
      { issue: { label: "ラベル 2", text: "Text 2" }, action: { label: "ラベル 5", text: "Text 5" } },
      { issue: { label: "ラベル 3", text: "Text 3" }, action: { label: "ラベル 6", text: "Text 6" } },
    ],
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const headers = { issue: "いま起きている課題", action: "これから打つ手", ...(p.headers || {}) };
  const rows = p.rows || [];
  const gap = mm(4);                                   // .grid.g2 gap 4mm
  const colW = (contentW() - gap) / 2;
  const top = FRAME.contentTop, bottom = FRAME.contentTop + contentH();
  const issues = rows.map((r) => r.issue || {}).filter((r) => r.label || r.text);
  const actions = rows.map((r) => r.action || {}).filter((r) => r.label || r.text);

  [[headers.issue, issues, FRAME.M], [headers.action, actions, FRAME.M + colW + gap]].forEach(([head, list, x]) => {
    // .axh: 明朝 11.5pt 濃色＋濃色の太下罫、下に 3.5mm
    const y = colHeader(ctx, slide, head, x, top, colW, { color: ctx.colors.INK, gap: mm(3.5) });
    if (!list.length) return;
    // .rows: 44mm の明朝ラベル｜本文、行間は細罫（先頭行に罫なし）、行は残り高さを等分
    rowsList(ctx, slide, list, x, y, colW, bottom - y, { labelW: mm(44), gap: mm(6), labelSize: 11.5, fontSize: 10.5 });
  });
}
