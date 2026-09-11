// 型プラグイン共通ヘルパー（HTML側）。_helpers.mjs（PPTX側）と対になるモジュールで、
// html(ctx, item, n) 関数群が共通で使う小さな部品を提供する。
//
// このファイルは元リポジトリの pipeline-archived タグに存在せず（27型の archetypes/*.mjs は
// 静的 import * as H from "./_html.mjs" を持つが、_html.mjs 自体はアーカイブ時点で欠落していた）、
// html-css/consulting-slide-system.css 側にはこのファイルが出すべき `.parts` 名前空間の
// クラス定義（.axh/.colh/.tri/.two/.legend/.hb/.pil/.chev/.agd/.parts-cover 等）が既に
// 完成した形で残っていたため、そのクラス名・構造に合わせて本ファイルを復元した。
// 各関数のシグネチャは呼び出し側（archetypes/*.mjs 全27ファイル）の実際の呼び出しパターンから
// 逆算している。pptx() 側の出力（export_spec_to_editable_pptx.mjs + _helpers.mjs）は本ファイルに
// 依存せず完全に独立しているため、ここが多少の解釈差を含んでいても編集可能PPTXの内容には影響しない。

// mm → px 換算（.slide 系アーキタイプの版面は 1600×900px = 338.67×190.5mm 相当）。
// _helpers.mjs の mm()（PPTX 側、in 換算）と対になる HTML 側の単位変換。
const PX_PER_MM = 1600 / 338.67;
export function px(v) {
  return Math.round(Number(v) * PX_PER_MM);
}

// 数値の桁区切りフォーマット（1,234 のような表示）。非数値はそのまま文字列化。
export function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(v ?? "");
}

