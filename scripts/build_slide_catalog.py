#!/usr/bin/env python3
"""統合カタログ（62型）を組み立てる。出力は2本:
  SlideCatalog_16x9.pdf      … 見る側（70ページ）
  SuperTemplate_62type.pptx  … コピーして使う側。70枚すべてネイティブ図形（編集可能）。スライド番号＝カタログのページ番号

  python3 scripts/build_slide_catalog.py [出力先ディレクトリ=assets]

前提: `pipeline/` で `npm run setup` 済み、`pip3 install python-pptx pymupdf`、LibreOffice（soffice）が PATH にあること。
ghostscript（gs）があれば PDF を圧縮する（無ければそのまま）。

仕組み:
  pipeline/slide-spec/super_template.json（36型＋自由記述パーツ由来27型＝63型の正本）から、カタログ順（6章）に並べた
  SlideSpec を組み立て、pipeline/scripts/export_spec_to_editable_pptx.mjs で1本のPPTXに書き出す。表紙・章扉は title_page /
  section_divider 型、索引は python-pptx で表として差し込む。PDF は LibreOffice でその PPTX から変換する。
  HTML 経路（templates/freeform_parts_16x9.html）と PPTX 経路の両方で出せるパーツには経路ラベル「PPTX・HTML」、
  SlideSpec のみの型には「PPTX」をフッターに刷る。
"""
import json, os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIPE = os.path.join(ROOT, "pipeline")
DECK_NAME = "スライド型カタログ"
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets")
SPEC_PATH = os.path.join(PIPE, "slide-spec", "super_template.json")
IDS_PATH = os.path.join(PIPE, "scripts", "archetypes", "_ids.json")

# 日本語フォントを LibreOffice に見せる（macOS。素のままだと日本語が全部落ちる）。
# Linux で使うときは <dir> を自環境のフォントディレクトリに書き換える。
FONTS_CONF = """<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
<dir>/Library/Fonts</dir><dir>/System/Library/Fonts</dir><dir>/System/Library/Fonts/Supplemental</dir>
<dir>~/Library/Fonts</dir><dir>/System/Library/AssetsV2</dir><cachedir>{cache}</cachedir>
<alias binding="strong"><family>Yu Gothic</family><prefer><family>Yu Gothic</family><family>YuGothic</family><family>Hiragino Sans</family></prefer></alias>
<alias binding="strong"><family>Yu Mincho</family><prefer><family>Yu Mincho</family><family>YuMincho</family><family>Hiragino Mincho ProN</family></prefer></alias>
<alias binding="strong"><family>Yu Mincho Demibold</family><prefer><family>Yu Mincho Demibold</family><family>YuMincho</family><family>Yu Mincho</family><family>Hiragino Mincho ProN</family></prefer></alias>
</fontconfig>"""

# カタログは HTML パーツ集（ブラウン系）と配色を揃える。SlideSpec に palette が無いときだけ注入する。
# 生成デッキの既定色（ネイビー）は変えない。自社色にするときは SlideSpec ルートの palette を使う。
CATALOG_PALETTE = {"ink": "322014", "navy": "322014", "blue": "5A3921", "cyan": "C5A681", "muted": "8A7B6B",
                   "hair": "E2DCD2", "rose": "A22727", "softBlue": "EFEEE8", "green": "5A3921", "warning": "C5A681"}

