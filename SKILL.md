---
name: consulting-pptx-skill
description: スライド設計規約 slide-rules.md（実務レビュー由来・約80項目の正典）を核に、経営会議品質のスライドを作るスキル。Lane A（自由記述HTML、速い）とLane B（Ghost Deck→Slide IR→編集可能PPTX、Mechanical/Visual/Fresh-eye QAを一通り通す厳格ルート）の2系統を持つ。作成前に規約を読み、HTMLパーツ集（基本27＋追加35の62型）から該当パーツをコピーして組む、または`pipeline/`のSlide IRパイプラインでPPTXまで生成し、規約の範囲で型に囚われず調整し、機械チェック FAIL 0 で仕上げる。型カタログはレイアウトの発想帳であり、合わせる対象ではない。トリガー例:「コンサル品質のスライドを作って」「規約に沿ったデッキで」「型カタログから選んで」「編集可能なPPTXで」。
---

# コンサル型スライド作成スキル

主軸は `references/slide-rules.md`（実務のレビュー指摘を1行ずつ蓄積した約80項目の規約）。作成前に全文を読み、
Lane A（下の手順1〜9・自由記述HTML）でたたき台を組むか、Lane B（`pipeline/`・Ghost Deck→Slide IR→編集可能PPTX、
「PowerPoint（.pptx）が要るとき」節を参照）でSlide IRから一気通貫に生成する。規約の範囲で調整し、機械チェック
FAIL 0 と目視で仕上げる。パーツ集と型カタログは規約を効率よく満たす道具であり、**スライドを型に合わせるのでは
なく、型をストーリーに合わせて選び、合わなければ捨てて自由に組む。**

成果物は Lane A なら HTML（16:9・1 section = 1スライド）と、Chrome で印刷した PDF。Lane B ならそれに加えて
編集可能PPTX（`pptxgenjs`書き出し、text/shape/table/chartがPowerPoint上でネイティブ編集可能）。
どちらを使うかは要件次第——「PDFで十分」「型カタログの見せ方をそのまま自由に崩したい」ならLane A、
「PowerPoint納品が必須」「Ghost Deck段階でストーリーを確定してから厳格にQAを通したい」ならLane B。

## ファイルと読むタイミング

| ファイル | 中身 | 読む・使うタイミング |
| --- | --- | --- |
| `references/slide-rules.md` | 規約の正典（約80項目） | **必読。作成前に全文** |
| `references/archetype-catalog.md` | 62型の一覧（型ID・型名・使いどころ・どのパーツ集の何番か） | ストーリーラインの各行に見せ方を書くとき |
| `references/content-review-prompt.md` | フレッシュアイ・レビューの指示文 | 機械チェック通過後、納品前 |
| `references/ai-smell-lexicon.md` | AI臭ワード・言い回しのリスト | 文章の仕上げ時 |
| `templates/freeform_parts_16x9.html` | 基本パーツ集 27（表紙・全体マップ・矢羽・前提→帰結・軸のある表・主張パネル・評価表・分布図など）。まずここから | 手順3 |
| `templates/freeform_parts_more_16x9.html` | 追加パーツ集 35（エグゼクティブサマリー・積み上げ棒・ブリッジ・散布図・比較表・マトリクス・ロードマップ・ガントなど）。基本で足りないとき | 手順3 |
| `assets/SlideCatalog_16x9.pdf` | 両パーツ集を印刷した62ページ（P.1〜27 基本、P.28〜62 追加） | 型を目で探すとき |
| `scripts/new_deck.py` | パーツ番号を並べて1本のHTMLを生成 | 手順3 |
| `scripts/check_deck.py` | 規約の機械チェック（HTML は標準ライブラリのみ） | 手順6 |
| `scripts/check_layout.mjs` | 重なり・はみ出しの実レンダリング検査（`npm run setup` で playwright を入れる） | 手順7 |
| `assets/SuperTemplate_62type.pptx` | 62型のPPTX見本帳（全スライド編集可能） | PPTX が要るとき |
| `pipeline/ghost-deck/schema.json` | Ghost Deckのスキーマ（slide_number/role/action_title/key_message/evidence_needed/transition） | Lane B・手順1 |
| `references/storyline-review-prompt.md` | Storyline Reviewの指示文（action_titleだけの通し読み） | Lane B・手順2 |
| `pipeline/slide-spec/schema.json` | Slide IRのスキーマ（62型対応。claims/sourcesで出典管理） | Lane B・手順3 |
| `pipeline/scripts/run_mechanical_gate.mjs` | schema/content/numerical/geometryを1本のJSONに統合したMechanical Quality Gate | Lane B・手順4 |
| `references/visual-qa-prompt.md` | Visual QAの指示文（画像を見た見た目のレビュー） | Lane B・手順6 |
| `references/rule-index.json` | slide-rules.md各項目のID・カテゴリ索引（QA/Reviewerが指摘を紐付ける） | 随時 |
| `pipeline/scripts/run_pipeline.mjs` | CLIオーケストレーター（--mode fast/standard/rigorous） | Lane B 全体 |

