# consulting-pptx-skill

**AIに「まじな」のPowerPointを作らせるためのClaude Codeスキル。**
スライド作成規約（約110項目）＋機械チェック＋**62型のスライド型カタログ**（すべて SlideSpec から編集可能PPTXで書き出せる）＋自由記述HTMLパーツ集＋生成パイプライン（HTMLプレビュー→編集可能PPTX）の一式です。

A Claude Code skill for generating boardroom-quality decks: a 62-archetype slide catalog, every archetype exportable as natively editable PPTX from a JSON SlideSpec, a freeform HTML parts library, a render pipeline (HTML preview → editable PPTX), a slide-design rulebook, and an automated rule checker.

私たちが実際に毎週の提案書・報告書づくりで使っている仕組みの公開版です。解説記事はこちら → [AIにまじなスライド作らせる（note）](https://note.com/jinbaflow/n/nc8372b84e572)

## 本質は `references/slide-rules.md`（約110項目のスライド規約）

このリポジトリでいちばん価値があるのは、実はテンプレでもスクリプトでもなく、**[slide-rules.md](references/slide-rules.md)** というテキストファイルです。実務の資料レビューで受けた指摘を1行ずつ書き溜めた約110項目。「結論はタイトルに書く」「角丸禁止」「塗りのあるボックスに枠線を付けない」「1資料1用語」「前提・定義は左、帰結は右」…。

使い方はシンプルで、**AIに資料を作らせる前に毎回このファイルを読ませ、出力後に `scripts/check_deck.py` で違反を機械検出し、最後に `references/content-review-prompt.md` で作り方を伏せた別エージェントにデッキのファイルを渡して、日本語の言い回し・論理展開・内容の矛盾を拾わせ、指摘を採否表にして採用分だけ直す**だけ。AIはセッションごとに記憶がリセットされるので、口頭で注意しても定着しません。ルールをファイル化して毎回読ませるのが唯一の定着方法です。

そして、良いスライドを作るのは型ではなく**流し込んだ後の調整**です。表を2枚に割る、右カラムを帰結形に書き直す、タイトルの通し読みでストーリーを繋ぎ直す — 型に囚われず考えて直し、そこで受けた指摘をまた slide-rules.md に1行追記する。この蓄積ループが品質の源泉で、型カタログとパイプラインは「たたき台を数十秒で出して、調整の反復回数を稼ぐ」ための道具にすぎません。

自社で使うときは、slide-rules.md に自社の規約・指摘を追記して育ててください。

## 最近追加した規約（抜粋）

実案件のレビューで受けた指摘を抽象化して追記しています。直近の追加分:

- **読み順と配置**（§4.37〜4.48）: 前提・定義・理由は左、具体例・結果・プレイヤーは右。表と図の並び順と向きを揃える。右カラムの論点は左の図の該当行に帯とラベルで対応付ける。倍率の比較は起点と比較先を矢印で示す。順序性のある行には方向を示す軸を添える。問題ページの後には「〜で越えられる」解消ページを対で置く。出典・注釈は左下の定位置。
- **AIぽさの3要因**（§7冒頭）: フローティングボックス／ブレットを使わない冗長な説明／主語・述語を抜いた異様な短縮。出力前にこの3つだけは必ず目視する。
- **チャートの基本形**（§5.12）: テーブル／左に前提・右に意味合い／左右対比／左に分析・右に解説の4つを先に当て、当てはまらないときだけ応用形（矢羽など）。チャートにクリエイティブさは要らない。
- **タイトル**（§2.1, §2.4, §2.10〜11）: 1行が基本、長ければ2行可（文字を縮小して1行に詰めない）。ページの中身の個数（「3つの理由」）をタイトルに入れない。チャートのページには So what（意味合い）を必ず載せ、事実の図だけで終えない。事実より強い言い切りをしない。
- **表**（§6）: 主張に効かない列は置かない。列見出しは中身を指す具体名詞（「事実」のような抽象語は不可）。列を定義したらセルの粒度を揃え、別カテゴリを混ぜない。
- **フレッシュアイ・レビュー**（§8）: 文脈を共有しない別エージェントにデッキのファイルを渡し、日本語・論理・破綻を指摘させ、採否表を作ってから直す。`check_deck.py` はタイトル80字超のみ FAIL、40字超は「2行想定」の WARN。

## 62型のスライド型カタログ

入口は **[assets/SlideCatalog_16x9.pdf](assets/SlideCatalog_16x9.pdf)**（70ページ）です。A 枠組み／B 数字で証明／C 比較・評価／D 構造で通す／E 進め方・計画／F 提示・締め の6章に62型を並べ、P.2 の索引と各ページ右下の「PPTX」「HTML」がその型を出せる経路を示します。同じ70枚を PPTX にした **[assets/SuperTemplate_62type.pptx](assets/SuperTemplate_62type.pptx)** も置いています。**70枚すべてがネイティブ図形（表・図形・チャート）で、PowerPoint でそのまま編集できます**。スライド番号＝カタログのページ番号。

「62型」は作れる見せ方の上限ではありません。実際のデッキでは、型を組み合わせたり崩したりして規約の範囲で自由に組むので、見せ方のパターンはこれより多くなります。型カタログは「レイアウトの発想帳」として使い、合わなければ捨ててください。

内訳は、もともとの SlideSpec 36型のうち表紙を除く35型と、自由記述パーツ集の27パーツを SlideSpec の型として実装したもの（`pipeline/scripts/archetypes/`、型ID一覧は下）。`pipeline/slide-spec/super_template.json` には63型（36＋27）の完成 SlideSpec が入っており、どの型も `npm run export` で編集可能PPTXになります。もともとの36型は [docs/catalog/](docs/catalog/) に1枚ずつ画像でも置いています（テンプレ再描画: `TEMPLATE_MODE=1 npm run render -- slide-spec/super_template.json generated/super_template.html`。型名だけのタイトルは通常の最短字数チェックに引っかかるため、この環境変数で検証を外します）。

カタログPDFと62型PPTXの再生成は `python3 scripts/build_slide_catalog.py`（要: `pipeline/` で `npm run setup` 済み、`pip3 install python-pptx`、LibreOffice）。カタログの配色は HTML パーツ集と同じブラウン系に揃えています（スクリプトが palette を注入）。SlideSpec から生成するデッキの既定色はネイビーで、SlideSpec ルートの `palette` で変えられます。

### パーツ由来の27型（`parts` フィールドに中身を書く）

| パーツ | 型ID | 型名 | parts の中身 |
| --- | --- | --- | --- |
| 01 | `title_page` | 表紙 | parts.title: 資料タイトル（明朝 34pt）／parts.subtitle: 副題（明朝アクセント 15pt。「ラベル：Text に基づく整理」のように何に基づく資料かを1行で）／parts.lead: 任意。副題の下に置く2〜3行の説明（11pt） |
| 02 | `overview_map` | 全体マップ | parts.rows: [{label, text, ref}] 3〜6行。label は明朝の見出し語、text は1〜2行の要約、ref は「→ P.n」 |
| 03 | `table_of_contents` | 目次 | parts.items: [{n, text, page}] 3〜6行。n は「01」等の番号、text は章タイトル（章扉・セパレーターと同じ文言）、page は「P.4」 |
| 04 | `section_divider` | 章扉 | parts.no: 章番号（「01」などのラベル。明朝アクセント 15pt・字間広め）／parts.title: 章タイトル（明朝 30pt。目次と同じ文言）／parts.desc: 任意。章の一行説明（12pt アクセント） |
| 05 | `chevron_steps` | 矢羽（プロセス・変遷） | parts.steps: [{n, title, text}] 3〜6個。n は時点・番号（例 YYYY年M月／現在／1）、title は矢羽の見出し、text は1〜2行の補足。色分けするなら legend で凡例を付ける |
| 06 | `premise_conclusion` | 前提→帰結の2カラム | parts.left: {header, rows:[[軸, 本文], ...]}（見出し行なしの2列表。軸は時点や区分）／parts.right: {header:「だから、〜」, bullets:[]}（語尾は階層内で統一） |
| 07 | `stat_table_readout` | 大型数値の表＋読み取り | parts.left: {header, rows:[[軸, 大型数値, 補足], ...]}（見出し行なしの3列表。数値は 14pt 太字）／parts.right: {header:「だから、こう読める」, bullets:[]} |
| 08 | `card_grid_2x2` | 並列カード 2×2 | parts.cards: [{n?, title, bullets:[] ／ body}] 4枚（左上→右上→左下→右下）。title は「主語＋何をする」で統一、bullets は2〜3行。n は任意の番号（省略可） |
| 09 | `axis_table` | 軸のある表 | parts.headers: 列見出し（先頭が軸）／parts.cols: [{w, axis}] 幅比と軸指定／parts.rows: セルは文字列か {text／bullets:[], bold} |
| 10 | `back_cover` | 裏表紙 | parts.company: 会社名（明朝 22pt）／parts.contact: 連絡先（明朝アクセント 15pt。部署・メール等を1行）。主張文や CTA は置かない |
| 11 | `claim_panel_figure` | 主張パネル＋図 | parts.panel: {n: 番号, label: 区分名, claim: この1枚の主張（1文）}／parts.right: {axisTitle: 指標名, unit: 単位・期間（右寄せ）, rows: [[軸ラベル, 大きめの値ラベル, 本文], ...]} 2〜4行。右の表は見出し行なし（軸列＝明朝アクセント＋右太罫、2列目＝14pt太字、3列目＝本文） |
| 12 | `lever_effect_table` | 打ち手の効果表 | parts.headers: 列見出し3つ [打ち手, 効果の幅（単位）, 前提・制約]／parts.rows: [{axis: 打ち手名, effect: {dir: 'up'／'dn', label: 矢印内の文字（＋00〜00 等）, pct: 0〜1 の幅比}, bullets: [補足1, 補足2]}] 2〜5行。bullets の代わりに text（文字列）も可／parts.legend: {up, dn} 凡例の文言（既定「増やす方向」「減らす方向」） |
| 13 | `status_heatmap_comment` | 状態ヒートマップ＋右コメント | parts.axisTitle: 左の軸見出し（例「指標カテゴリー別の状況」）／parts.unit: 右寄せの時点（YYYY年M月時点）／parts.colHeaders: 列見出し（先頭が軸列、以降が比較軸。例 [指標カテゴリー, 前月比, 前年比]）／parts.rows: [{label, values: [0〜4, ...]}] 3〜6行。値は 4=大きく改善（濃）… 0=横ばい（淡灰）／parts.legend: [{v: 0〜4, label}] 凡例（既定: 大きく改善/改善/横ばい/悪化）／parts.commentTitle: 右カラム見出し（既定「だから、次に見るべき点」）／parts.comments: [文字列] 2〜4件 |
| 14 | `harvey_ball_table` | 充足度評価表（ハーベイボール） | parts.headers: 列見出し [評価軸, 案1, 案2, ..., 判断の理由]（先頭が軸列、最後が理由列、その間が玉の列）／parts.rows: [{axis: 評価軸名, values: [0〜4, ...] 案ごとの充足度（4=満たす, 2=半分, 0=満たさない）, bullets: [理由1, 理由2]}] 3〜5行。bullets の代わりに text（文字列）も可／parts.legend: [{q: 0〜4, label}]（既定: 満たす/一部満たす/満たさない） |
| 15 | `dot_matrix_share` | 割合のドットマトリクス | parts.header: 軸見出し（明朝）／parts.unit: 右端の単位・母数（例「回答者に占める割合、n=ラベル 2、複数回答」）／parts.columns: [{value:'00%', pct:0-100, label}] 2〜5列。pct の分だけ 10×10 の点を左上から行方向に塗る（value は表示文字列） |
| 16 | `progress_bubble_matrix` | 進捗バブル行列 | parts.header: 軸見出し／parts.unit: 単位・母数（例「件、n=ラベル 1」）／parts.colHeaders: 列見出し（段階）3〜5列／parts.rows: [{axis, values:[number]}] 3〜6行。values は件数（0 は円なし）。円の面積が値に比例し、最大値が最大径になる／parts.legend: 任意。右下の凡例文（例「円の面積＝件数」） |
| 17 | `ranked_bar_annotated` | 分布の順位棒＋注記 | parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.bars: [{label, value, highlight?}] 降順に並べる（多数可。15本以下なら項目名と値を表示）／parts.topLabel・parts.otherLabel: 凡例の文言（既定「上位N社」「その他」）／parts.readout: {title, bullets:[]} 右の「だから」見出しと箇条書き |
| 18 | `scatter_annotated` | 注記つき散布図 | parts.axisTitle: 軸見出し（「Text 1とText 2の関係」）／parts.unit: 単位行／parts.points: [{label, x, y, highlight?}] x・y は 0〜100 の位置（実値なら parts.xMax/yMax を与える）／parts.refLines: [{axis:'x'／'y', value, label}] 破線の参照線／parts.annotations: {topLeft, bottomLeft, bottomRight, topRight} 図中の斜体注記 |
| 19 | `pillars_foundation` | 柱＋土台 | parts.pillars: [{title, text}] 3〜5本（薄い塗り・見出し11pt太字＋本文9pt・縦中央）／parts.bases: [{lead, text}] 1〜3本の濃色帯（lead はアクセント色太字、text は白）。単数なら parts.base:{lead,text} でも可 |
| 20 | `opposing_chevrons` | 対向シェブロン | parts.left / parts.right: 文字列の配列（各 3〜5項目、10pt、細罫で区切って縦に等分）／parts.center: [{text, alt?}] 中央の目的ブロック 1〜3個（濃色、alt:true はアクセント色。改行は \n）。中央幅は 46mm 固定 |
| 21 | `evidence_clip_grid` | 外部動向の根拠グリッド | parts.clips: [{tag, date, headline, text}] 4〜6枚（4枚まで2列、5〜6枚は3列）。tag は濃色の小さな分類チップ、date は斜体の日付・媒体、headline は明朝11pt太字、text は要旨 8.5pt。出典は item.source に「Source 1（YYYY年M月D日）」の形で |
| 22 | `proportional_circles` | 比例円の対比 | parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.items: [{heading, value, size, label}] 左から順。heading=円の上の見出し（「現在（YYYY年）」）、value=円内の大型数値（表示文字列）、size=面積の元になる数値、label=数値の下の説明。2件推奨（3件以上は棒グラフを検討） |
| 23 | `delta_bars_totals` | 増減の縦棒＋左右合計 | parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.categories: [{label, up, down}] 項目ごとの増分（正数）と減分（正数で与える）／parts.upLabel・parts.downLabel: 「増える分」「減る分」／parts.upTotal・parts.downTotal: 左の大型数値（省略時は合計）／parts.showValues: 棒内に値を出す（既定 false） |
| 24 | `scenario_lines_cagr` | シナリオ線＋成長率チップ | parts.axisTitle: 軸見出し／parts.unit: 単位行／parts.categories: ['YYYY', ...] 年（3〜8点）／parts.series: [{name, values:[], chip}] 上から濃色→淡色（最大3本）。name は凡例の文言、chip は成長率チップの表示（「27%」）／parts.chipTitle: チップ列の見出し（既定「年平均成長率」）／parts.endLabels: 終点に値を出す（既定 true）／parts.yMin: 値軸の下限（既定 0。高い水準から始まる系列で差を見せたいときだけ） |
| 25 | `research_basis` | 調査の土台 | parts.methodTitle: 左カラム見出し（既定「調べ方」）／parts.methods: [文字列] 調べ方のブレット 2〜4件／parts.targetTitle: 右カラム見出し（既定「調べた対象」）／parts.targets: [{n: 大型数値＋単位（ラベル 1社 / Nか月）, text: 内訳の説明}] 2〜4行 |
| 26 | `issue_action_columns` | 課題と打ち手の2カラム | parts.rows: [{issue:{label, text}, action:{label, text}}] 3〜5行（左右で行を対応させる。段階ビルドアップなら action を省いた1枚を先に出す）／parts.headers: {issue, action}（既定「いま起きている課題」「これから打つ手」） |
| 27 | `agenda_separator` | セパレーター（章扉＝アジェンダ再掲） | parts.items: [{n, text, page, current}] 目次（パーツ03）と並び・文言を完全一致させる。current:true の1行だけ現在地として強調（番号 19pt アクセント・タイトル 21pt 濃色）、他行は補助色 |

型の追加・修正は `pipeline/scripts/archetypes/README.md` の手順で（1ファイル=1型。`QA_OUT=... bash scripts/qa_parts.sh <id>` で HTML パーツと並べて目視QA）。

## 作り方は2経路、型カタログは1本

| 経路 | 実体 | 出せるもの | 使うとき |
| --- | --- | --- | --- |
| **自由記述（本線）** | `templates/freeform_parts_16x9.html`（27パーツ） | HTMLデッキ → PDF | 納品物。主張に合わせて1枚ずつ組む |
| **SlideSpec パイプライン** | `pipeline/slide-spec/super_template.json`（63型＝36＋パーツ由来27） | **編集可能なPPTX** | たたき台を秒で出す・PowerPointで渡す・カタログの62型どれでも |

どちらの型も **タイトル欄は型名だけ**で、見本の主張文は置いていません。見本文があると文型がそのまま真似され、主張ではなくテンプレを写した資料になるからです（slide-rules §2.8）。タイトルは必ずストーリーラインから起こして差し替えます。

プレースホルダーの書き方は両経路で統一しています: 本文 `Text 1`、項目名 `ラベル 1`、見出し `タイトル 1`、数値 `00`、年 `YYYY年`、指標行 `指標名、単位、YYYY〜YYYY年`、出典 `出典：Source 1`。`check_deck.py` はこれらが納品デッキに残っていたら **FAIL**、タイトルの文型が6割以上同じなら **WARN** にします（テンプレ集そのものを検査するときだけ `--template`）。

パーツ集の主なもの: 主張パネル＋図／打ち手の効果表／状態ヒートマップ／充足度評価表（ハーベイボール）／割合のドットマトリクス／進捗バブル行列／分布の順位棒／注記つき散布図／柱＋土台／対向シェブロン／外部動向の根拠グリッド／比例円の対比／増減の縦棒／シナリオ線＋成長率チップ／調査の土台／課題と打ち手の2カラム／セパレーター（章扉＝アジェンダ再掲・現在地を強調）。

## たたき台を秒で出す仕組み（SlideSpec）

核心は「**AIにレイアウトを描かせない**」こと。63型それぞれのレイアウト（タイトル位置・余白・フォントサイズ・作図ルール）は実測値としてレンダラーに焼き込んであり、AIが書くのは中身（主張・数値・ラベル）だけです。

このJSON（SlideSpec）を書くと——

```json
{
  "template": "waterfall",
  "kicker": "07｜収益ブリッジ",
  "title": "営業利益は価格改定と歩留まり改善で+42を積み、為替の逆風を吸収して140に着地する",
  "chart": {
    "unit": "億円",
    "series": [
      { "label": "FY24実績", "value": 100, "kind": "base" },
      { "label": "価格改定", "value": 18, "kind": "up" },
      { "label": "歩留まり改善", "value": 24, "kind": "up" },
      { "label": "為替影響", "value": -9, "kind": "down" },
      { "label": "その他", "value": 7, "kind": "up" },
      { "label": "FY25見込", "value": 140, "kind": "total" }
    ]
  },
  "sections": [ { "title": "含意", "copy": "寄与の6割は価格改定。為替の逆風は想定レンジ内で吸収できる" } ],
  "note": "注：FY25は10月時点の着地見込",
  "source": "出典：社内管理会計"
}
```

——この1枚が出てきます。

![waterfall example](docs/example_waterfall.png)

ほかの例（`pipeline/slide-spec/example_deck.json` に3枚分を同梱）:

| kpi_dashboard | comparison_table |
| --- | --- |
| ![kpi](docs/example_kpi_dashboard.png) | ![comparison](docs/example_comparison_table.png) |

## セットアップ

```bash
# Claude Codeのスキルフォルダにcloneするだけ
git clone https://github.com/carnot-tech/consulting-pptx-skill.git ~/.claude/skills/consulting-pptx-skill

# パイプラインの初期化（Node.jsが必要。playwright chromiumも入ります）
cd ~/.claude/skills/consulting-pptx-skill/pipeline
npm run setup
```

あとはClaude Codeにこう頼みます:

> 新規事業の投資判断資料を作りたい。型カタログから型を選んで10枚構成のSlideSpecを書き、パイプラインで編集可能なPPTXまで出して。作成前に slide-rules.md を読み、出力後は check_deck.py でFAIL 0にすること。

## 手動で使う場合

```bash
cd pipeline
node scripts/validate_spec.mjs slide-spec/example_deck.json                              # スキーマ検証
node scripts/render_spec_to_html.mjs slide-spec/example_deck.json generated/deck.html    # HTMLプレビュー
node scripts/qa_html_deck.mjs generated/deck.html                                        # 構造QA
node scripts/export_spec_to_editable_pptx.mjs slide-spec/example_deck.json generated/deck.pptx  # 編集可能PPTX
python3 ../scripts/check_deck.py generated/deck.pptx                                     # 規約の機械チェック
node ../scripts/check_layout.mjs generated/deck.html                                     # HTMLのはみ出し・重なり検査
```

自由記述で組むときは `templates/freeform_parts_16x9.html` をコピーして不要な `<section>` を消し、プレースホルダーを差し替えてから同じ `check_deck.py` にかけます。

書き出されるPPTXは画像貼り付けではなく、全図形がPowerPointで編集できるネイティブなテキストボックス・表・シェイプです。

## 中身

| パス | 内容 |
| --- | --- |
| `SKILL.md` | 実運用フロー＋型カタログの一覧（AIへの指示書。これがスキルの本体） |
| `templates/freeform_parts_16x9.html` | 自由記述パーツ集（27パーツ・1パーツ=1スライド・16:9）。本線の作り方 |
| `pipeline/` | 生成スクリプト（validate / render / qa / export / shots）＋CSS |
| `pipeline/scripts/archetypes/` | パーツ由来27型の実装（1ファイル=1型。PPTX描画＋example）。`README.md` に追加手順 |
| `pipeline/slide-spec/super_template.json` | 63型すべての完成SlideSpec定義（コピーして使う正本。`node scripts/build_parts_template.mjs` で archetypes の example を同期） |
| `pipeline/slide-spec/example_deck.json` | 記入例3枚（上のプレビュー画像の元データ） |
| `pipeline/slide-spec/schema.json` | SlideSpecスキーマ |
| `references/slide-rules.md` | スライド作成ルール正典（約110項目） |
| `references/content-review-prompt.md` | フレッシュアイ・レビューの指示文。機械チェックのあと、作り方を伏せた別エージェントにデッキのファイルを渡して日本語・論理・破綻を拾わせ、採否表にして直す |
| `scripts/check_deck.py` | 規約の機械チェック（PPTX / HTML両対応。要 `pip3 install python-pptx`。テンプレ集の検査は `--template`）。タイトルの「N段階」と本文の連番の食い違いも FAIL にする |
| `scripts/check_layout.mjs` | HTMLデッキの実レンダリング検査（フッターとの重なり・右端/下端のはみ出し） |
| `scripts/build_slide_catalog.py` | 62型カタログPDFと62型PPTXを再生成する |
| `assets/SlideCatalog_16x9.pdf` | **62型のスライド型カタログ（70ページ）。型を探すときの入口** |
| `assets/SuperTemplate_62type.pptx` | カタログと同じ70枚のPPTX見本帳（全スライドがネイティブ図形・編集可能） |

Node.jsが無い環境でも、カタログPDFで型を選び、見本帳PPTXから手動コピペし、ルール正典と機械チェックを使うところまでは Node.js なしで回せます。

## カスタマイズ

- **いちばん効くのは slide-rules.md への追記**です。レビューで受けた指摘を1行ずつ足していくと、御社専用の資料作成AIに育ちます
- SlideSpecルートの `palette` でブランドカラーを一括差し替えできます（`schema.json` 参照）

## About

Made by [Carnot AI](https://jinba.io) — AIエージェント基盤「Jinba」を開発・提供しています。
このスキルと同じ仕組みを、ブラウザのチャットだけで使える形（Jinba App Neo）でも提供しています。

## License

MIT
