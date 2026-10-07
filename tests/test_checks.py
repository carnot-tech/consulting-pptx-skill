"""機械チェックの自己テスト（標準ライブラリのみ）。

指摘を機械チェックに足したら、ここに「直していない版で FAIL が出る」「直した版で出ない」の
両方を1件ずつ足す。直していない版で発火しないチェックは、測れていないのと同じ。

  python3 -m unittest discover -s tests
"""
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / "scripts" / "check_deck.py"
GOOD = (ROOT / "tests" / "fixtures" / "good_deck.html").read_text(encoding="utf8")


def run(html, *extra):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "deck.html"
        p.write_text(html, encoding="utf8")
        extra = [str(Path(d) / a[1:]) if a.startswith("@") else a for a in extra]
        for a in extra:
            if a.endswith(".txt"):
                Path(a).write_text("# 架空の禁止語\nサンプル商事\nre:PJ-\\d{3}\n", encoding="utf8")
        r = subprocess.run([sys.executable, str(CHECK), str(p), *extra], capture_output=True, text=True)
    return r.returncode, [l for l in r.stdout.splitlines() if l.startswith("FAIL")]


def inject(old, new):
    assert old in GOOD, old
    return GOOD.replace(old, new, 1)


class GoodDeck(unittest.TestCase):
    def test_good_deck_passes(self):
        code, fails = run(GOOD)
        self.assertEqual((code, fails), (0, []))

    def test_templates_pass_in_template_mode(self):
        for f in ("freeform_parts_16x9.html", "freeform_parts_more_16x9.html"):
            r = subprocess.run([sys.executable, str(CHECK), str(ROOT / "templates" / f), "--template"],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, f + r.stdout[-400:])


class Placeholders(unittest.TestCase):
    def test_body_placeholder_fires(self):
        code, fails = run(inject("承認待ちは平均3日", "Text 1"))
        self.assertEqual(code, 1)
        self.assertTrue(any("本文にテンプレのプレースホルダー" in f for f in fails), fails)

    def test_part_label_chip_fires(self):
        code, fails = run(inject('<div class="date">現状</div>', '<div class="date">パーツ06｜前提→帰結の2カラム</div>'))
        self.assertTrue(any("プレースホルダー" in f for f in fails), fails)

    def test_type_name_title_fires(self):
        code, fails = run(inject("<h1>1部門で2か月試行し、効果を確かめてから全社へ広げる</h1>", "<h1>軸のある表</h1>"))
        self.assertTrue(any("型名のまま" in f for f in fails), fails)


class OneSentencePerBlock(unittest.TestCase):
    def test_two_sentences_in_card_fires(self):
        code, fails = run(inject("• 例外だけ承認者に回す", "• 例外だけ承認者に回す。規程外の申請は差し戻す"))
        self.assertTrue(any("2文以上" in f for f in fails), fails)

    def test_period_inside_brackets_is_ignored(self):
        code, fails = run(inject("• 例外だけ承認者に回す", "• 例外（金額超過。科目不明）だけ承認者に回す"))
        self.assertFalse(any("2文以上" in f for f in fails), fails)

    def test_single_sentence_with_trailing_period_passes(self):
        code, fails = run(inject("• 例外だけ承認者に回す", "• 例外だけ承認者に回す。"))
        self.assertFalse(any("2文以上" in f for f in fails), fails)


def run_warns(html):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "deck.html"
        p.write_text(html, encoding="utf8")
        r = subprocess.run([sys.executable, str(CHECK), str(p)], capture_output=True, text=True)
    return [l for l in r.stdout.splitlines() if l.startswith("WARN")]


class NumberConsistency(unittest.TestCase):
    """slide-rules §7.6 数値の平仄: 同じ指標がページ間で違う値なら WARN。"""

    def deck(self, p2, p5):
        return inject("承認待ちは平均3日", p2).replace("営業部", p5, 1)

    def test_same_label_different_value_fires(self):
        warns = run_warns(self.deck("承認者数は12人", "承認者数は15人"))
        self.assertTrue(any("数値の平仄疑い" in w and "承認者数" in w for w in warns), warns)

    def test_same_value_in_other_notation_passes(self):
        warns = run_warns(self.deck("承認者数は1.2万人", "承認者数 12,000人"))   # 桁の書き方が違っても値が同じなら可
        self.assertFalse(any("数値の平仄疑い" in w for w in warns), warns)

    def test_amount_with_scale_fires(self):
        warns = run_warns(self.deck("売上高は120億円", "売上高 118億円"))   # 金額・割合など単位を問わず比べる
        self.assertTrue(any("数値の平仄疑い" in w and "売上高" in w for w in warns), warns)

    def test_same_amount_in_other_scale_passes(self):
        warns = run_warns(self.deck("売上高は1.2億円", "売上高 120,000,000円"))
        self.assertFalse(any("数値の平仄疑い" in w for w in warns), warns)

    def test_different_year_passes(self):
        warns = run_warns(self.deck("2024年の承認者数は12人", "2026年の承認者数は15人"))   # 時点が違えば別の指標
        self.assertFalse(any("数値の平仄疑い" in w for w in warns), warns)


class ForbiddenTerms(unittest.TestCase):
    def test_term_in_body_fires_without_echoing_it(self):
        code, fails = run(inject("営業部", "サンプル商事の営業部"), "--forbid", "@terms.txt")
        self.assertTrue(any("禁止語" in f for f in fails), fails)
        self.assertFalse(any("サンプル商事" in f for f in fails), fails)

    def test_term_in_html_comment_fires(self):
        code, fails = run(inject("</main>", "<!-- PJ-123 向けの下書き --></main>"), "--forbid", "@terms.txt")
        self.assertTrue(any("コメント/属性" in f for f in fails), fails)

    def test_no_list_no_check(self):
        code, fails = run(inject("営業部", "サンプル商事の営業部"))
        self.assertEqual(code, 0)


def _has_playwright():
    return (ROOT / "node_modules" / "playwright").exists()


@unittest.skipUnless(_has_playwright(), "npm run setup で playwright を入れると実行される")
class EmptyArea(unittest.TestCase):
    def layout(self, html):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "deck.html"
            p.write_text(html, encoding="utf8")
            r = subprocess.run(["node", str(ROOT / "scripts" / "check_layout.mjs"), str(p)],
                               capture_output=True, text=True, cwd=ROOT)
        return r.returncode, r.stdout

    def test_good_deck_has_no_empty_page(self):
        code, out = self.layout(GOOD)
        self.assertEqual(code, 0, out)

    def test_half_empty_page_fires(self):
        html = re.sub(r'\s*<tr><td class="ax">2026年7月</td>.*?変わらず</td></tr>', "", GOOD, flags=re.S)
        html = html.replace("\n          <li>1人あたりの申請件数が2倍になる</li>\n          <li>承認の遅れが立替者の不満になる</li>", "")
        self.assertNotEqual(html, GOOD)
        code, out = self.layout(html)
        self.assertEqual(code, 1, out)
        self.assertIn("p3: 版面の", out)


if __name__ == "__main__":
    unittest.main()
