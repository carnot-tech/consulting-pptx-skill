# コントリビューションの手引き

このリポジトリへの Issue・Pull Request（PR）を歓迎します。中心は `references/slide-rules.md` の規約と、それを測る機械チェックです。PR は次の流れで出してください。

## 出す前に

- **1 つの PR には 1 つの目的だけ**を入れる（バグ修正と規約追加を混ぜない）。関連する変更を順に出すときは、後の PR を前の PR の上に積み、説明にその旨を書く
- 規約の考え方を変える・型を大きく足すなど、方針に関わる変更は先に Issue で相談する
- 自分の fork でブランチを切る。名前は `feat/…`（機能）・`fix/…`（不具合）・`docs/…`（文書）・`chore/…`（雑務）を目安にする

## 変更の種類ごとの約束

### 規約（slide-rules.md）を足す・直す

**指摘は規約 1 行と機械チェックの両方にする**（slide-rules §8）。測れる指摘（数・位置・語・空き）は次の 3 点を同じ PR に入れる。

1. `references/slide-rules.md` に 1 行足す
2. `scripts/check_deck.py`／`scripts/check_layout.mjs` に判定を足す
3. `tests/` に「直していない版で FAIL が出る」「直した版で出ない」の 2 件を足す

測れない指摘（言い回し・論理）は規約の 1 行だけでよい。その場合は PR に「測れない理由」を 1 行書く。

### スクリプト（scripts/）を直す

- `check_deck.py`（HTML）と `new_deck.py` は **Python 標準ライブラリだけ**で動く状態を保つ。新しい依存が要るときは、PPTX 側など使う場面に閉じて import し、README のセットアップ欄に書く
- 不具合の修正には、修正前に失敗し修正後に通るテストを付ける

### パーツ集・型カタログを直す

- 色・書体は両パーツ集（`templates/freeform_parts_16x9.html`・`freeform_parts_more_16x9.html`）の `:root` を揃える
- 型を足した・見た目を変えたときは `references/archetype-catalog.md` も更新する。`assets/SlideCatalog_16x9.pdf` の再生成が要る場合は PR にそう書く

### 文書

- 手順や使い方を変えたら、`SKILL.md`・`README.md`・`slide-rules.md` の該当箇所を**同じ PR で**揃える。スキルは SKILL.md を読んで動くので、古い説明が残ると次のセッションで古い手順が使われる

## 機密を入れない

- 顧客名・社内語・案件コード、実案件の資料（.pptx／.potx）、`measure_deck.py` が出す `skin.json` はコミットしない（`.gitignore` 済み。`assets/` の見本だけが例外）
- テストに PowerPoint ファイルが要るときは、テストの中で python-pptx の白紙テンプレートから作る（`tests/test_house_pptx.py` の `make_house` を参照）
- PR の説明に実例を載せるときは「社内テンプレート A」のように匿名にする

## 確認してから出す

```bash
python3 -m unittest discover -s tests      # すべて通る（playwright の要るテストは未導入ならスキップ）
python3 scripts/check_deck.py tests/fixtures/good_deck.html   # 機械チェックを触ったとき
```

見た目に関わる変更は、PDF やページ画像で目視した結果を PR に書く。

## コミットメッセージ

日本語で、1 行目に「何をするか」、本文に「なぜか（困っていた現象・再現手順）」と「どう直したか」を書く。

```
measure_deck: 見本が 1 枚ずつのテンプレートでも本文のレイアウトを選ぶ

表紙・章扉・本文を 1 枚ずつ並べた見本ではレイアウトの使用回数が同点になり、
表紙が本文として選ばれていた。同点のときは中央タイトルでない・後ろで使われる方を選ぶ。
```

## PR の説明

テンプレート（`.github/pull_request_template.md`）に沿って、背景・変更・確認・関連 PR を書く。AI エージェントに PR を作らせる場合も、この手引きと同じ内容を守らせる。
