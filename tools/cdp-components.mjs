// Header + component detail extraction.
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

await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
await new Promise((r) => setTimeout(r, 800));

const out = await send("Runtime.evaluate", {
  expression: `(() => {
    const cs = (el) => getComputedStyle(el);
    const txt = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim();
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const st = (el, list) => { const s = cs(el); const o = {}; for (const p of list) o[p] = s.getPropertyValue(p); return o; };

    const top = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= 120 && r.width > 10 && r.height > 10;
    }).map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,80), text: txt(el).slice(0,50), href: el.getAttribute('href'), aria: el.getAttribute('aria-label'), rect: rect(el), style: st(el, ['font-family','font-size','font-weight','letter-spacing','color','background-color','padding','position']) }));

    const hero = document.querySelector('article');
    const heroText = hero ? [...hero.querySelectorAll('*')].filter(el => txt(el) && el.children.length === 0).slice(0,20).map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,60), text: txt(el).slice(0,90), rect: rect(el), style: st(el, ['font-family','font-size','font-weight','line-height','letter-spacing','color','text-transform','margin']) })) : [];

    const card2 = document.querySelectorAll('article')[1];
    const cardText = card2 ? [...card2.querySelectorAll('*')].filter(el => txt(el) && el.children.length === 0).slice(0,10).map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,60), text: txt(el).slice(0,60), rect: rect(el), style: st(el, ['font-size','font-weight','line-height','letter-spacing','color']) })) : [];

    const btn = [...document.querySelectorAll('a')].find(a => txt(a) === 'Bestel tickets');
    const btnInner = btn ? [...btn.querySelectorAll('*')].map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,60), rect: rect(el), style: st(el, ['background-color','color','border','font-size','font-weight','padding','display','align-items','justify-content','height','letter-spacing']) })) : [];

    return { top, heroText, cardText, btn: btn ? { outer: st(btn, ['display','padding','height']), inner: btnInner } : null };
  })()`,
  returnByValue: true,
});
await fs.writeFile(path.resolve("ref/components.json"), JSON.stringify(out.result.value, null, 2));
console.log("ok");
ws.close();
