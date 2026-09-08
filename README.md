# consulting-pptx-skill

**AIに「まじ」なPowerPointを作らせるためのClaude Codeスキル。**
スライドの設計規約（約110項目）、規約違反を見つける機械チェック、**62型のHTMLパーツ集**（基本27＋追加35）、型カタログPDFをまとめたものです。資料は HTML（16:9）で組み、Chrome で PDF に書き出します。

進め方は、規約を読む → パーツ集から必要なパーツを取り出して1枚ずつ組む → 機械チェックを通す → 作り方を知らない別のエージェントにレビューさせる、の順です。

A Claude Code skill for generating boardroom-quality decks: a slide-design rulebook, an automated rule checker, a 62-part HTML slide library (16:9, one section per slide, printed to PDF via Chrome), and a visual catalog PDF.

私たちが実際に毎週の提案書・報告書づくりで使っている仕組みの公開版です。解説記事はこちら → [AIにまじなスライド作らせる（note）](https://note.com/jinbaflow/n/nc8372b84e572)

## 本質は `references/slide-rules.md`（約110項目のスライド規約）

このリポジトリでいちばん価値があるのは、実はテンプレでもスクリプトでもなく、**[slide-rules.md](references/slide-rules.md)** というテキストファイルです。実務の資料レビューで受けた指摘を1行ずつ書き溜めた約110項目。「結論はタイトルに書く」「角丸禁止」「塗りのあるボックスに枠線を付けない」「1資料1用語」「前提・定義は左、帰結は右」…。

使い方は3つだけです。**AIに資料を作らせる前に毎回このファイルを読ませる。出力後に `scripts/check_deck.py` で違反を機械検出する。最後に `references/content-review-prompt.md` の指示文で、作り方を知らない別のエージェントにデッキを読ませ、日本語・論理・矛盾の指摘を受けて採用分だけ直す。** AIはセッションごとに記憶がリセットされるので、口頭で注意しても定着しません。ルールをファイルにして毎回読ませるのが定着させる方法です。

良いスライドを決めるのは型ではなく、**組んだ後の調整**です。表を2枚に割る、右カラムを帰結の形に書き直す、タイトルだけを通して読んでストーリーを繋ぎ直す。型に囚われず直し、そこで受けた指摘を slide-rules.md に1行足す。この繰り返しが品質の源で、型カタログとパーツ集は「たたき台を早く出して、調整に時間を回す」ための道具です。

自社で使うときは、slide-rules.md に自社の規約・指摘を追記して育ててください。

## 62型のスライド型カタログ

入口は **[assets/SlideCatalog_16x9.pdf](assets/SlideCatalog_16x9.pdf)**（62ページ）です。P.1〜27 が基本パーツ集、P.28〜62 が追加パーツ集を印刷したもので、型ID・型名・使いどころの一覧は [references/archetype-catalog.md](references/archetype-catalog.md) にあります。

「62型」は作れる見せ方の上限ではありません。実際のデッキでは、型を組み合わせたり崩したりして規約の範囲で自由に組むので、見せ方のパターンはこれより多くなります。型カタログは「レイアウトの発想帳」として使い、合わなければ捨ててください。


## パーツ集の使い方

| ファイル | 中身 | 使用頻度 |
| --- | --- | --- |
| `templates/freeform_parts_16x9.html`（基本パーツ集） | 表紙・全体マップ・目次・章扉・矢羽・前提→帰結・軸のある表・主張パネル・評価表・分布図など27パーツ | 高い。まずここから |
| `templates/freeform_parts_more_16x9.html`（追加パーツ集） | エグゼクティブサマリー・積み上げ棒・ブリッジ・散布図・比較表・マトリクス・イシューツリー・ロードマップ・ガントなど35パーツ | 低い。基本で足りないとき |

どちらも 16:9・1 section = 1スライドの単体HTMLです。`scripts/new_deck.py --parts b01,m05,...` のようにパーツ番号を並べると、必要なパーツだけを取り出した1本のHTMLができます（2ファイルの見た目の定義は、衝突しないようにスクリプトが結合します）。あとはプレースホルダー（本文 `Text 1`、項目名 `ラベル 1`、見出し `タイトル 1`、数値 `00`、年 `YYYY年`、出典 `出典：Source 1`）を実物に差し替えます。残っていると `check_deck.py` が FAIL にします。

各 section のタイトル欄には型名だけが入っていて、見本の主張文は置いていません。見本文があると、その文型をなぞった資料になってしまうからです（slide-rules §2.8）。タイトルは必ず自分のストーリーラインから書きます。

**色と書体は両ファイルで同じ既定**です（暖色系: 生成りの地・濃茶の文字・茶のアクセント。見出しは明朝、本文はゴシック）。各ファイルの `<style>` 冒頭にある `:root` の変数で一括管理していて、ネイビー系にする値はコメントで同梱しています。

## セットアップ

```bash
# 1. Claude Code のスキルフォルダに clone する（これだけで規約・パーツ集・機械チェックが使える）
git clone https://github.com/carnot-tech/consulting-pptx-skill.git ~/.claude/skills/consulting-pptx-skill

# 2.（任意）実レンダリング検査 check_layout.mjs を使う場合。Node.js が必要。playwright と Chromium が入る
cd ~/.claude/skills/consulting-pptx-skill && npm run setup

# 3.（任意）PPTX ファイルを check_deck.py で検査する場合
pip3 install python-pptx
```

- `scripts/check_deck.py`（規約の機械チェック）と `scripts/new_deck.py`（たたき台の生成）は Python 標準ライブラリだけで動きます。
- PDF 化は Chrome のヘッドレス印刷を使います（コマンドは次節）。
- `package.json` は手順2の playwright を入れるためだけのものです。`node_modules/` は .gitignore 済みです。

## 手動で使う場合

```bash
python3 scripts/new_deck.py --list                                          # パーツ番号と型名の一覧
python3 scripts/new_deck.py --parts b01,b02,m05,b06,b09,b10 --title "資料名" -o mydeck.html   # たたき台を生成
python3 scripts/check_deck.py mydeck.html           # 規約の機械チェック（FAIL 0 にする）
node scripts/check_layout.mjs mydeck.html           # フッター重なり・はみ出しの実レンダリング検査
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf=mydeck.pdf mydeck.html
```

## 中身

| パス | 内容 |
| --- | --- |
| `SKILL.md` | AIへの指示書（スキルの本体）。考え方と手順だけを書き、詳細は `references/` に置く |
| `templates/freeform_parts_16x9.html` | 基本パーツ集（27パーツ・1パーツ=1スライド・16:9） |
| `templates/freeform_parts_more_16x9.html` | 追加パーツ集（35パーツ。チャート・比較表・マトリクス・計画系） |
| `references/slide-rules.md` | スライド作成ルール正典（約110項目） |
| `references/archetype-catalog.md` | 62型の型カタログ（型ID・型名・使いどころ・どのパーツ集の何番か） |
| `references/content-review-prompt.md` | フレッシュアイ・レビューの指示文。機械チェックのあと、作り方を伏せた別エージェントにデッキのファイルを渡して日本語・論理・破綻を拾わせ、採否表にして直す |
| `references/ai-smell-lexicon.md` | AI臭ワード・言い回しのリストとセルフチェック |
| `scripts/new_deck.py` | パーツ番号を並べて1本のデッキHTMLを生成（両パーツ集のCSSをスコープして結合・ページ番号の振り直し） |
| `scripts/check_deck.py` | 規約の機械チェック（HTML / PPTX 両対応。テンプレ集の検査は `--template`）。タイトルの「N段階」と本文の連番の食い違いも FAIL にする |
| `scripts/check_layout.mjs` | HTMLデッキの実レンダリング検査（フッターとの重なり・右端/下端のはみ出し） |
| `assets/SlideCatalog_16x9.pdf` | **62型のスライド型カタログ（両パーツ集を印刷した62ページ）。型を探すときの入口** |
| `assets/SuperTemplate_62type.pptx` | 62型のPPTX見本帳（全スライド編集可能）。PowerPoint で手動コピーして使うときの見本。パーツ集の正本ではない |

## カスタマイズ

- **いちばん効くのは slide-rules.md への追記**です。レビューで受けた指摘を1行ずつ足していくと、御社専用の資料作成AIに育ちます
- 色・書体は両パーツ集の `<style>` 冒頭 `:root` トークンで差し替えます。ブランドに合わせるときは両ファイルを同じ値にします
- 生成した資料の**最終ページの出典行だけ**に「consulting-pptx-skill で作成」の注釈を入れます
- PowerPoint（.pptx）が要るときは、PDFで渡す／`assets/SuperTemplate_62type.pptx` から手でコピーする、のどちらかです。HTML から PPTX への自動変換は含めていません。以前あった JSON から編集可能PPTXを書き出す仕組みは、使用頻度が低かったため外しました（git タグ `pipeline-archived` の時点のリポジトリに残っています）

## About

Made by [Carnot AI](https://jinba.io) — AIエージェント基盤「Jinba」を開発・提供しています。
このスキルと同じ仕組みを、ブラウザのチャットだけで使える形（Jinba App）でも提供しています。

## License

MIT
