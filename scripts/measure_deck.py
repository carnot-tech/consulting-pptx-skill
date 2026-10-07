#!/usr/bin/env python3
"""既存の PowerPoint 資料の書式を測り、skin.json に書き出す。

使い方:
  python3 measure_deck.py house.pptx                 # 要約を表示し、house.skin.json を同じフォルダに出力
  python3 measure_deck.py house.pptx -o skin.json
  python3 measure_deck.py house.potx                 # PowerPoint テンプレート（.potx）も測れる

出力は deck_pptx.py（その資料のマスターの上にページを組む）と check_deck.py --house（書式が合っているかの検査）が読む。
測るのは、本文ページで最も使われているレイアウトとタイトル・副題の枠、文字の大きさ、書体を run に直指定しているか、
テキストボックスの余白と段組み（lstStyle）、罫線の色と太さ、表オブジェクトの有無、強調と面の色、ページ番号の出どころ。

色は役割（強調・面・丸）ごとに多い順で 3 つまで候補を残し（color_options）、組む側で選べる。
資料が HEX で書いた色でも、テーマ色かその明暗（PowerPoint の「明るく 40%」等）と一致すればテーマ色に置き換える。
こうしておくと、差し込んだ先のテーマが変わっても色が付いてくる。
値は機械的に拾った出発点。資料を目で見て確かめてから使う（slide-rules §8.7）。
依存: python-pptx。
"""
import collections
import colorsys
import json
import re
import sys
import zipfile
from pathlib import Path

EMU = 914400
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
NEUTRAL = {"tx1", "bg1", "dk1", "lt1", "000000", "FFFFFF"}
NG_RED = "FF0000"   # ✕ の赤。意味を持つ赤はブランドに寄せない（§5.8）。skin の colors.ng で変えられる
# PowerPoint の色の選択肢に並ぶ明暗（lumMod, lumOff）。HEX の色をテーマ色に読み替えるときに試す
TINTS = [(None, None), (20000, 80000), (40000, 60000), (60000, 40000), (75000, None), (50000, None),
         (50000, 50000), (65000, 35000), (75000, 25000), (85000, 15000), (95000, 5000),
         (95000, None), (85000, None), (65000, None), (90000, None)]
SLOTS = ("tx1", "bg1", "tx2", "bg2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6")


def inch(v):
    return None if v is None else round(v / EMU, 2)


def color_spec(el):
    """<a:solidFill> を持つ要素から "accent2|lumMod=20000|lumOff=80000" の形を作る。無ければ None。"""
    fill = el.find(A + "solidFill") if el is not None else None
    if fill is None or not len(fill):
        return None
    c = fill[0]
    name = c.get("val")
    if name is None:
        return None
    if c.tag == A + "srgbClr":
        name = name.upper()
    return "|".join([name] + [f"{ch.tag[len(A):]}={ch.get('val')}" for ch in c if ch.tag[len(A):] != "alpha"])


def theme_colors(theme_xml, master_xml):
    """スライドで使う名前（tx1・accent2 等）→ その資料のテーマでの HEX。マスターの clrMap を通して引く。"""
    slots = {}
    for slot, body in re.findall(r"<a:(dk1|lt1|dk2|lt2|accent\d|hlink|folHlink)>(.*?)</a:\1>", theme_xml, re.S):
        m = re.search(r'(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"', body)
        if m:
            slots[slot] = m.group(1).upper()
    cmap = dict(re.findall(r'\b(bg1|tx1|bg2|tx2)="(\w+)"', (re.search(r"<p:clrMap[^>]*>", master_xml) or [""])[0]))
    cmap = {**{"bg1": "lt1", "tx1": "dk1", "bg2": "lt2", "tx2": "dk2"}, **cmap}
    return {name: slots.get(cmap.get(name, name)) for name in SLOTS if slots.get(cmap.get(name, name))}


