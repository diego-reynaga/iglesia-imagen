// Mobile layout capture.
import fs from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "http://127.0.0.1:9333";
const ORIGIN = "https://www.vangoghmuseum.nl";
const list = await (await fetch(`${ENDPOINT}/json/list`)).json();
const target = list.find((t) => t.type === "page" && t.url.startsWith(ORIGIN));
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await new Promise((r) => setTimeout(r, 2000));
const metrics = await send("Page.getLayoutMetrics");
const content = metrics.cssContentSize || metrics.contentSize;
const full = await send("Page.captureScreenshot", {
  format: "png", fromSurface: true, captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: content.width, height: Math.min(content.height, 16000), scale: 1 }
});
await fs.writeFile(path.resolve("ref/home-mobile-full.png"), Buffer.from(full.data, "base64"));

const info = await send("Runtime.evaluate", {
  expression: `(() => {
    const cs = getComputedStyle;
    const rect = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y+scrollY),w:Math.round(r.width),h:Math.round(r.height)}; };
    const h1 = document.querySelector('h1');
    const cards = [...document.querySelectorAll('article')].map(a => ({ rect: rect(a), bg: cs(a).backgroundColor }));
    const imgs = [...document.querySelectorAll('img')].filter(i=>i.naturalWidth>300).map(i=>({rect:rect(i),src:i.currentSrc}));
    return { h1: h1 ? {rect:rect(h1), size:cs(h1).fontSize, ls:cs(h1).letterSpacing, lh:cs(h1).lineHeight} : null, cards, imgs, width: innerWidth, height: document.body.scrollHeight };
  })()`,
  returnByValue: true
});
await fs.writeFile(path.resolve("ref/mobile.json"), JSON.stringify(info.result.value, null, 2));
console.log(JSON.stringify(info.result.value));
ws.close();
