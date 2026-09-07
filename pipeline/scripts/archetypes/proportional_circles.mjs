// パーツ22: 比例円の対比（2時点・2状態の規模差を面積で見せる。3つ以上なら棒にする）
// HTML: .axh ＋ SVG(900×300): 円（NAVY r120 → BLUE r82、面積∝値）、円内に明朝の大型数値＋淡色の説明、円の上に太字の見出し。
// 円は図形（ellipse）。面積比例なので半径 = rMax × √(size / sizeMax)。
import { FRAME, contentW, colHeader, addText } from "./_helpers.mjs";

// 軸見出し（.axh）: 明朝 INK ＋ 右端に単位（8.5pt MUTED）＋ 濃色の太下罫。
// colHeader の unit は箱の上端が 1.72in でタイトル直下の「サブタイトル疑い」WARN に掛かるため、単位だけ少し下げて自前で置く
function axisHeader(ctx, slide, title, unit, x, y, w) {
  const next = colHeader(ctx, slide, title, x, y, w, { color: ctx.colors.INK });
  if (unit) addText(ctx, slide, unit, x + w - 2.4, y + 0.06, 2.4, 0.26, { fontSize: 8.5, color: ctx.colors.MUTED, align: "right", valign: "bottom" });
  return next;
}


export const id = "proportional_circles";
export const name = "比例円の対比";
export const part = 22;
export const doc =
  "parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.items: [{heading, value, size, label}] 左から順。heading=円の上の見出し（「現在（YYYY年）」）、" +
  "value=円内の大型数値（表示文字列）、size=面積の元になる数値、label=数値の下の説明。2件推奨（3件以上は棒グラフを検討）";

export const example = {
  template: id,
  kicker: "パーツ22｜比例円の対比",
  title: name,
  source: "出典：Source 1。円の面積は割合に比例",
  parts: {
    axisTitle: "Text 1に占める割合",
    unit: "％、YYYY年 / YYYY年",
    items: [
      { heading: "現在（YYYY年）", value: "65%", size: 65, label: "Text 2が占める割合" },
      { heading: "N年後（YYYY年）", value: "30%", size: 30, label: "Text 3が占める割合" },
    ],
  },
};

export function pptx(ctx, item, pageNum) {
  const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false });
  const p = item.parts || {};
  const C = ctx.colors;
  const items = (p.items || []).filter(Boolean);

  const y0 = axisHeader(ctx, slide, p.axisTitle || "", p.unit, FRAME.M, FRAME.contentTop, contentW());

  // SVG(900×300, meet) の幾何
  const s = contentW() / 900;
  const svgH = 300 * s;
  const availH = FRAME.contentBottom - y0;
  const top = y0 + Math.max(0, (availH - svgH) / 2);
  const cy = top + 150 * s;
  const rMax = 120 * s;
  const n = items.length || 1;
  const sizes = items.map((it) => Math.max(0, Number(it.size) || 0));
  const sizeMax = Math.max(...sizes, 1e-9);
  const fills = [C.NAVY, C.BLUE, C.CYAN, C.MUTED];
  const subColors = [C.CYAN, C.SOFTBLUE, C.INK, C.WHITE];

  items.forEach((it, i) => {
    // 2件のときは HTML と同じ位置（x=260 / 640）。それ以外は等間隔
    const cx = n === 2 ? FRAME.M + (i === 0 ? 260 : 640) * s : FRAME.M + (contentW() * (i + 0.5)) / n;
    const r = sizes[i] > 0 ? rMax * Math.sqrt(sizes[i] / sizeMax) : rMax * 0.25;
    const k = r / rMax; // 文字の縮尺
    const fill = fills[i % fills.length];
    const sub = subColors[i % subColors.length];

    // 円の上の見出し（太字 12pt INK）
    addText(ctx, slide, it.heading || "", cx - 2.0, top, 4.0, 0.3, { fontSize: 12, bold: true, align: "center", valign: "top" });

    // 円（塗りのみ・枠線なし）
    slide.addShape(ctx.pptx.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: fill }, line: { color: fill, width: 0 } });

    // 円内: 大型数値（明朝太字・白）＋ 説明（淡色）
    const vSize = Math.max(16, Math.round(39 * k));
    const lSize = Math.max(9, Math.round(11 * Math.max(k, 0.8)));
    const vh = (vSize / 72) * 1.35;
    const lh = (lSize / 72) * 1.5;
    const blockH = vh + lh;
    const by = cy - blockH / 2;
    slide.addText(String(it.value ?? ""), {
      x: cx - r, y: by, w: 2 * r, h: vh, fontFace: ctx.FONT_SERIF, fontSize: vSize, bold: true, color: C.WHITE,
      align: "center", valign: "middle", margin: 0, fit: "shrink", breakLine: false,
    });
    if (it.label) addText(ctx, slide, it.label, cx - r, by + vh, 2 * r, lh, { fontSize: lSize, color: sub, align: "center", valign: "top" });
  });
}
