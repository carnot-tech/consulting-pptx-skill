# Storyline Review の指示文（Ghost Deck 段階・レイアウト作成前）

**このレビューはSlide IR・HTML・PPTXを一切生成する前に行う。** Ghost Deck（`pipeline/ghost-deck/schema.json`）の
`action_title` と `key_message` だけを対象にする——レイアウトを組んでからストーリーを直す設計にしない
（目標アーキテクチャの鉄則）。

## 使い方

1. `node pipeline/scripts/validate_ghost_deck.mjs <ghost-deck.json>` で構造チェック（必須フィールド・
   role enum・transition連続性・完全一致の重複タイトル）を先に通す。`passed:false` ならレビューへ進まない。
2. 下の指示文で Ghost Deck の中身（`action_title` を `slide_number` 順に通し読み、`key_message` /
   `transition_from_previous` / `transition_to_next` は該当箇所の判断のときだけ参照）をレビューする。
   Fresh-eye Reviewer（`content-review-prompt.md`）と同様、**このレビュー担当には作り方・スキル名・
   Creator自身の弱点認識を渡さない**——Ghost Deck本体とdeckTitle/audience/decisionAskedだけを渡す。
3. 返ってきた指摘を `outcome: accept|reject|modify` で採否判定する（`pipeline/scripts/log_review_disposition.mjs`
   参照）。Critical指摘は合理的理由なく却下しない。
4. 指摘採用分は Ghost Deck のJSONを直接編集し、`validate_ghost_deck.mjs` を再実行してから
   Slide IR（Slide Specification）への展開に進む。

## 出力契約（構造化JSON。Fresh-eye Reviewerと同じ severity 語彙）

```json
{
  "storylineReview": {
    "overallVerdict": "coherent | needs_revision | incoherent",
    "findings": [
      {
        "slide_number": 4,
        "severity": "critical | major | minor",
        "category": "answers_the_question | conclusion_first | connects_to_previous | duplicate_claim | logic_jump | so_what_missing | issue_analysis_implication_recommendation | exec_summary_mismatch",
        "issue": "何が問題か（1〜2文）",
        "suggested_fix": "どう直すか（1〜2文。action_title/key_message/transitionのどれを変えるか明示）"
      }
    ]
  }
}
```

`category` は下のチェック項目に対応する固定語彙（ここにない種類の指摘は入れない——Fresh-eye Reviewer側の
自由記述レビューに任せる）。

## チェック項目（`action_title` を `slide_number` 順に通し読みして判定）

1. **answers_the_question**: `decisionAsked` に対して、通し読みが答えを出しているか。答えないまま終わっていないか。
2. **conclusion_first**: 各 `action_title` が結論から始まっているか（背景説明から入っていないか）。
3. **connects_to_previous**: 各スライドの `action_title` が、前スライドの `action_title` の論理を受けているか
   （`transition_from_previous` に書かれた接続が、実際に2枚のタイトル間で成立しているか）。
4. **duplicate_claim**: 同じ主張が言い換えで繰り返されていないか（`validate_ghost_deck.mjs` は完全一致しか
   拾えない。ここでは意味の重複を見る）。
5. **logic_jump**: 前提なしに結論が出ている箇所、または途中の推論が省略されている箇所。
6. **so_what_missing**: `key_message` を読んでも「だから何か」が立っていない箇所。
7. **issue_analysis_implication_recommendation**: デッキ全体として Issue → Analysis → Implication →
   Recommendation の流れが成立しているか（`role` の並びと `action_title` の内容の両方で判定）。
8. **exec_summary_mismatch**: `role: "executive_summary"` のスライドの `action_title`/`key_message` が、
   後続スライドの内容の総和と一致しているか（総和より狭い／広い／food違う場合に指摘）。

## 出力に含める追加情報

- **overallVerdict**: `coherent`（criticalなし）／`needs_revision`（critical/majorがあるが構造は直せる）／
  `incoherent`（Ghost Deck自体を作り直すレベル）。
- 指摘は `slide_number` 昇順、同一スライド内は severity 降順で並べる。
- 該当なしのカテゴリは省略してよい（Fresh-eye Reviewerの「該当なし」明記ルールとは異なり、Ghost Deck
  レビューは指摘のみを返す簡潔な形式とする）。
