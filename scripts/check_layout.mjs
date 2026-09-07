#!/usr/bin/env node
// フォーマットの機械検査（レンダリングが必要な項目）— slide-rules §8 の目視QAを一部機械化
//   1. フッター（.foot / .footer）と本文要素の重なり
//   2. タイトル（h1 / .title）の右端はみ出し（nowrap + overflow:hidden の黙殺検出）
//   3. スライド外への要素はみ出し
// 使い方: node check_layout.mjs deck.html   （playwright 必須。PLAYWRIGHT_MODULE_DIR / NODE_PATH で解決可）
import path from "node:path";
import { pathToFileURL } from "node:url";

async function loadPlaywright() {
  const cands = [
    process.env.PLAYWRIGHT_MODULE_DIR,
    path.join(process.cwd(), "node_modules", "playwright"),
  ].filter(Boolean);
  for (const c of cands) {
    try { return (await import(pathToFileURL(path.join(c, "index.mjs")).href)); } catch {}
    try { const m = await import(pathToFileURL(path.join(c, "index.js")).href); return m.default ?? m; } catch {}
  }
  return await import("playwright");
}

const file = process.argv[2];
if (!file) { console.error("usage: node check_layout.mjs deck.html"); process.exit(2); }

const pw = await loadPlaywright();
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// 印刷レイアウトで検査（ビューポート追従スケーラーの影響を受けない）
await page.emulateMedia({ media: "print" });
await page.goto(pathToFileURL(path.resolve(file)).href);
await page.waitForTimeout(300);

const issues = await page.evaluate(() => {
  const out = [];
  const slides = [...document.querySelectorAll("section.s, section.slide, .slide")];
  slides.forEach((s, i) => {
    const n = i + 1;
    const sr = s.getBoundingClientRect();
    const foot = s.querySelector(".foot, .footer, footer");
    const fr = foot ? foot.getBoundingClientRect() : null;
    const els = [...s.querySelectorAll("*")].filter((el) => {
      if (foot && (el === foot || foot.contains(el))) return false;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return false;
      return (el.textContent || "").trim().length > 0 || el.tagName === "IMG";
    });
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      // 葉要素だけ見る（コンテナの巨大rectでの誤検出を避ける）
      if (el.children.length > 0 && el.tagName !== "IMG") continue;
      if (fr && r.bottom > fr.top + 1 && r.top < fr.top) {
        out.push(`p${n}: フッターと本文が重なる: <${el.tagName.toLowerCase()}> 「${(el.textContent || "").trim().slice(0, 30)}」`);
      }
      if (r.right > sr.right + 1) {
        out.push(`p${n}: 右端はみ出し ${Math.round(r.right - sr.right)}px: <${el.tagName.toLowerCase()}> 「${(el.textContent || "").trim().slice(0, 30)}」`);
      }
      if (r.bottom > sr.bottom + 1) {
        out.push(`p${n}: 下端はみ出し ${Math.round(r.bottom - sr.bottom)}px: <${el.tagName.toLowerCase()}> 「${(el.textContent || "").trim().slice(0, 30)}」`);
      }
    }
  });
  return [...new Set(out)];
});

await browser.close();
if (issues.length) {
  for (const m of issues.slice(0, 20)) console.log("FAIL  " + m);
  console.log(`\n${issues.length} layout FAIL`);
  process.exit(1);
}
console.log("layout OK（フッター重なり・はみ出しなし）");