S, P = "S", "P"  # S=SlideSpec 36型 / P=自由記述パーツ由来（HTML と PPTX の両経路）
CATS = [
    ("A", "枠組み", "資料の器をつくる（表紙・全体像・目次・章扉・土台・裏表紙）"),
    ("B", "数字で証明", "1枚1図で主張を裏づける"),
    ("C", "比較・評価", "選択肢や対象を軸で並べて優劣・強弱を見せる"),
    ("D", "構造で通す", "データがない主張を構造で説明する"),
    ("E", "進め方・計画", "段階・時間軸・因果で「どう進むか」を示す"),
    ("F", "提示・締め", "テーマの列挙、外部根拠、意思決定"),
]
ORDER = {
    "A": [(P,1,'表紙'),(P,2,'全体マップ'),(P,3,'目次'),(P,4,'章扉'),(P,27,'セパレーター（アジェンダ再掲）'),
          (S,'executive_summary','エグゼクティブサマリー'),(S,'evidence_basis','調査の土台'),(P,25,'調査の土台'),(P,10,'裏表紙')],
    "B": [(S,'chart_insight','単一チャート＋含意'),(S,'stacked_bar','積み上げ棒'),(S,'waterfall','寄与度ブリッジ'),(S,'true_waterfall','増減ブリッジ（厳密）'),
          (S,'small_multiples','小図の並列比較'),(P,24,'シナリオ線＋成長率チップ'),(P,23,'増減の縦棒＋左右合計'),
          (P,22,'比例円の対比'),(P,17,'分布の順位棒＋注記'),(P,18,'注記つき散布図'),
          (S,'big_stat_pair','大型数値の対比'),(S,'kpi_dashboard','KPI一覧'),(P,7,'大型数値の表＋読み取り')],
    "C": [(S,'comparison_table','選択肢の比較表'),(S,'scenario_table','シナリオ比較表'),(S,'risk_table','リスク一覧表'),(S,'horizontal_axis_table','横軸評価表'),
          (S,'heatmap_table','ヒートマップ表'),(S,'matrix_2x2','2×2マトリクス'),(P,9,'軸のある表'),
          (P,14,'充足度評価表（ハーベイボール）'),(P,13,'状態ヒートマップ＋右コメント'),
          (P,12,'打ち手の効果表'),(P,16,'進捗バブル行列'),(P,15,'割合のドットマトリクス')],
    "D": [(P,11,'主張パネル＋図'),(S,'process_matrix','プロセス×観点の行列'),(S,'nested_row_matrix','入れ子行の行列'),(S,'timeline_matrix','時系列マトリクス'),
          (S,'issue_tree','イシューツリー'),(S,'scr','Situation・Complication・Resolution'),(S,'issue_to_solution_map','課題と打ち手の対応'),
          (P,26,'課題と打ち手の2カラム'),(S,'issue_cause_solution','課題→原因→解決'),(S,'current_target_state','現状と目指す姿'),
          (S,'calc_flow','計算ロジックの流れ'),(P,19,'柱＋土台'),(P,20,'対向シェブロン')],
    "E": [(S,'process_flow','プロセスの段階'),(S,'cycle','循環サイクル'),(S,'chevron_rail','矢羽の段階'),(P,5,'矢羽（プロセス・変遷）'),
          (S,'chevron_value_chain','バリューチェーン'),(S,'decision_fork','分岐と判断'),(P,6,'前提→帰結の2カラム'),
          (S,'roadmap','ロードマップ'),(S,'gantt','ガントチャート')],
    "F": [(S,'theme_card_grid','テーマカード'),(S,'recommendation_pillars','提言の柱'),(S,'numbered_imperatives','番号つき打ち手'),
          (P,8,'並列カード 2×2'),(P,21,'外部動向の根拠グリッド'),(S,'decision_page','意思決定ページ')],
}
LANE = {S: "PPTX", P: "PPTX・HTML"}
COVER_SUB = "型を選ぶ発想帳。作成の主軸は規約 slide-rules.md"
COVER_LEAD = ("各ページのタイトル欄は型名。見本の主張文は置いていない。実デッキではストーリーラインから起こした主張文に必ず差し替える（slide-rules §2.8）。"
              "右下の「PPTX」「PPTX・HTML」はその型を出せる経路。すべて SlideSpec から編集可能PPTXで書き出せ、パーツ由来の型は自由記述HTMLでも組める。")


def run(cmd, **kw):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)


def load_spec():
    spec = json.load(open(SPEC_PATH, encoding="utf-8"))
    by_id = {sl["template"]: sl for sl in spec["slides"]}
    part_ids = {e["part"]: e["id"] for e in json.load(open(IDS_PATH, encoding="utf-8"))}
    return spec, by_id, part_ids


