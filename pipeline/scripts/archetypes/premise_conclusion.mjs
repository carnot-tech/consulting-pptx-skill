// パーツ06: 前提→帰結の2カラム（左=事実の表・中央三角・右=「だから、〜」のブレット）
import { FRAME, contentW, contentH, colHeader, addBullets, mm } from "./_helpers.mjs";

// 右向き三角（.tri: 幅 6mm × 高さ 10mm）。上向き三角の箱 10mm×6mm を 90° 回すと、見た目が幅 6mm・高さ 10mm になる。中心 (cx, cy)
function triRight(ctx, slide, cx, cy, w = mm(6), h = mm(10)) {
  const c = ctx.colors.CYAN;
  slide.addShape(ctx.pptx.ShapeType.triangle, { x: cx - h / 2, y: cy - w / 2, w: h, h: w, rotate: 90, fill: { color: c }, line: { color: c, width: 0 } });
}

export const id = "premise_conclusion";
export const name = "前提→帰結の2カラム";
export const part = 6;
export const doc = "parts.left: {header, rows:[[軸, 本文], ...]}（見出し行なしの2列表。軸は時点や区分）／parts.right: {header:「だから、〜」, bullets:[]}（語尾は階層内で統一）";

export const example = {
  template: id,
  kicker: "パーツ06｜前提→帰結の2カラム",
  title: name,
  source: "出典：Source 1",
  parts: {
    left: {
      header: "Text 1の推移（事実）",
      rows: [
        ["YYYY年M月", "Text 1"],
        ["YYYY年M月", "Text 2"],
        ["YYYY年M月〜", "Text 3"],
      ],
    },
    right: {
      header: "だから、Text 2はこう変わる",
      bullets: ["Text 4（語尾は階層内で統一）", "Text 5", "Text 6"],
    },
  },
};

// 見出し行なしの表（td だけ）: 行間は細罫・最終行は罫なし・軸列は明朝アクセント＋右の濃色太罫（td.ax）
function plainTable(ctx, slide, { rows, colW, x, y, h, fontSize = 10 }) {
  const n = rows.length || 1;
  const rh = h / n;
  const none = { type: "none", pt: 0, color: ctx.colors.WHITE };
  const ink = { type: "solid", pt: 1.4, color: ctx.colors.INK };
  const hair = { type: "solid", pt: 0.6, color: ctx.colors.HAIR };
  const body = rows.map((r, ri) =>
    r.map((cell, ci) => {
      const c = typeof cell === "object" && cell !== null ? cell : { text: cell };
      const last = ri === n - 1;
      const axis = ci === 0;
      return {
        text: String(c.text ?? ""),
        options: {
          fontSize: c.fontSize || (axis ? 11 : fontSize), fontFace: axis ? ctx.FONT_SERIF : ctx.FONT,
          color: axis ? ctx.colors.BLUE : ctx.colors.INK, bold: !!(c.bold || axis),
          valign: "middle", align: "left", margin: [0.06, 0.06, 0.06, 0.1],
          border: [none, axis ? ink : none, last ? none : hair, none],
        },
      };
    }),
  );
  slide.addTable(body, { x, y, w: colW.reduce((a, b) => a + b, 0), colW, rowH: rows.map(() => rh), fontFace: ctx.FONT, autoPage: false });
}

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const left = p.left || {}, right = p.right || {};
  // .two: 1.5fr | 三角 6mm | 1fr、gap 6mm
  const gap = mm(6), tri = mm(6);
  const rest = contentW() - tri - gap * 2;
  const leftW = (rest * 1.5) / 2.5, rightW = rest - leftW;
  const lx = FRAME.M, rx = FRAME.M + leftW + gap + tri + gap;
  const top = FRAME.contentTop, bottom = FRAME.contentTop + contentH();

  // 左: 見出し＋表
  let y = colHeader(ctx, slide, left.header || "", lx, top, leftW);
  const rows = left.rows || [];
  if (rows.length) {
    const axisW = mm(34);
    plainTable(ctx, slide, { rows, colW: [axisW, leftW - axisW], x: lx, y, h: bottom - y, fontSize: 10 });
  }

  // 中央: 「だから」の三角（版面の縦中央）
  triRight(ctx, slide, lx + leftW + gap + tri / 2, (top + bottom) / 2, tri, mm(10));

  // 右: 見出し＋ブレット（残り高さの縦中央）
  const by = colHeader(ctx, slide, right.header || "", rx, top, rightW);
  addBullets(ctx, slide, right.bullets || [], rx, by, rightW, bottom - by, { fontSize: 10, valign: "middle", paraSpaceAfter: 13 });
}
