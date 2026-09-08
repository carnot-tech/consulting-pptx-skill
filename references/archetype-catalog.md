# 型カタログ（レイアウトの発想帳）: 62型の型ID・使いどころ・フィールド仕様

> **型は「合わせる対象」ではなく「見せ方を思いつくための引き出し」。** 規約の正典は `slide-rules.md` で、型はそれを効率よく満たすための道具にすぎない。ストーリーに合う型がなければ捨てて、`templates/freeform_parts_16x9.html` で自由に組む。
>
> 読むタイミング: Bレーン（SlideSpecパイプライン）で型を選ぶとき、またはAレーン（自由記述）でレイアウトの着想が欲しいとき。毎回通読する必要はなく、目視で探すなら `assets/SlideCatalog_16x9.pdf`（P.2が索引）のほうが速い。

構成は2群。SlideSpec 由来の36型（§1）と、自由記述パーツ集から SlideSpec の型として実装した27型（§2）。合計62型（表紙を除く）で、どの型も `pipeline/slide-spec/super_template.json` に完成 SlideSpec が入っており、`npm run export` で編集可能PPTXになる。

## 1. SlideSpec 由来の36型（型ID / 使いどころ）

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

## 2. パーツ由来の27型（SlideSpec では `parts` に中身を書く）

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

## 3. テンプレPPTX見本帳の使い方

`assets/SlideCatalog_16x9.pdf` は自由記述パーツ由来の27型も含めた62型の統合カタログ、`assets/SuperTemplate_62type.pptx` はその PPTX 版（全スライド編集可能。型を選んだらここからスライドをコピーするか、SlideSpec に書いてパイプラインで出す）。

- 型選定時の**目視カタログ**として眺める
- Node環境が無い場合の**手動フォールバック**として、該当スライドをコピーして文言を差し替える
のどちらでも使える。ただし品質の再現性はSlideSpecパイプライン経由のほうが高い。