def build_plan(by_id, part_ids):
    """("divider", code, name, desc, page) / ("page", template_id, 型名, lane, page, cat)。page は 1=表紙, 2=索引 の後から。"""
    plan, page, missing = [], 2, []
    for code, name, desc in CATS:
        page += 1
        plan.append(("divider", code, name, desc, page))
        for src, key, tname in ORDER[code]:
            tid = key if src == S else part_ids[key]
            if tid not in by_id:
                missing.append((tid, tname))
                continue
            page += 1
            plan.append(("page", tid, tname, LANE[src], page, code))
    return plan, missing


def catalog_spec(spec, by_id, plan):
    ntypes = sum(1 for e in plan if e[0] == "page")
    slides = [
        {"template": "title_page", "kicker": f"16:9 ｜ {ntypes}型", "title": DECK_NAME,
         "parts": {"title": DECK_NAME, "subtitle": COVER_SUB, "lead": COVER_LEAD}},
        # 索引: ページ番号を合わせるための場所取り。postprocess() が本文を表に置き換える
        {"template": "section_divider", "kicker": "索引", "title": "収録している型", "parts": {"no": "", "title": "収録している型"}},
    ]
    for e in plan:
        if e[0] == "divider":
            _, code, name, desc, _pg = e
            slides.append({"template": "section_divider", "kicker": code, "title": name, "parts": {"no": code, "title": name, "desc": desc}})
        else:
            slides.append(dict(by_id[e[1]]))
    return {"deckTitle": DECK_NAME, "palette": spec.get("palette") or CATALOG_PALETTE, "slides": slides}


def postprocess(pptx_path, plan, out_path):
    """索引ページを表に置き換え、フッターに経路ラベルを刷る。"""
    from lxml import etree
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.enum.text import PP_ALIGN
    from pptx.dml.color import RGBColor

    NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
    prs = Presentation(pptx_path)
    W = prs.slide_width
    ink, muted, accent = RGBColor(0x32, 0x20, 0x14), RGBColor(0x8A, 0x7B, 0x6B), RGBColor(0x5A, 0x39, 0x21)
    slides = list(prs.slides)

    def textbox(slide, text, x, y, w, h, size, font, color, bold=False, align=PP_ALIGN.LEFT):
        tb = slide.shapes.add_textbox(x, y, w, h)
        tf = tb.text_frame; tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]; p.alignment = align
        r = p.add_run(); r.text = text; r.font.size = Pt(size); r.font.name = font; r.font.color.rgb = color; r.font.bold = bold
        return tb

    # ── 索引（スライド2）: 章扉型の本文（章番号・大見出し）を消して、タイトル＋3列の表にする
    idx = slides[1]
    for sh in list(idx.shapes):
        if sh.has_text_frame and Inches(1.2) < sh.top < Inches(6.6):
            sh._element.getparent().remove(sh._element)
    textbox(idx, "収録している型", Inches(0.63), Inches(1.0), Inches(12.07), Inches(0.55), 22, "Yu Mincho", ink, bold=True)
    rows = [(e[5], e[2], e[3], e[4]) for e in plan if e[0] == "page"]  # cat, name, lane, page
    per = (len(rows) + 2) // 3
    cols = [rows[i * per:(i + 1) * per] for i in range(3)]
    x0, y0, wtot, gap = Inches(0.63), Inches(1.72), Inches(12.07), Inches(0.28)
    colw = int((wtot - gap * 2) / 3)
    rh = Inches(0.21)
    for ci, col in enumerate(cols):
        gx = int(x0 + ci * (colw + gap))
        shape = idx.shapes.add_table(per, 4, gx, y0, colw, rh * per)
        tbl = shape.table
        tblPr = shape._element.graphic.graphicData.tbl.tblPr
        tblPr.set("firstRow", "0"); tblPr.set("bandRow", "0")
        style = tblPr.find(f"{{{NS}}}tableStyleId")
        if style is not None:
            tblPr.remove(style)
        widths = [Inches(0.28), colw - Inches(0.28) - Inches(0.95) - Inches(0.5), Inches(0.95), Inches(0.5)]
        for k, wv in enumerate(widths):
            tbl.columns[k].width = int(wv)
        for ri in range(per):
            tbl.rows[ri].height = rh
            vals = col[ri] if ri < len(col) else ("", "", "", "")
            texts = [vals[0], vals[1], vals[2], f"P.{vals[3]}" if vals[3] != "" else ""]
            for k, t in enumerate(texts):
                cell = tbl.cell(ri, k)
                cell.margin_left = cell.margin_right = Inches(0.02); cell.margin_top = cell.margin_bottom = Inches(0.0)
                cell.fill.background()
                p = cell.text_frame.paragraphs[0]
                r = p.add_run(); r.text = str(t)
                r.font.size = Pt(8.2 if k in (0, 1) else 7.2)
                r.font.name = "Yu Mincho" if k == 0 else "Yu Gothic"
                r.font.bold = (k == 0)
                r.font.color.rgb = accent if k == 0 else (ink if k == 1 else muted)
                p.alignment = PP_ALIGN.RIGHT if k >= 2 else PP_ALIGN.LEFT
                tcPr = cell._tc.get_or_add_tcPr()
                for side in ("lnL", "lnR", "lnT", "lnB"):
                    on = side == "lnB" and ri < per - 1 and ri < len(col) - 1
                    ln = etree.SubElement(tcPr, f"{{{NS}}}{side}", w="6350" if on else "0")
                    if on:
                        sf = etree.SubElement(ln, f"{{{NS}}}solidFill"); etree.SubElement(sf, f"{{{NS}}}srgbClr", val="E2DCD2")
                    else:
                        etree.SubElement(ln, f"{{{NS}}}noFill")

    # ── 経路ラベル: フッター右端のページ番号の左に刷る
    lanes = {e[4]: e[3] for e in plan if e[0] == "page"}
    for i, slide in enumerate(slides, start=1):
        lane = lanes.get(i)
        if not lane:
            continue
        for sh in slide.shapes:
            if sh.has_text_frame and sh.text_frame.text.strip() == str(i) and sh.left > W * 0.8:
                textbox(slide, lane, sh.left - Inches(1.35), sh.top, Inches(1.3), sh.height, 7.5, "Yu Gothic", muted, align=PP_ALIGN.RIGHT)
                break
    prs.save(out_path)
    return len(slides)


