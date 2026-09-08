#!/usr/bin/env python3
"""
new_deck.py — 2つのパーツ集から必要なパーツだけを取り出し、1本の自由記述デッキ（HTML）を組み立てる。

  python3 scripts/new_deck.py --parts b01,b02,m05,b06,m10,b09,b10 --title "資料名" -o mydeck.html

  b01〜b27 = templates/freeform_parts_16x9.html（基本パーツ集）のパーツ番号
  m01〜m35 = templates/freeform_parts_more_16x9.html（追加パーツ集）のパーツ番号
  番号は references/archetype-catalog.md と assets/SlideCatalog_16x9.pdf のページ順（基本 P.1〜27、追加 P.28〜62 → m01〜m35）

出力は単体HTML。2つのパーツ集はCSSの設計が違う（基本＝.s / 追加＝.slide）ので、
基本パーツ集の要素セレクタ（h1・table・th・td など）は .s 配下に、追加パーツ集の * / body は .slide 配下に
スコープして結合する。両方のトークン（:root）は同じ値なので、配色・書体は自動で揃う。
ページ番号（フッター）は並び順で振り直す。表紙（b01）・章扉（b04）・裏表紙（b10）は番号を振らない。

  --list   パーツ番号と型名の一覧を表示して終了
"""
import argparse, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / "templates" / "freeform_parts_16x9.html"
MORE = ROOT / "templates" / "freeform_parts_more_16x9.html"


def read(p):
    return p.read_text(encoding="utf-8")


def split_css(html):
    """先頭のHTMLコメント内に「<style>」の文字列があるので、コメント終了（-->）以降の実タグを探す。"""
    start = html.find("-->")
    i = html.index("<style>", start if start >= 0 else 0) + len("<style>")
    j = html.index("</style>", i)
    return html[i:j]


def sections(html, cls):
    """<section class="cls ..."> ... </section> を順に返す（入れ子なし前提）。"""
    return re.findall(rf'<section class="{cls}[^"]*">.*?</section>', html, flags=re.S)


def scope_css(css, prefix, section_classes=()):
    """トップレベルのセレクタをすべて prefix（.s / .slide）配下にスコープする。
    - :root / html / body / @page などはそのまま
    - .deck / .skin-* はセクションの祖先なのでそのまま
    - 先頭が prefix で始まる（.s / .slide…）ものはそのまま
    - 先頭のクラスが section 要素自身に付くクラス（cover / chap / slide--dense …）なら prefix と結合（.s.cover）
    - それ以外は「prefix セレクタ」（子孫）にする
    @media の中は再帰的に処理する。"""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out = []
    i = 0
    n = len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            out.append(css[i:])
            break
        sel = css[i:j]
        depth = 1
        k = j + 1
        while k < n and depth:
            if css[k] == "{":
                depth += 1
            elif css[k] == "}":
                depth -= 1
            k += 1
        body = css[j + 1 : k - 1]
        s = sel.strip()
        if s.startswith("@media") or s.startswith("@supports"):
            out.append(f"{sel}{{{scope_css(body, prefix, section_classes)}}}")
        elif s.startswith("@"):
            out.append(f"{sel}{{{body}}}")
        else:
            parts = []
            for one in s.split(","):
                t = one.strip()
                if not t:
                    continue
                head = re.split(r"[\s>+~]", t, maxsplit=1)[0]
                if t.startswith(":root") or t.startswith("html") or t == "body" or t.startswith("body ") or head.startswith(".deck") or head.startswith(".skin-"):
                    parts.append(t)
                elif head == prefix or head.startswith(prefix + ".") or head.startswith(prefix + ":") or head.startswith(prefix + "-") or t.startswith(prefix + " "):
                    parts.append(t)
                elif head.startswith(".") and head.split(":")[0].lstrip(".").split(".")[0] in section_classes:
                    parts.append(f"{prefix}{t}")
                elif t == "*":
                    parts.append(f"{prefix} *")
                else:
                    parts.append(f"{prefix} {t}")
            out.append(f"{', '.join(parts)}{{{body}}}")
        i = k
    return "".join(out)


def section_classes(html, cls):
    """<section class="cls xxx"> に付いている cls 以外のクラス名（cover / chap / slide--dense …）。"""
    found = set()
    for m in re.finditer(rf'<section class="{cls}([^"]*)"', html):
        for c in m.group(1).split():
            found.add(c)
    return found


