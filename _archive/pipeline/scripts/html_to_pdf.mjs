import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error("Usage: html_to_pdf.mjs <html> <pdf>");
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const htmlPath = path.resolve(root, input);
const pdfPath = path.resolve(root, output);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

// このスクリプトは `.slide`（1600x900px）デッキ専用の @page を
// 無条件に注入しており、`.s`（338.67x190.5mm）で組んだ 16:9 デッキ
// （templates/freeform_parts_16x9.html 等）の @page を上書きして
// ページ 1600x900px・中身 1280x720px となり、右と下に白帯が出ていた。
// ドキュメント側の体系を判定し、mm 系のときは文書自身の @page を使う。
const isPxDeck = await page.evaluate(() => !!document.querySelector(".slide"));

if (isPxDeck) {
  await page.addStyleTag({
    content: `
      @page { size: 1600px 900px; margin: 0; }
      html, body, .deck { background: white !important; }
      /* the on-screen deck is a grid with 40px gap + 40px
         padding and each slide carries a drop shadow. Left in place for print,
         that spacing spills past the page box and emits blank pages between
         slides and after the last one. Neutralise the container for print. */
      html, body { margin: 0 !important; padding: 0 !important; }
      .deck {
        display: block !important;
        gap: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .slide {
        margin: 0 !important;
        box-shadow: none !important;
        aspect-ratio: auto !important;
        width: 1600px !important;
        height: 900px !important;
        page-break-after: always !important;
        break-after: page !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      .slide:last-of-type { page-break-after: auto !important; break-after: auto !important; }
    `,
  });
} else {
  // mm 系（.s セクション）: 文書の @page をそのまま使い、余白・変形だけ無効化する
  await page.addStyleTag({
    content: `
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .s { margin: 0 !important; box-shadow: none !important; transform: none !important;
           page-break-after: always !important; break-after: page !important; }
      .s:last-of-type { page-break-after: auto !important; break-after: auto !important; }
      .fitwrap { width: auto !important; height: auto !important; margin: 0 !important; }
    `,
  });
}

await page.emulateMedia({ media: "print" });
await page.pdf({
  path: pdfPath,
  ...(isPxDeck ? { width: "1600px", height: "900px" } : {}),
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
});
await browser.close();
console.log(pdfPath);