def main():
    spec, by_id, part_ids = load_spec()
    plan, missing = build_plan(by_id, part_ids)
    if missing:
        print("warn: super_template.json に未収録の型（カタログから除外）: " + ", ".join(f"{t}({n})" for t, n in missing), file=sys.stderr)
    tmp = tempfile.mkdtemp(prefix="slidecatalog-")
    cat_spec = os.path.join(tmp, "catalog_spec.json")
    json.dump(catalog_spec(spec, by_id, plan), open(cat_spec, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    raw_pptx = os.path.join(tmp, "catalog_raw.pptx")
    run(["node", os.path.join(PIPE, "scripts", "export_spec_to_editable_pptx.mjs"), cat_spec, raw_pptx], cwd=PIPE)

    os.makedirs(OUT_DIR, exist_ok=True)
    pptx_out = os.path.join(OUT_DIR, "SuperTemplate_62type.pptx")
    n = postprocess(raw_pptx, plan, pptx_out)

    cache = os.path.join(tmp, "fccache"); os.makedirs(cache, exist_ok=True)
    conf = os.path.join(tmp, "fonts.conf"); open(conf, "w").write(FONTS_CONF.format(cache=cache))
    env = dict(os.environ, FONTCONFIG_FILE=conf)
    run(["soffice", f"-env:UserInstallation=file://{tmp}/lo", "--headless", "--convert-to", "pdf", "--outdir", tmp, pptx_out], env=env)
    raw_pdf = os.path.join(tmp, "SuperTemplate_62type.pdf")
    final = os.path.join(OUT_DIR, "SlideCatalog_16x9.pdf")
    try:
        run(["gs", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", "-dPDFSETTINGS=/prepress", "-dNOPAUSE", "-dQUIET", "-dBATCH",
             "-dSubsetFonts=true", f"-sOutputFile={final}", raw_pdf])
    except Exception:
        shutil.copy(raw_pdf, final)
    ntypes = sum(1 for e in plan if e[0] == "page")
    print(f"{final}  ({n}p, {os.path.getsize(final)/1e6:.1f}MB, {ntypes}型)")
    print(f"{pptx_out}  ({n} slides, all native)")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
