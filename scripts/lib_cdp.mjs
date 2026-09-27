// Chrome headless を DevTools Protocol で直接操作する最小ヘルパー（追加依存なし・Node 22+ の標準 WebSocket を使う）。
// measure_deck.mjs / html_dump.mjs から使う。
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export async function openPage(file, { width = 1400, height = 900, scale = 1, media = "print" } = {}) {
  const CHROME = process.env.CHROME_PATH || [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ].find(existsSync);
  if (!CHROME) throw new Error("Chrome が見つからない（CHROME_PATH で指定可）");

  const userDataDir = mkdtempSync(join(tmpdir(), "chr-deck-"));
  const port = 9222 + Math.floor(Math.random() * 1000);
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });

  const close = async () => {
    try { ws?.close(); } catch {}
    chrome.kill();
    await delay(300);
    try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  };

  let endpoint, ws;
  for (let i = 0; i < 80 && !endpoint; i++) {
    await delay(100);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) endpoint = (await r.json()).webSocketDebuggerUrl;
    } catch {}
  }
  if (!endpoint) { await close(); throw new Error("Chrome devtools endpoint not ready"); }

  ws = new WebSocket(endpoint);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0, sessionId;
  const inflight = new Map(), events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && inflight.has(msg.id)) {
      const { resolve, reject } = inflight.get(msg.id);
      inflight.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const _id = ++id;
    inflight.set(_id, { resolve, reject });
    ws.send(JSON.stringify({ id: _id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  ({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }));
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  // 印刷レイアウトで扱う（画面用のビューポート追従スケーラーの影響を受けない）
  await send("Emulation.setEmulatedMedia", { media });
  await send("Page.navigate", { url: pathToFileURL(resolve(file)).href });
  for (let i = 0; i < 100 && !events.some((e) => e.method === "Page.loadEventFired"); i++) await delay(100);
  await delay(1200); // フォント・画像

  const evaluate = async (fnOrExpr, arg) => {
    const expression = typeof fnOrExpr === "function"
      ? `(${fnOrExpr.toString()})(${JSON.stringify(arg ?? null)})` : fnOrExpr;
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 500));
    return result.value;
  };
  return { send, evaluate, close };
}
