---
name: consulting-pptx-skill
description: スライド設計規約 slide-rules.md（実務レビュー由来・約80項目の正典）を核に、経営会議品質のスライドを作るスキル。作成前に規約を読み、自由記述テンプレート（本線）またはSlideSpecパイプライン（62型カタログの全型を編集可能PPTXで出せる）で組み、規約の範囲で型に囚われず調整し、check_deck.py の機械チェック FAIL 0 で仕上げる。型カタログはレイアウトの発想帳であり、合わせる対象ではない。トリガー例:「コンサル品質のスライドを作って」「規約に沿ったデッキで」「型カタログから選んで」。
---

# コンサル型スライド作成スキル（規約正典を核にしたスライド作成システム）

**このスキルの主軸は `references/slide-rules.md` — 実務のレビュー指摘を1行ずつ蓄積した約80項目の設計規約です。** どんなスライドを作るときも、(1) 作成前に規約を読む → (2) 自由記述テンプレートかSlideSpecパイプラインでたたき台を組む → (3) 規約の範囲で型に囚われず調整する → (4) `scripts/check_deck.py` で FAIL 0 にする、の順で規約が常に上位に立ちます。型カタログ・テンプレート・パイプラインはすべて「規約を効率よく満たすための道具」であり、**スライドを型に合わせるのではなく、型をストーリーに合わせて選び、合わなければ捨てて自由に組みます。**

## 2つの作り方（本線は自由記述）

| レーン | 使いどころ | 道具 |
| --- | --- | --- |
| **A. 自由記述（本線）** | 納品物・こだわるデッキ全般。1枚ごとに構成を考えて組む | `templates/freeform_parts_16x9.html` をコピーし、不要パーツを消して差し替える。62型カタログは「レイアウトの発想帳」として眺めるだけ |
| B. SlideSpecパイプライン | 数十秒でたたき台が欲しいとき・定型レポートの量産・編集可能PPTXが要るとき | SlideSpec（JSON）→ HTML → QA → PPTX の自動生成 |

**品質を決めるのは規約と調整であり、型ではない。** パイプラインは型のスロットに文言を流し込むことしかできないので、
「この型のままでよいか」を1枚ごとに疑い、収まらないと感じたらAレーンでそのスライドだけ自由に組み直す。
判断に迷ったら常に slide-rules.md に立ち返り、調整で受けた指摘は slide-rules.md に1行ずつ追記して蓄積する。

## 同梱物

| もの | パス |
| --- | --- |
| 生成パイプライン（Node製） | `pipeline/`（validate / render / qa / export） |
| 型カタログ（62型・入口はここ） | `assets/SlideCatalog_16x9.pdf`（P.2が索引。右下の PPTX / HTML が生成経路） |
| 63型のSlideSpec正本（36＋パーツ由来27） | `pipeline/slide-spec/super_template.json` |
| SlideSpecスキーマ | `pipeline/slide-spec/schema.json` |
| スライド設計規約（正典） | `references/slide-rules.md` |
| 自由記述パーツテンプレ（本線Aレーン用） | `templates/freeform_parts_16x9.html`（表紙・全体マップ・矢羽・前提→帰結2カラム・スタット・軸のある表など10パーツ。ニュートラル配色） |
| フレッシュアイ・レビューの指示文（納品前に文脈を共有しない別エージェントで読み合わせ） | `references/content-review-prompt.md` |
| 機械チェックスクリプト | `scripts/check_deck.py`（PPTXを検査するときのみ `pip3 install python-pptx` が必要。HTML検査は標準ライブラリのみ） |
| PPTX見本帳 | `assets/SuperTemplate_62type.pptx`（カタログと同じ70枚。全スライドがネイティブ図形・編集可能） |

## 規約の要点（全文は references/slide-rules.md — 作成前に必読）

約80項目のうち、毎回効く原則を抜粋する。**このダイジェストは入口にすぎず、作成前に必ず全文を読む。**

- **タイトル**: 結論を書く・1行が基本で長ければ2行可（文字を縮小して1行に詰めない）・体言止め（です/ます禁止）・タイトルだけ通し読みして1本のストーリーになること
- **レイアウト**: 1スライド=1メッセージ。上下に読ませず左右に分ける（左=事実・図、右=意味合い）。下部の「POINT」帯禁止
- **表**: カード羅列でなく行=項目・列=観点の「軸のある表」。ヘッダーは本文より大きく太字・塗りなし・最終行の下に罫線なし
- **装飾**: 角丸禁止・塗りボックスに枠線なし・色分けするなら同一スライドに凡例
- **図**: 推移・構成比・分布はグラフで描く。テンプレの表パーツに流し込んで済ませない（§5.11）
- **数**: タイトルに「3段階」と書いたら本文の連番と一致させる。食い違うと機械チェックが FAIL（§2.9）
- **文章**: 1資料1用語（表記ゆれ禁止）・略語は初出でフル表記・ブレット語尾は階層内で統一

## デッキ作成の手順（実運用フロー）