## 規約の要点（入口。全文は必ず読む）

- **タイトル**: 結論を書く。1行が基本、長ければ意味の切れ目で2行（縮小して詰めない）。です/ます禁止。タイトルだけ通し読みして1本のストーリーになること
- **レイアウト**: 1スライド=1メッセージ。左=事実・図、右=意味合い。下部の「POINT」帯禁止
- **表**: 行=項目・列=観点の「軸のある表」。ヘッダーは本文より大きく太字・塗りなし。最終行の下に罫線なし
- **装飾**: 角丸禁止。塗りボックスに枠線なし。色分けするなら同一スライドに凡例
- **図**: 推移・構成比・分布はグラフで描く。表に流し込んで済ませない（§5.11）
- **数**: タイトルに書いた数と本文の連番を一致させる（§2.9）。ページの中身の個数はタイトルに書かない（§2.4）
- **文章**: 1資料1用語。略語は初出でフル表記。ブレット語尾は階層内で統一

## 手順

1. **作る前に定義する**: 目的・成果物の定義・スコープ IN/OUT を3〜5行で先に合意する。
2. **ストーリーライン**（1枚1行のタイトル列）を書き、各行に見せ方を併記する（図／表／矢羽／2カラム／数値カード）。推移・構成比・分布・相関は必ず図。見せ方に迷う行は `references/archetype-catalog.md` を見る。
   - 章扉は b27（アジェンダ再掲型）。section は `s chap` でページ番号に数えない（§4.45）。10枚前後なら章扉は要らない。
   - 表の列幅: 列の内容が同種（時点・案・部門）なら `<table class="eq">` で等幅にし、最後の列だけに余白を吸わせない。説明・ブレットの列があるときだけ、その列に余白を渡す。
   - 枚数に上限があるときの削る順: 章扉・目次 → 全体マップと重複する本文 → 補足・付録。表紙・全体マップ・結論ページ・裏表紙は残す。リスクの列挙は対応策と同じ1枚にする（§4.29）。
3. **たたき台を生成する**:
   ```bash
   python3 scripts/new_deck.py --list                                   # 番号と型名（b01〜b27 基本／m01〜m35 追加）
   python3 scripts/new_deck.py --parts b01,b02,m05,b06,b09,b10 --title "資料名" -o mydeck.html
   ```
   両パーツ集のCSS結合・見出し様式の統一・ページ番号の振り直しはスクリプトが行う。手でコピーして組まない。生成後、プレースホルダー（`Text N` / `ラベル N` / `YYYY`）を実物に差し替える。