def _tint(hexv, mod, off):
    r, g, b = (int(hexv[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(1.0, max(0.0, l * (mod or 100000) / 100000 + (off or 0) / 100000))
    return tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, l, s))


def to_theme(spec, theme):
    """HEX の色（"808080"）が、テーマ色かその明暗と一致すればテーマ色の書き方に直す。一致しなければそのまま。"""
    if not spec or not re.fullmatch(r"[0-9A-F]{6}", spec):
        return spec
    want = tuple(int(spec[i:i + 2], 16) for i in (0, 2, 4))
    for mod, off in TINTS:
        for name, hexv in theme.items():
            if max(abs(a - b) for a, b in zip(_tint(hexv, mod, off), want)) <= 2:
                return "|".join([name] + ([f"lumMod={mod}"] if mod else []) + ([f"lumOff={off}"] if off else []))
    return spec


def top(counter, skip=(), n=1):
    items = [k for k, _ in counter.most_common() if k not in skip]
    return (items[0] if items else None) if n == 1 else items[:n]


def measure(path):
    from lxml import etree
    from pptx.enum.shapes import PP_PLACEHOLDER
    from pptx_open import open_presentation

    prs = open_presentation(path)   # .potx（テンプレート）もそのまま測れる
    sw, sh = prs.slide_width, prs.slide_height
    slides = list(prs.slides)
    if not slides:
        sys.exit("スライドが 1 枚もない資料は測れない（書式は実際のページから読む）")

    # ---- 本文ページで最も使われている、タイトル枠のあるレイアウト
    use = collections.Counter(s.slide_layout.name for s in slides)
    with_title = {l.name: l for l in prs.slide_layouts
                  if any(ph.placeholder_format.type in (PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE)
                         for ph in l.placeholders)}
    layout_name = next((n for n, _ in use.most_common() if n in with_title), None)
    title, subtitle = None, None
    if layout_name:
        lay = with_title[layout_name]
        master_sz = re.search(r"<p:titleStyle>.*?<a:defRPr[^>]*\bsz=\"(\d+)\"",
                              etree.tostring(lay.slide_master._element, encoding="unicode"), re.S)
        for ph in lay.placeholders:
            kind = ph.placeholder_format.type
            geo = dict(x=inch(ph.left), y=inch(ph.top), w=inch(ph.width), h=inch(ph.height))
            if kind in (PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE):
                title = dict(geo, default_size=int(master_sz.group(1)) / 100 if master_sz else None)
            elif kind == PP_PLACEHOLDER.SUBTITLE:
                subtitle = geo

    sizes, bold_sizes, title_sizes = collections.Counter(), collections.Counter(), collections.Counter()
    run_colors, fonts = collections.Counter(), collections.Counter()
    runs_total = runs_font = 0
    insets, lst_styles = collections.Counter(), collections.Counter()
    rule_colors, rule_widths = collections.Counter(), collections.Counter()
    panel_fills, small_fills, palette = collections.Counter(), collections.Counter(), collections.Counter()
    native_tables = slidenum_slides = 0
    tops, bottoms = [], []

    for s in slides:
        root = s._element
        xml = etree.tostring(root, encoding="unicode")
        if s.slide_layout.name == layout_name:
            native_tables += xml.count("<a:tbl>")
        slidenum_slides += 'type="slidenum"' in xml
        for v in re.findall(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', xml):
            palette[v.upper()] += 1
        for v in re.findall(r'<a:schemeClr val="([^"]+)"', xml):
            palette[v] += 1
        if s.shapes.title is not None and s.slide_layout.name == layout_name:
            for para in s.shapes.title.text_frame.paragraphs:
                for r in para.runs:
                    if r.text.strip():
                        title_sizes[r.font.size.pt if r.font.size else (title or {}).get("default_size")] += 1
        floor = (title["y"] + title["h"] - 0.15) * EMU if title else 0
        body = [x for x in s.shapes if not x.is_placeholder and x.top is not None and x.height and x.width
                and x.top >= floor]
        if body and s.slide_layout.name == layout_name:
            tops.append(min(x.top for x in body))
            bottoms.append(max(x.top + x.height for x in body))

        for sp in root.iter(P + "sp"):
            is_ph = sp.find(f"{P}nvSpPr/{P}nvPr/{P}ph") is not None
            spPr = sp.find(P + "spPr")
            txBody = sp.find(P + "txBody")
            is_box = sp.find(f"{P}nvSpPr/{P}cNvSpPr").get("txBox") == "1"
            if txBody is not None and not is_ph:
                for r in txBody.iter(A + "r"):
                    t = r.findtext(A + "t") or ""
                    rPr = r.find(A + "rPr")
                    if not t.strip() or rPr is None:
                        continue
                    runs_total += 1
                    if rPr.get("sz"):
                        sizes[int(rPr.get("sz")) / 100] += len(t)
                        if rPr.get("b") == "1":
                            bold_sizes[int(rPr.get("sz")) / 100] += 1
                    c = color_spec(rPr)
                    if c:
                        run_colors[c] += 1
                    face = [f.get("typeface") for f in (rPr.find(A + "latin"), rPr.find(A + "ea")) if f is not None]
                    face = [f for f in face if f and not f.startswith("+")]
                    if face:
                        runs_font += 1
                        fonts[face[0]] += 1
                if is_box:
                    bp = txBody.find(A + "bodyPr")
                    insets[tuple(int(bp.get(k, d)) for k, d in
                                 (("lIns", 91440), ("tIns", 45720), ("rIns", 91440), ("bIns", 45720)))] += 1
                    ls = txBody.find(A + "lstStyle")
                    lst_styles[etree.tostring(ls, encoding="unicode") if ls is not None and len(ls) else ""] += 1
            if spPr is not None and not is_ph:
                fill = color_spec(spPr)
                ext = spPr.find(f"{A}xfrm/{A}ext")
                geom = spPr.find(A + "prstGeom")
                if fill and ext is not None:
                    w, h = int(ext.get("cx")), int(ext.get("cy"))
                    area = w * h / (sw * sh)
                    if 0.06 <= area < 0.9 and (geom is None or geom.get("prst") == "rect"):
                        panel_fills[fill] += 1
                    elif geom is not None and geom.get("prst") == "ellipse" and max(w, h) <= 0.6 * EMU:
                        small_fills[fill] += 1
        for cx in root.iter(P + "cxnSp"):
            ln = cx.find(f"{P}spPr/{A}ln")
            ext = cx.find(f"{P}spPr/{A}xfrm/{A}ext")
            if ln is None or ext is None or int(ext.get("cy")) != 0:   # 横の罫線だけ
                continue
            c = color_spec(ln)
            if c:
                rule_colors[c] += 1
            if ln.get("w"):
                rule_widths[round(int(ln.get("w")) / 12700, 2)] += 1

    # ---- 文字の大きさ（本文＝最も多い。密＝その下で 5% 以上ある最大のもの。見出し＝本文より大きい太字で最も多いもの）
    total = sum(sizes.values()) or 1
    body_sz = top(sizes)
    smaller = sorted((s for s, n in sizes.items() if body_sz and s < body_sz and n / total >= 0.05), reverse=True)
    head_sz = top(collections.Counter({s: n for s, n in bold_sizes.items() if body_sz and body_sz < s <= body_sz * 2}))

    # ---- 段組み（テキストボックスの過半が同じ lstStyle を持つなら、それを写す）
    lst, bullet_lvl = None, None
    best = top(lst_styles, skip=("",))
    if best and lst_styles[best] / sum(lst_styles.values()) >= 0.3:
        lst = re.sub(r'\s+xmlns:\w+="[^"]+"', "", best)
        for i, lv in enumerate(re.findall(r"<a:lvl\dpPr.*?</a:lvl\dpPr>", lst, re.S)):
            ch = re.search(r'<a:buChar char="([^"]*)"', lv)
            if ch and ch.group(1).strip("​‌‍﻿ "):
                bullet_lvl = i
                break

    theme = ""
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if re.match(r"ppt/theme/theme\d+\.xml$", n)]
        theme = z.read(sorted(names)[0]).decode("utf8", "ignore") if names else ""
        masters = sorted(n for n in z.namelist() if re.match(r"ppt/slideMasters/slideMaster\d+\.xml$", n))
        master = z.read(masters[0]).decode("utf8", "ignore") if masters else ""
        layouts_xml = " ".join(z.read(n).decode("utf8", "ignore") for n in z.namelist()
                               if n.startswith(("ppt/slideLayouts/slideLayout", "ppt/slideMasters/slideMaster")))
    major = re.search(r'<a:majorFont><a:latin typeface="([^"]*)"', theme)
    minor = re.search(r'<a:minorFont><a:latin typeface="([^"]*)"', theme)
    page_number = ("layout" if 'type="slidenum"' in layouts_xml and slidenum_slides < len(slides) / 2
                   else "slide" if slidenum_slides >= len(slides) / 2 else "none")

    row_w = top(rule_widths)
    heavier = [w for w, _ in rule_widths.most_common() if row_w and w > row_w]
    ins = top(insets) or (91440, 45720, 91440, 45720)
    x0 = title["x"] if title else 0.5
    x1 = round(title["x"] + title["w"], 2) if title else round(sw / EMU - 0.5, 2)
    median = lambda v: sorted(v)[len(v) // 2] if v else None  # noqa: E731
    tc = theme_colors(theme, master)

    def options(counter):
        """役割ごとの候補（多い順に 3 つまで・テーマ色に読み替え・重複は 1 つに）"""
        out = []
        for spec in top(counter, skip=NEUTRAL, n=10):
            spec = to_theme(spec, tc)
            if spec not in out and spec.split("|")[0] not in NEUTRAL:
                out.append(spec)
        return out[:3]

    opts = {"emphasis": options(run_colors), "panel": options(panel_fills), "accent": options(small_fills)}
    rule_color = to_theme(top(rule_colors) or "7F7F7F", tc)
    used = {to_theme(v, tc).split("|")[0] for v in palette} | set(palette)

    return {
        "source": Path(path).name,
        "slide": {"w": inch(sw), "h": inch(sh), "emu": [sw, sh]},
        "layout": layout_name,
        "layouts_used": dict(use.most_common(6)),
        "title": dict(title or {}, size=top(title_sizes), sizes_seen=dict(title_sizes.most_common(5))) if title else None,
        "subtitle": subtitle,
        "margin": {"x0": x0, "x1": x1, "body_top": inch(median(tops)),
                   "bottom": min(inch(median(bottoms)) or 99, round(sh / EMU - 0.4, 2))},
        "sizes": {"head": head_sz or body_sz, "body": body_sz, "dense": smaller[0] if smaller else body_sz,
                  "seen": {str(k): v for k, v in sizes.most_common(8)}},
        "fonts": {"inherit": runs_total == 0 or runs_font / runs_total < 0.5,
                  "explicit_share": round(runs_font / runs_total, 2) if runs_total else 0.0,
                  "explicit": top(fonts), "theme_major": major.group(1) if major else None,
                  "theme_minor": minor.group(1) if minor else None},
        "textbox": {"insets": [inch(v) for v in ins], "lst_style": lst, "bullet_level": bullet_lvl},
        "rule": {"color": rule_color, "row": row_w or 0.5,
                 "head": heavier[0] if heavier else (row_w or 0.5) * 2},
        "tables": {"native": native_tables, "slides": len(slides)},
        "colors": dict({k: (v[0] if v else None) for k, v in opts.items()}, ng=NG_RED),
        "color_options": opts,
        "theme_colors": tc,
        "palette": sorted(used),
        "page_number": page_number,
    }


def summary(k):
    t, f, m = k["title"] or {}, k["fonts"], k["margin"]
    lines = [
        f"資料: {k['source']}（{k['slide']['w']} × {k['slide']['h']} in・{k['tables']['slides']} 枚）",
        f"レイアウト: {k['layout']}（使用数 {k['layouts_used']}）",
        f"タイトル: x {t.get('x')} y {t.get('y')} 幅 {t.get('w')} 高さ {t.get('h')}・{t.get('size')}pt"
        f"（既定 {t.get('default_size')}pt、実測 {t.get('sizes_seen')}）" if t else "タイトル: 枠のあるレイアウトが見つからない",
        f"副題: {'y ' + str(k['subtitle']['y']) if k['subtitle'] else 'なし'}",
        f"本文の範囲: x {m['x0']}〜{m['x1']}・上 {m['body_top']}・下 {m['bottom']}",
        f"文字: 見出し {k['sizes']['head']}pt・本文 {k['sizes']['body']}pt・密 {k['sizes']['dense']}pt（実測 {k['sizes']['seen']}）",
        f"書体: {'テーマ任せ（run に書かない）' if f['inherit'] else '直指定 ' + str(f['explicit'])}"
        f"（直指定の割合 {f['explicit_share']}・テーマ {f['theme_major']} / {f['theme_minor']}）",
        f"テキストボックス: 余白 {k['textbox']['insets']}・段組み {'あり（箇条書きは lvl=' + str(k['textbox']['bullet_level']) + '）' if k['textbox']['lst_style'] else 'なし'}",
        f"罫線: {k['rule']['color']}・行間 {k['rule']['row']}pt・見出し下 {k['rule']['head']}pt",
        f"表: 本文ページの表オブジェクト {k['tables']['native']} 個" + ("（テキストボックス＋罫線で組んでいる）" if not k['tables']['native'] else ""),
        f"色: 強調 {k['colors']['emphasis']}・面 {k['colors']['panel']}・丸 {k['colors']['accent']}・✕ {k['colors']['ng']}",
        f"色の候補（d.c(役割, 番号) で選ぶ）: " + "・".join(f"{r} {v}" for r, v in k["color_options"].items()),
        f"ページ番号: {dict(layout='レイアウトが出す（スライドに置かない）', slide='スライドごとに置いている', none='なし')[k['page_number']]}",
    ]
    return "\n".join(lines)


def main():
    args = sys.argv[1:]
    out = None
    if "-o" in args:
        i = args.index("-o")
        out = args[i + 1]
        del args[i:i + 2]
    if not args:
        sys.exit(__doc__)
    src = Path(args[0])
    skin = measure(src)
    out = Path(out) if out else src.with_suffix(".skin.json")
    out.write_text(json.dumps(skin, ensure_ascii=False, indent=2), encoding="utf8")
    print(summary(skin))
    print(f"\n→ {out}（目で見て直してから使う）")


if __name__ == "__main__":
    main()