def part_names(html, cls):
    """section 直前のコメント（パーツNN: 名前）があればそれを、なければ h1 から名前を拾う。"""
    cm = re.findall(r"<!-- ═══ パーツ(\d+): ([^（═\n]+)", html)
    if len(cm) == len(sections(html, cls)):
        return [n.strip() for _, n in cm]
    names = []
    for sec in sections(html, cls):
        m = re.search(r"<h1[^>]*>(.*?)</h1>", sec, flags=re.S)
        t = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""
        if not t:
            m2 = re.search(r'class="(?:big|cover-title)[^"]*"[^>]*>(.*?)<', sec, flags=re.S)
            t = (m2.group(1).strip() if m2 else "") or "（表紙／裏表紙）"
        names.append(t)
    return names


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parts", help="例: b01,b02,m05,b09,b10")
    ap.add_argument("--title", default="資料名")
    ap.add_argument("-o", "--out", default="mydeck.html")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    base_html, more_html = read(BASE), read(MORE)
    base_secs, more_secs = sections(base_html, "s"), sections(more_html, "slide")

    if a.list or not a.parts:
        if not a.parts and not a.list:
            print("--parts で並び順を指定する（例: --parts b01,b02,m05,b09,b10）。一覧:", file=sys.stderr)
        for i, nm in enumerate(part_names(base_html, "s"), 1):
            print(f"b{i:02d}  {nm}")
        for i, nm in enumerate(part_names(more_html, "slide"), 1):
            print(f"m{i:02d}  {nm}")
        return

    picked = []
    for tok in a.parts.split(","):
        tok = tok.strip().lower()
        m = re.match(r"^([bm])(\d{1,2})$", tok)
        if not m:
            sys.exit(f"パーツ指定が不正: {tok}（b01〜b{len(base_secs):02d} / m01〜m{len(more_secs):02d}）")
        kind, idx = m.group(1), int(m.group(2))
        pool = base_secs if kind == "b" else more_secs
        if not 1 <= idx <= len(pool):
            sys.exit(f"範囲外: {tok}")
        picked.append((kind, pool[idx - 1]))

    # ページ番号を振り直す（表紙・裏表紙＝ b01 / b10 は番号なし）
    page = 0
    body = []
    for kind, sec in picked:
        is_cover = kind == "b" and ('class="s cover"' in sec or 'class="s chap"' in sec)  # 表紙・裏表紙・章扉は番号なし（slide-rules §4.45）
        if not is_cover:
            page += 1
        if kind == "b":
            sec = re.sub(r'(<div class="foot"><b>)[^<]*(</b><span>)[^<]*(</span>)',
                         lambda mm: f"{mm.group(1)}{a.title}{mm.group(2)}{'' if is_cover else page}{mm.group(3)}", sec)
            sec = re.sub(r'(<div class="logo">)[^<]*(</div>)', rf"\g<1>{a.title}\g<2>", sec)
        else:
            sec = re.sub(r'(<footer class="footer">.*?</span><span>)\d*(</span>)', rf"\g<1>{page}\g<2>", sec, flags=re.S)
        body.append(sec)

    base_css = scope_css(split_css(base_html), ".s", section_classes(base_html, "s"))
    more_css = scope_css(split_css(more_html), ".slide", section_classes(more_html, "slide"))
    # :root は両方残す（色・書体は同値。追加パーツ集側は版面の余白変数も持つ）

    out = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<title>{a.title}</title>
<!-- scripts/new_deck.py で生成。基本パーツ集（.s）と追加パーツ集（.slide）のCSSをスコープして結合してある。
     規約: references/slide-rules.md ／ 納品前: python3 scripts/check_deck.py {a.out} → FAIL 0 -->
<style>
/* ===== 基本パーツ集（templates/freeform_parts_16x9.html）===== */
{base_css}
/* ===== 追加パーツ集（templates/freeform_parts_more_16x9.html）===== */
{more_css}
</style></head><body>
<main class="deck skin-warm">
{chr(10).join(body)}
</main>
</body></html>
"""
    pathlib.Path(a.out).write_text(out, encoding="utf-8")
    print(f"wrote {a.out}: {len(picked)} slides（番号付き {page} ページ）")


if __name__ == "__main__":
    main()
