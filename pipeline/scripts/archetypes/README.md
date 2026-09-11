# 型プラグイン（archetypes）の書き方

自由記述パーツ集 `templates/freeform_parts_16x9.html` の各パーツを、SlideSpec の型として編集可能PPTXで出すための追加モジュール。
1ファイル=1型。`export_spec_to_editable_pptx.mjs` と `render_spec_to_html.mjs` が起動時にこのフォルダを読み、`item.template === id` のスライドを `pptx(ctx, item, pageNum)` に渡す。

## 必須エクスポート
```js
export const id = "axis_table";          // schema.json の template enum に登録済みの id（_ids.json 参照）
export const name = "軸のある表";          // 型名（カタログのタイトル欄に出る）
export const part = 9;                    // パーツ番号（HTML パーツ集の NN）
export const doc = "parts.* の説明";       // AI が実デッキで使うときのフィールド説明
export const example = { template: id, kicker: "パーツ09｜軸のある表", title: name, source: "出典：Source 1", parts: { ... } };
export function pptx(ctx, item, pageNum) { const slide = ctx.addShell(item, pageNum, { titleRule: false, balance: false }); ... }
```
任意: `export function html(ctx, item, n)`（HTMLプレビュー。無ければ汎用レイアウトで代替）。

## ルール
- データはすべて `item.parts` の下に置く（schema で自由形式）。`title` / `kicker` / `source` / `note` は共通フィールド。
- example のプレースホルダーは HTML パーツ集と同じ書き方: 本文 `Text 1`、項目名 `ラベル 1`、見出し `タイトル 1`、数値 `00`、年 `YYYY年`、指標行 `指標名、単位、YYYY〜YYYY年`、出典 `出典：Source 1`。「◯◯」は使わない。
- タイトル欄は型名だけ（見本の主張文は置かない。slide-rules §2.8）。
- 見た目は HTML パーツ集の同じパーツに合わせる（寸法は mm→in、色は `_helpers.mjs` 冒頭の写像表）。
- 規約: 角丸なし／塗りありに枠線なし／最終行・最下部に罫線なし／ブレットは書式（`addBullets`）で直打ちしない／表の軸は太下罫／本文 9pt 以上（表 10pt 以上）。
- 版面いっぱいに組む型は `balance: false`。中身が小さい型だけ既定の縦中央寄せに任せる。
- 出典行は `addFooter` が刷る。型モジュールで描かない。
- チャート（棒・折れ線・散布・バブル・円）は pptxgenjs の `slide.addChart` でネイティブ（編集可能）に。図形で描かない。

## QA
```bash
QA_OUT=generated/parts_qa_<自分の名前> bash scripts/qa_parts.sh <id> [<id> ...]
```
`$QA_OUT/pNN_<id>.png` が自分の出力、`$QA_OUT/ref_NN_<id>.png` が HTML パーツ集の同じパーツ。並べて見比べ、check_deck の FAIL 0 を確認する。
正本 `slide-spec/super_template.json` への反映は `node scripts/build_parts_template.mjs`（全型の example を id 単位で追加／置換）。
