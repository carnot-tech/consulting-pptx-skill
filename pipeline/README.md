# Slide IR パイプライン（Lane B）

`SKILL.md`の「PowerPoint（.pptx）が要るとき — Lane B」の実体。Ghost Deck → Storyline Review →
Slide Specification（Slide IR）→ Mechanical Quality Gate → Visual Rendering → Visual QA →
Fresh-eye Content Review → Targeted Revision → Regression QA → Editable PPTX / PDF
の一気通貫パイプライン。詳しい手順・各ファイルの役割は `SKILL.md` を参照。

## セットアップ

```bash
cd pipeline && npm install && npx playwright install chromium
```

## ディレクトリ

| パス | 役割 |
|---|---|
| `ghost-deck/schema.json` | Ghost Deckのスキーマ |
| `slide-spec/schema.json` | Slide IR（SlideSpec）のスキーマ。62型対応 |
| `html-css/consulting-slide-system.css` | HTMLレンダラー・27型archetypeの共通スタイルシート |
| `scripts/archetypes/*.mjs` | 27型（パーツ1〜27）のHTML/PPTX両対応レンダラー・プラグイン |
| `scripts/validate_ghost_deck.mjs` | Ghost Deckの構造チェック |
| `scripts/validate_spec.mjs` | Slide IRのスキーマ検証 |
| `scripts/check_content_structure.mjs` | プレースホルダー/TODO/lorem/空chart・未出典claim検出 |
| `scripts/check_numerical_integrity.mjs` | waterfall/CAGR/%合計/小計の数値整合検証 |
| `scripts/run_mechanical_gate.mjs` | 上記 + qa_html_deck.mjs（幾何・タイポグラフィ）を1本のJSONに統合 |
| `scripts/render_spec_to_html.mjs` | Slide IR → HTML |
| `scripts/render_html_screenshots.mjs` | HTML → ページごとのPNG（Visual QA用） |
| `scripts/html_to_pdf.mjs` | HTML → PDF |
| `scripts/export_spec_to_editable_pptx.mjs` | Slide IR → 編集可能PPTX（pptxgenjs） |
| `scripts/apply_targeted_revision.mjs` | レビュー指摘の採用分をSlide IRの該当箇所だけにパッチ |
| `scripts/log_review_disposition.mjs` | Fresh-eye/Storyline/Visual QAの採否ログ |
| `scripts/log_experience.mjs` | 再現する失敗パターンの記録（3回でルール昇格候補フラグ） |
| `scripts/run_pipeline.mjs` | CLIオーケストレーター（--mode fast/standard/rigorous） |
| `test/unit.test.mjs` | ユニットテスト（`node --test test/unit.test.mjs`） |
| `test/integration/*` | 統合テスト用3デッキ（戦略提案・KPI財務・M&A投資委員会） |

## クイックスタート

```bash
# 1. Ghost Deckを書いて検証
node scripts/validate_ghost_deck.mjs ghost-deck/example.json

# 2. Slide IRに展開して検証
node scripts/validate_spec.mjs slide-spec/example_deck.json

# 3. パイプラインを実行（standardモード = Mechanical QA + Visual QA + PPTX）
node scripts/run_pipeline.mjs --mode standard \
  --ghost-deck ghost-deck/example.json --spec slide-spec/example_deck.json \
  --out-dir generated/my-deck
```

`nextAction.type === "llm_review_required"` で止まったら、`nextAction.promptFile` の指示文で
該当レビューを実行し、`nextAction.writeResultTo` に構造化JSONを書いてから同じコマンドを再実行する。

## テスト

```bash
node --test test/unit.test.mjs
```
