# Visual QA の指示文（Mechanical Quality Gate通過後・Fresh-eye Reviewerの前）

**Mechanical Quality Gate（`pipeline/scripts/run_mechanical_gate.mjs`）が `passed:true` になったスライドだけを
対象にする。** 機械チェックは重なり・はみ出し・欠落を見るが、**「機械的に正しくても見た目が悪い」**ケースは
拾わない——それがこの工程の役目。Fresh-eye Reviewer（`content-review-prompt.md`）はコンテンツ・論理・日本語を
見るのに対し、Visual QAは**画面としての見た目**だけを見る。両者は明確に分離する。

## 使い方

1. Mechanical Quality Gate 通過後、`node pipeline/scripts/render_html_screenshots.mjs <deck.html> <出力先>`
   （または `export_spec_to_editable_pptx.mjs` → PDF化 → PNG化）でスライドごとのPNGを作る。
2. 各PNGを読み（Read ツールで画像として渡す。画像化以外の下読みは不要）、下の観点で評価する。
   **このレビューはSlide IR・Ghost Deck・使用パターン名を見ずに、画像だけで判断する**——見た目の第一印象を
   汚さないため（Fresh-eye Reviewerの「作り方を伏せる」原則と同じ理由）。
3. 指摘を構造化JSONで返す。Critical/Majorはこの段階で直す（Targeted Revisionへ）。Minorは採否表で判断してよい。

## 出力契約

```json
{
  "visualQa": {
    "findings": [
      {
        "slide": 4,
        "severity": "critical | major | minor",
        "category": "clarity_at_a_glance | visual_hierarchy | whitespace | alignment | density | chart_readability | table_readability | text_wrapping | awkward_line_break | information_balance | slide_to_slide_consistency | awkward_spacing",
        "issue": "何が見た目として問題か（1〜2文）",
        "suggested_fix": "どう直すか（1〜2文。Slide IRのどのフィールドを変えるか分かる範囲で）"
      }
    ]
  }
}
```

## チェック項目

1. **clarity_at_a_glance**: 3秒見て結論が分かるか。タイトルと図の主役が一致しているか。
2. **visual_hierarchy**: 最も重要な要素（数値・結論）が視覚的に一番目立っているか。全要素が同じ強さで
   並んでいて優先順位が読めない状態になっていないか。
3. **whitespace**: 余白が極端に多い（内容不足・型が合っていない）／極端に少ない（詰め込みすぎ）箇所。
4. **alignment**: 左右カラムの下端・上端が揃っているか。表・カードの列幅/行高が不揃いでないか。
5. **density**: 1スライドの情報量が多すぎて読めない、または少なすぎてページの意味がないか。
6. **chart_readability**: 凡例・軸ラベル・値ラベルが読めるか。棒が多すぎて潰れていないか。色数が多すぎて
   系列を区別できないか。
7. **table_readability**: セルが文章化しすぎて表に見えないか。列幅が内容と合っていないか。
8. **text_wrapping**: 不自然な位置での折り返し、意図しない改行。
9. **awkward_line_break**: 泣き別れ（末尾1〜3字だけが次行に落ちる）。
10. **information_balance**: 左右カラム・複数カードの間で情報量の偏りが極端でないか。
11. **slide_to_slide_consistency**: 前後のスライドとヘッダー位置・余白・書体サイズが揃っているか
    （デッキ全体を連続して見たときだけ判定可能）。
12. **awkward_spacing**: 要素間の余白が不揃い、視覚的にガタついて見える箇所。

## Mechanical QAとの役割分担（再掲）

| 観点 | 担当 | ツール |
|---|---|---|
| 重なり・はみ出し・欠落・数値矛盾 | Mechanical QA | `run_mechanical_gate.mjs` |
| 「機械的に正常だが見た目が悪い」 | Visual QA（本ファイル） | 画像レビュー |
| 論理・日本語・数値の食い違い・出典欠落 | Fresh-eye Reviewer | `content-review-prompt.md` |