// SVG <text>。opts: {size, fill, bold, cls, anchor}
export function svgText(e, x, y, text, opts = {}) {
  const { size = 14, fill, bold, cls, anchor = "start" } = opts;
  const style = [`font-size:${size}px`, fill ? `fill:${fill}` : "", bold ? "font-weight:700" : ""]
    .filter(Boolean)
    .join(";");
  const clsAttr = cls ? ` class="${cls}"` : "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" style="${style}"${clsAttr}>${e(text)}</text>`;
}

// 軸見出し（.parts .axh）: 左に見出し、右に単位、下に太罫（CSSが罫を持つ）。
export function axh(e, title, unit) {
  return `<div class="axh">${e(title || "")}${unit ? `<span class="u">${e(unit)}</span>` : ""}</div>`;
}

// カラム見出し（.parts .colh）。
export function colh(e, text) {
  return `<div class="colh">${e(text || "")}</div>`;
}

// 前提→帰結の三角コネクタ（.parts .tri）。中身なし・CSSのborder三角形。
export function tri() {
  return `<div class="tri"></div>`;
}

// 書式付き箇条書き（.parts .two ul 等、既存CSSの ul/li にそのまま乗る）。
export function ul(e, items, cls) {
  const list = (items || []).filter((it) => it != null && it !== "");
  if (!list.length) return "";
  return `<ul${cls ? ` class="${cls}"` : ""}>${list.map((it) => `<li>${e(it)}</li>`).join("")}</ul>`;
}

// 改行を <br> に変換したうえでエスケープ。
export function nl2br(e, text) {
  return e(text || "").replaceAll("\n", "<br>");
}

// 凡例（.parts .legend）。items: {label, color?} | {label, cls?}（.li-a/.li-b 等の既定スウォッチ）
// | {label, html?}（ハーベイボール等、独自の丸マークをそのまま埋め込む）。
export function legend(e, items, opts = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  const styleAttr = opts.style ? ` style="${opts.style}"` : opts.align === "left" ? ` style="justify-content:flex-start"` : "";
  const swatch = (it) => {
    if (it.html) return it.html;
    if (it.cls) return `<i class="${it.cls}"></i>`;
    return `<i style="background:${it.color || "var(--ink)"}"></i>`;
  };
  return `<div class="legend"${styleAttr}>${list.map((it) => `<span>${swatch(it)}${e(it.label || "")}</span>`).join("")}</div>`;
}

// ハーベイボール（.parts .hb.q0〜q4）。q は 0〜1 の充足率、または 0〜4 の整数のどちらでも受け付ける。
export function hb(q) {
  let n = Number(q);
  if (!Number.isFinite(n)) n = 0;
  const level = Math.max(0, Math.min(4, Math.round(n <= 1 ? n * 4 : n)));
  return `<span class="hb q${level}"><i></i></span>`;
}

// 表セルの太字判定／描画。セルは平文字列、`**text**`（太字マーカー）、または
// `_helpers.mjs#table()`（PPTX側）と同じ {text?, bullets?:[], bold?} 形のオブジェクトを取る
// （archetypes/axis_table.mjs の doc コメント「セルは文字列か {text|bullets:[], bold}」が正）。
// object cellをプレーン文字列としてString()に渡すと "[object Object]" が出力される事故があった
// （axis_table の自前example自体がbullets付きセルを使っていて、27型visual検証で発見）。
function isBoldMarked(s) {
  return s.length > 4 && s.startsWith("**") && s.endsWith("**");
}
export function isBold(v) {
  if (v && typeof v === "object") return !!v.bold;
  return isBoldMarked(String(v ?? ""));
}
export function cell(e, v) {
  if (v && typeof v === "object") {
    if (Array.isArray(v.bullets) && v.bullets.length) return ul(e, v.bullets);
    return e(String(v.text ?? ""));
  }
  const s = String(v ?? "");
  return isBoldMarked(s) ? e(s.slice(2, -2)) : e(s);
}

// ラベル群の重なり回避（例: シナリオ線の終点ラベルy座標）。昇順に並べ、最小間隔 minGap を
// 確保しながら詰め、range を超えたらブロックごと押し戻す。入力順で結果を返す。
export function spread(values, minGap = 20, rangeMin = -Infinity, rangeMax = Infinity) {
  const withIndex = (values || []).map((v, i) => [Number(v) || 0, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array((values || []).length);
  let prev = -Infinity;
  for (const [v, i] of withIndex) {
    const y = Math.max(v, prev + minGap);
    out[i] = y;
    prev = y;
  }
  if (!out.length) return out;
  const overBottom = Math.max(0, Math.max(...out) - rangeMax);
  const overTop = Math.max(0, rangeMin - Math.min(...out));
  const shift = overBottom > 0 ? -overBottom : overTop > 0 ? overTop : 0;
  return shift ? out.map((y) => y + shift) : out;
}

// 型モジュールの html() が返す本体を、他の型と同じスライド外枠（キッカー・タイトル・出典行）に
// 収める。中身は .parts（consulting-slide-system.css の .parts 名前空間）でラップする。
export function wrap(ctx, item, n, inner, opts = {}) {
  const cls = opts.center ? "parts center" : "parts";
  // slide--parts: .slide-inner > .content の flex/min-height を有効にする（.parts の flex:1 な
  // 子要素が正しく版面いっぱいに広がる／必要なら縮むための前提。consulting-slide-system.css 参照）。
  const className = ["slide--parts", opts.className].filter(Boolean).join(" ");
  return ctx.shell(item, n, `<div class="${cls}">${inner}</div>`, { ...opts, className });
}

// 表紙・章扉・裏表紙の外枠（.parts-cover。h2.title は使わず、型ごとに .big/.cno/.cbig 等で組む）。
// kind: "front"（表紙）| "chap"（章扉）| "back"（裏表紙）。
// slide--parts-cover: .slide-inner を3行グリッド（kicker/content/footer）にする専用クラス
// （既定の4行グリッドのままだと子要素数が合わず出典行が版面中央に浮く）。
export function coverShell(ctx, item, n, inner, kind) {
  const e = ctx.esc;
  const extra = kind === "back" ? " back" : kind === "chap" ? " chap" : "";
  return `<section class="slide slide--parts-cover">
  <div class="slide-inner">
    <div class="kicker">${e(item.kicker || item.template)}</div>
    <div class="parts-cover${extra}">${inner}</div>
    ${ctx.footer(item, n)}
  </div>
</section>`;
}