共通の手順1のあと、**Aレーン（自由記述）は手順A、Bレーン（パイプライン）は手順2〜4**に進む。

1. **作る前に定義する（Define-before-Produce）**: 目的・成果物の定義・スコープIN/OUTを3〜5行で先に合意する。前提が薄いまま豪華な体裁で出すのが最悪の失敗。
   - 続けて **ストーリーライン（1枚1行のタイトル列）** を書き、**各行に見せ方を併記する**（図／表／矢羽／2カラム／数値カード）。推移・構成比・分布・相関は必ず「図」にする。ここで「図」と決めたページは、テンプレートのパーツに流し込まず自分で描く。

**手順A（自由記述レーン — 本線）**
- `templates/freeform_parts_16x9.html` をコピーし、不要な section を消して差し替える。62型カタログはレイアウトの発想帳として眺めるだけでよい。
- **グラフが要るページはテンプレートのパーツを捨てて自分で描く。** 推移や構成比を表・数値の羅列で代替すると、体裁は整うのに主張が図から読めなくなる（同一プロンプトの比較検証で、テンプレートを持たせた側だけがグラフを描かなかった）。
- 出力後は `python3 scripts/check_deck.py mydeck.html` で FAIL 0 にする（表紙・裏表紙の「タイトル空」WARNは許容）。
- `node scripts/check_layout.mjs mydeck.html` でフッター重なり・はみ出しの実レンダリング検査も FAIL 0 にする（要 playwright）。
- **フレッシュアイ・レビュー（最終工程）**: `references/content-review-prompt.md` の指示文を、作り方を伏せて文脈を共有しない別のエージェント（Agent ツールか新しいセッション）に渡し、デッキのファイル（HTML／PDF／PPTX）をそのまま読ませる（画像化は不要）。微妙な日本語の言い回し・論理展開の飛び・タイトルの数と本文の数の食い違い・タイトルと図の結論の食い違い・根拠のない評価語・既出ページの焼き直しは、機械チェックでは拾えず作った本人にも見えない。返ってきた指摘を採否表（採用／不採用／保留＋理由）にし、採用分だけ直して機械チェックを再実行する。
- PDF化して全ページ目視する。例:
  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
    --no-pdf-header-footer --print-to-pdf=mydeck.pdf mydeck.html   # @page 設定済み・ページ数=スライド数
  ```
- 以降の手順2〜4はBレーン専用なので読み飛ばしてよい。
2. ストーリーに合わせてカタログから型を選ぶ。**枠組み → 証拠 → 比較 → 構造 → 計画** の順が基本形。
3. `pipeline/slide-spec/super_template.json` から該当する型のスライド定義をコピーして新しいSlideSpec（JSON）を作り、文言・データを実物に差し替える。
   - `title` は12字以上・主張文（体言止め）。`source` 行は必須。プレースホルダー（Text N / ラベルN）を1つも残さない。
   - **日本語デッキでは表ヘッダーを必ず日本語化する**: `comparison_table` / `scenario_table` / `risk_table` / `cause_effect` はスライドに `"headers": {...}` を付けて列名を差し替える（例: `{"case": "シナリオ", "outcome": "想定される展開", "assumptions": "前提", "implication": "含意"}`。キーは `schema.json` の headers 定義を参照）。英語デフォルトのまま納品しない。
4. **パイプラインでビルド**（初回のみ `cd pipeline && npm run setup`）:
   ```bash
   cd pipeline
   node scripts/validate_spec.mjs slide-spec/mydeck.json          # スキーマ検証
   node scripts/render_spec_to_html.mjs slide-spec/mydeck.json generated/mydeck.html   # HTMLプレビュー
   node scripts/qa_html_deck.mjs generated/mydeck.html            # 構造QA
   node scripts/export_spec_to_editable_pptx.mjs slide-spec/mydeck.json generated/mydeck.pptx  # 編集可能PPTX
   ```
5. **調整（ここが本番）**: HTMLプレビューを見ながら、型に囚われず考えて直す。表を2枚に割る、右カラムを帰結形に書き直す、粒度の揃わない並列を書き直す。1枚ごとに「この型のままでよいか」を疑う。受けた指摘は slide-rules.md に1行追記する。
6. **機械チェック**: `python3 scripts/check_deck.py generated/mydeck.pptx` を実行し、FAIL 0 にする。出力されるタイトル一覧を上から通し読みして、1本のストーリーになっているか確認する。
7. **内容レビュー**: `references/content-review-prompt.md` の指示文で、作り方を伏せた別エージェントに全ページを読ませ、指摘を採否判断して直す（手順Aと同じ）。
8. **目視QA**: PDF化して全ページを確認する。文字だけでなく余白・版面バランス・孤立折返し・はみ出し・左右カラムの下端揃いも見る。

書き出したPPTXは全図形がネイティブ編集可能（`editable: true`）。納品後の微修正はPowerPoint上でそのままできる。

## 型カタログ — レイアウトの発想帳（型ID / 使いどころ）

まず SlideSpec 由来の36型。パーツ由来の27型は下の表。

型は「合わせる対象」ではなく「見せ方を思いつくための引き出し」。Bレーンでの型選定と、Aレーンでのレイアウト着想の両方に使う。

各スライド共通フィールド: `kicker`（左上の小見出し）/ `title`（**12字以上・主張を書く**）/ `source`（出典行・必須）。
フィールドの実例値（数値の形・series構造など）は `super_template.json` の該当スライドを**その型だけ**読んで確認する。

| # | 型ID | 使いどころ |
| --- | --- | --- |
| 0 | `cover` | 表紙 |
| 1 | `executive_summary` | 冒頭で結論と論点を一望させる場合 |
| 2 | `evidence_basis` | この資料が何に基づくかを冒頭で示す場合 |
| 3 | `big_stat_pair` | 大型数値2つで規模やインパクトを対比する場合 |
| 4 | `kpi_dashboard` | 主要KPIを一覧で示す場合 |
| 5 | `chart_insight` | 1つのチャートで主張を証明し、含意を添える場合 |
| 6 | `stacked_bar` | 構成の変化を積み上げ棒で示す場合 |
| 7 | `waterfall` | 増減の寄与をブリッジで示す場合 |
| 8 | `true_waterfall` | 起点から着地までの増減を厳密なブリッジで示す場合 |
| 9 | `small_multiples` | 同じ図法を並べて切り口違いで比較する場合 |
| 10 | `comparison_table` | 複数の選択肢を評価軸で比較する場合 |
| 11 | `scenario_table` | シナリオ別の前提と結果を並べる場合 |
| 12 | `risk_table` | リスク・兆候・打ち手を整理する場合 |
| 13 | `horizontal_axis_table` | 横軸に項目を並べて評価する場合 |
| 14 | `heatmap_table` | 濃淡で強弱を一覧表示する場合 |
| 15 | `matrix_2x2` | 2つの軸で位置づけを整理する場合 |
| 16 | `process_matrix` | プロセスと観点の掛け合わせで整理する場合 |
| 17 | `nested_row_matrix` | 入れ子の行構造で階層を示す場合 |
| 18 | `timeline_matrix` | 時系列と項目のマトリクスで示す場合 |
| 19 | `theme_card_grid` | 複数のテーマをカードで並べる場合 |
| 20 | `recommendation_pillars` | 複数の提言を柱立てで示す場合 |
| 21 | `numbered_imperatives` | やるべきことを番号付きで示す場合 |
| 23 | `scr` | Situation・Complication・Resolution（状況・難しさ・解決）の3段で語る場合 |
| 24 | `issue_to_solution_map` | 課題と解決策を対応付ける場合 |
| 25 | `issue_cause_solution` | 課題から原因、解決策へ流れで示す場合 |
| 26 | `issue_tree` | 課題をツリーで分解する場合 |
| 28 | `current_target_state` | 現状と目指す姿を対比する場合 |
| 29 | `calc_flow` | 計算ロジックを式の流れで示す場合 |
| 30 | `process_flow` | プロセスの流れを段階で示す場合 |
| 31 | `cycle` | 循環するサイクル構造を示す場合 |
| 32 | `chevron_rail` | 段階の進行を矢羽（シェブロン）で示す場合 |
| 33 | `chevron_value_chain` | バリューチェーン全体を示す場合 |
| 34 | `decision_fork` | 分岐する選択肢と判断を示す場合 |
| 35 | `roadmap` | 実行ロードマップを示す場合 |
| 36 | `gantt` | スケジュールをガントチャートで示す場合 |
| 37 | `decision_page` | 意思決定を求める場合 — 決めること・前提・依頼 |

## おまけ: テンプレPPTX見本帳の使い方

`assets/SlideCatalog_16x9.pdf` は自由記述パーツ由来の27型も含めた62型の統合カタログ、`assets/SuperTemplate_62type.pptx` はその PPTX 版（全スライド編集可能。型を選んだらここからスライドをコピーするか、SlideSpec に書いてパイプラインで出す）。

## パーツ由来の27型（SlideSpec では `parts` に中身を書く）

実装は `pipeline/scripts/archetypes/<id>.mjs`。各モジュールの `example` がそのままプレースホルダー入りの見本で、`super_template.json` にも収録済み。

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

- 型選定時の**目視カタログ**として眺める
- Node環境が無い場合の**手動フォールバック**として、該当スライドをコピーして文言を差し替える
のどちらでも使える。ただし品質の再現性はSlideSpecパイプライン経由のほうが高い。

## カラーカスタマイズ

デフォルトはニュートラルなネイビー系。SlideSpecのルートに `palette` オブジェクトを入れると全スライドのブランドカラーを一括で差し替えられる（`schema.json` 参照）。その際も以下は守る:

- 意味を持つ色（✕の赤・追加の緑など）は変換しない
- 2系列の区別が要る図では、メインカラー×グレー系の2色に抑える
- 製品UIのスクリーンショットは無加工