4. **グラフが要るページは、表パーツに流し込まず自分で描く。**
5. **調整**: 表を2枚に割る、右カラムを帰結形に書き直す、粒度の揃わない並列を書き直す。1枚ごとに「この型のままでよいか」を疑う。受けた指摘は slide-rules.md に1行追記する。
6. `python3 scripts/check_deck.py mydeck.html` → FAIL 0（表紙・裏表紙・章扉の「タイトル空」WARN は許容）。出力されるタイトル一覧を通し読みする。
7. `node scripts/check_layout.mjs mydeck.html` → OK（playwright が別の場所にあるなら `PLAYWRIGHT_MODULE_DIR` で指す）。
8. **フレッシュアイ・レビュー**: `references/content-review-prompt.md` の指示文を、作り方を伏せた別のエージェントに渡してデッキのファイルを読ませる。指摘を採否表（採用／不採用／保留＋理由）にし、採用分だけ直して手順6・7を再実行する。
9. **PDF 化して全ページ目視する。** 機械チェックは重なり・はみ出し・規約違反しか見ない。棒が潰れる、図が空になる、下半分が空く、泣き別れ、左右の下端不揃いは目視でしか分からない。パーツのCSSは自分のデッキ側で直してよい（直したら templates/ にも反映する）。
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
     --no-pdf-header-footer --print-to-pdf=mydeck.pdf mydeck.html
   ```

## PowerPoint（.pptx）が要るとき — Lane B（Slide IR駆動パイプライン）

上の手順（Lane A・自由記述HTML）は速いが、成果物はHTML/PDFまで。**編集可能PPTXが要る、または
Ghost Deck→Storyline Review→機械的な数値検証→Fresh-eyeレビューまで一通り厳格に通したいときは
`pipeline/` の Slide IR駆動パイプラインを使う。** 中身は同じ規約（`references/slide-rules.md`）・
同じ62型カタログに対応するが、データはHTMLではなく構造化JSON（Slide IR）で持つため、
`pptxgenjs` でPowerPoint上ネイティブ編集可能な図形・表・テキストとして書き出せる
（複雑な図だけSVG/画像フォールバック。ログに残す）。HTML/PDFプレビューも同じJSONから出るので、
Lane A・Lane Bどちらの成果物も併存できる——一方を選んだらもう一方が使えなくなる関係ではない。

### 生成フロー

```
User Brief → Requirements Normalization → Ghost Deck → Storyline Review →
Slide Specification (Slide IR) → Layout Selection → Slide Generation →
Mechanical Quality Gate → Visual Rendering → Visual QA → Fresh-eye Content Review →
Targeted Revision → Regression QA → Editable PPTX → PDF Preview
```

**レイアウトを先に描かない。** 必ず Storyline（Ghost Deck）→ Slide Specification → Rendering の順。

1. **Ghost Deck を作る**（`pipeline/ghost-deck/schema.json`）。スライドごとに
   `slide_number/role/action_title/key_message/evidence_needed/transition_from_previous/transition_to_next`
   だけを書く。まだ図・表・型は決めない。`node pipeline/scripts/validate_ghost_deck.mjs <gd.json>` で構造チェック。
2. **Storyline Review**（`references/storyline-review-prompt.md`）: `action_title` だけを通し読みして、
   結論先行・前ページとの接続・重複・論理ジャンプ・So What・Issue→Analysis→Implication→Recommendationを
   構造化JSONで確認する。レイアウトを組んだ後にストーリーを直す設計にしない。
3. **Slide Specification（Slide IR）に展開する**（`pipeline/slide-spec/schema.json`。62型対応、
   `references/archetype-catalog.md` と1:1）。数値の主張には `claims:[{text, sourceId}]` を付け、
   ユーザーから与えられていない数字は `basis:"assumption"|"illustrative"|"example"` を明示する
   （`sources:[{id,label}]` に出典を登録）。`node pipeline/scripts/validate_spec.mjs <spec.json>`。
4. **Mechanical Quality Gate**（`pipeline/scripts/run_mechanical_gate.mjs <spec.json> [rendered.html]`）:
   schema・placeholder/TODO/lorem/空chart・数値整合（waterfall/CAGR/%合計/小計）・
   （レンダリング後は）重なり・はみ出し・フォント・出典欠落を1本のJSONで判定する。Critical 1件でも次工程に進めない。
5. **Visual Rendering**: `node pipeline/scripts/render_spec_to_html.mjs <spec.json> <out.html>` →
   `node pipeline/scripts/render_html_screenshots.mjs <out.html> <dir>` でページごとのPNG化。
6. **Visual QA**（`references/visual-qa-prompt.md`）: 画像を見て一目で分かるか・余白・整列・密度・
   チャート/表の読みやすさを確認する。機械チェックが拾わない「機械的に正常だが見た目が悪い」を担当する。
7. **Fresh-eye Content Review**（`references/content-review-prompt.md`）: 作り方・型名・自己評価を伏せて
   完成物とユーザー要求だけを渡す。severity付き構造化JSONで返す。
8. **採否判定**: `node pipeline/scripts/log_review_disposition.mjs <dispositions.json> <log.json>`。
   Criticalは合理的理由なく却下しない。
9. **Targeted Revision**: `node pipeline/scripts/apply_targeted_revision.mjs <spec.json> <patches.json> -o <out.json>`。
   採用分だけをSlide IRの該当フィールドにパッチし、影響範囲（該当ページ＋前後1枚）だけを返す。
   デッキ全体を作り直さない。
10. **Regression QA**: 影響範囲に対して Mechanical Quality Gate を再実行する。
11. **Editable PPTX**: `node pipeline/scripts/export_spec_to_editable_pptx.mjs <spec.json> <out.pptx>`。
    text/shape/table/chartはすべてPowerPoint上でネイティブ編集可能。
12. **PDF Preview**: `node pipeline/scripts/html_to_pdf.mjs <out.html> <out.pdf>`。

### CLI モード

`node pipeline/scripts/run_pipeline.mjs --mode fast|standard|rigorous --ghost-deck <gd.json> --spec <spec.json> --out-dir <dir>`

| mode | フロー |
|---|---|
| fast | Ghost Deck検証 → Mechanical QA → PPTX |
| standard（既定） | Ghost Deck検証 → Mechanical QA → Visual QA → PPTX |
| rigorous | Ghost Deck検証 → Storyline Review → Mechanical QA → Visual QA → Fresh-eye Review → Revision → Regression QA → PPTX |

このスクリプトは決定的な工程だけを自動実行し、LLM判断が要る工程（Storyline Review / Visual QA /
Fresh-eye Review / Targeted Revision）では `nextAction` に「何をどのプロンプトファイルでどう実行し、
結果をどこに書くか」を返して止まる。Claude はその指示に従って該当レビューを実行し、結果を書き、
このスクリプトを再実行して続きから進める（決定的チェックはコード、意味判断はLLM、という責任分界を徹底するため）。

### ルールの追跡

`references/rule-index.json` が slide-rules.md の各項目（§N.M）に安定したID（`TITLE-004`等）と
カテゴリ（storyline/title/composition/typography/chart/table/numerical/language/source/visual/forbidden）
を割り当てる。slide-rules.md 自体の番号・本文は変えない（このファイルはポインタ表）。
QA/Reviewerの指摘には可能な範囲でこのIDを添える。

### 再現する失敗の記録

`node pipeline/scripts/log_experience.mjs <candidate.json> <experience-log.json>`。同じ
`pattern` が3回再現したら `eligibleForPromotion:true` を返す——それでもslide-rules.mdへの追記は
人手/Claudeの判断（末尾追記）で行い、自動では追記しない。

### レガシー参照

`assets/SuperTemplate_62type.pptx`（型カタログのPPTX見本帳。手でコピーして組みたいときの参照用）。

## 本スキル使用の注釈

「本資料は consulting-pptx-skill（github.com/carnot-tech/consulting-pptx-skill）で作成」の一文は裏表紙（b10）の左下に既定で入っている。他のページには入れない。裏表紙を使わないデッキでは最終ページの出典行に足す。

## 色と書体

両パーツ集の既定は同じ暖色系（生成りの地・濃茶の文字・茶のアクセント。本文ゴシック・見出し明朝）。トークンは各ファイルの `<style>` 冒頭 `:root`。片方を変えたらもう片方も揃える。ネイビー系の値はコメントで同梱。意味を持つ色（✕の赤など）は変えない。2系列の区別はメインカラー×グレーの2色に抑える。製品UIのスクリーンショットは無加工。
