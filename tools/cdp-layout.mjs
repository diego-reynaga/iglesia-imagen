// Detailed layout/color extraction for the Van Gogh Museum home page.
import fs from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "http://127.0.0.1:9333";
const OUT_DIR = path.resolve("ref");
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
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

const out = await send("Runtime.evaluate", {
  expression: `(() => {
    const cs = (el) => getComputedStyle(el);
    const txt = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim();
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const props = ['background-color','color','font-family','font-size','font-weight','line-height','letter-spacing','text-transform','padding','margin','border','position','top','height','width','display','grid-template-columns','gap','border-radius'];

    const navLinks = [...document.querySelectorAll('header a, header button, nav a')].map(el => ({ tag: el.tagName, text: txt(el), href: el.getAttribute('href'), rect: rect(el), style: (() => { const s = cs(el); const o = {}; for (const p of ['font-family','font-size','font-weight','letter-spacing','color','padding','text-transform']) o[p] = s.getPropertyValue(p); return o; })() }));

    const colored = [...document.querySelectorAll('main *')].filter(el => {
      const bg = cs(el).backgroundColor;
      return bg && bg !== 'rgba(0, 0, 0, 0)' && el.getBoundingClientRect().width > 200 && el.getBoundingClientRect().height > 100;
    }).map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,120), rect: rect(el), bg: cs(el).backgroundColor, text: txt(el).slice(0,60) }));

    const sticky = [...document.querySelectorAll('*')].filter(el => ['sticky','fixed'].includes(cs(el).position)).map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,120), rect: rect(el), position: cs(el).position, top: cs(el).top, bg: cs(el).backgroundColor, text: txt(el).slice(0,40) }));

    const imgs = [...document.querySelectorAll('img')].filter(im => im.naturalWidth > 300).map(im => ({ alt: im.alt, src: im.currentSrc || im.src, rect: rect(im), parentCls: (im.parentElement?.className||'').toString().slice(0,120), style: { objectFit: cs(im).objectFit, position: cs(im).position } }));

    const header = document.querySelector('header') || document.querySelector('nav')?.closest('div');
    const logo = [...document.querySelectorAll('a')].find(a => (a.getAttribute('href')||'').startsWith('/nl') && txt(a).includes('Van Gogh Museum') && cs(a).backgroundColor !== 'rgba(0, 0, 0, 0)');
    const buttons = [...document.querySelectorAll('main a, main button')].filter(el => /Bestel tickets|Word donateur|Ontdek meer|Lees het verhaal/.test(txt(el))).map(el => ({ text: txt(el), rect: rect(el), style: (() => { const s = cs(el); const o = {}; for (const p of ['background-color','color','border','font-size','font-weight','padding','text-transform','letter-spacing','display','align-items','justify-content']) o[p] = s.getPropertyValue(p); return o; })() }));

    const body = cs(document.body);
    return {
      viewport: { w: innerWidth, h: innerHeight },
      body: { bg: body.backgroundColor, color: body.color, font: body.fontFamily, fontSize: body.fontSize, lineHeight: body.lineHeight },
      header: header ? { rect: rect(header), bg: cs(header).backgroundColor, height: cs(header).height, position: cs(header).position } : null,
      logo: logo ? { rect: rect(logo), bg: cs(logo).backgroundColor, color: cs(logo).color, padding: cs(logo).padding } : null,
      navLinks,
      colored,
      sticky,
      imgs,
      buttons,
      main: (() => { const m = document.querySelector('main'); return m ? { rect: rect(m), cls: m.className, display: cs(m).display, grid: cs(m).gridTemplateColumns, gap: cs(m).gap } : null; })(),
      h1Style: (() => { const h = document.querySelector('h1'); const s = cs(h); return { font: s.fontFamily, size: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, margin: s.margin, color: s.color }; })(),
      bodyBg: body.backgroundColor
    };
  })()`,
  returnByValue: true,
});
await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, "layout.json"), JSON.stringify(out.result.value, null, 2));

await send("Runtime.evaluate", { expression: "window.scrollTo(0, document.body.scrollHeight)" });
await new Promise((r) => setTimeout(r, 1500));
const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
await fs.writeFile(path.join(OUT_DIR, "scroll-bottom.png"), Buffer.from(shot.data, "base64"));
console.log("ok");
ws.close();
