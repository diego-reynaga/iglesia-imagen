// Dismiss cookie banner, then capture full page and extract design data.
import fs from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "http://127.0.0.1:9333";
const OUT_DIR = path.resolve("ref");
const ORIGIN = "https://www.vangoghmuseum.nl";

const list = await (await fetch(`${ENDPOINT}/json/list`)).json();
const target = list.find((t) => t.type === "page" && t.url.startsWith(ORIGIN));
if (!target) throw new Error("No target found");

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
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

const click = await send("Runtime.evaluate", {
  expression: `(() => {
    const buttons = [...document.querySelectorAll('button, a')];
    const b = buttons.find(el => /^(Denegar|Weiger|Reject|Decline|Alleen noodzakelijk)/i.test((el.textContent||'').trim()));
    if (b) { b.click(); return 'clicked:' + b.textContent.trim(); }
    return 'not-found';
  })()`,
  returnByValue: true,
});
console.log("banner:", click.result.value);
await new Promise((r) => setTimeout(r, 2500));

// Extract design + content data
const extract = await send("Runtime.evaluate", {
  expression: `(() => {
    const cs = (el) => el ? getComputedStyle(el) : null;
    const style = (el, props) => { const s = cs(el); if (!s) return null; const o = {}; for (const p of props) o[p] = s.getPropertyValue(p); return o; };
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const txt = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim();

    const nav = [...document.querySelectorAll('header a, nav a')].map(a => ({ text: txt(a), href: a.getAttribute('href'), aria: a.getAttribute('aria-label') })).filter(x => x.text || x.aria);

    const sections = [...document.querySelectorAll('main section, main > div > section')].map((s, i) => ({
      i, tag: s.tagName, id: s.id, cls: s.className,
      rect: rect(s),
      style: style(s, ['background-color','background-image','color','padding-top','padding-bottom']),
      headings: [...s.querySelectorAll('h1,h2,h3,h4')].map(h => ({ tag: h.tagName, text: txt(h), style: style(h, ['font-family','font-size','font-weight','line-height','letter-spacing','color']) })),
      paragraphs: [...s.querySelectorAll('p')].map(p => txt(p)).filter(Boolean).slice(0, 8),
      links: [...s.querySelectorAll('a')].map(a => ({ text: txt(a), href: a.getAttribute('href'), cls: a.className })).filter(x => x.text).slice(0, 12),
      images: [...s.querySelectorAll('img')].map(im => ({ src: im.currentSrc || im.src, alt: im.alt, rect: rect(im), cls: im.className })).filter(x => x.src).slice(0, 12),
      bgImages: [...s.querySelectorAll('*')].map(el => cs(el)?.backgroundImage).filter(v => v && v !== 'none').slice(0, 6)
    }));

    const allImages = [...document.querySelectorAll('img')].map(im => ({ src: im.currentSrc || im.src, alt: im.alt, w: im.naturalWidth, h: im.naturalHeight, rect: rect(im), cls: im.className })).filter(x => x.src);

    const hero = document.querySelector('h1')?.closest('section,div');
    const header = document.querySelector('header');
    const bodyStyle = style(document.body, ['font-family','font-size','color','background-color','line-height']);
    const h1 = document.querySelector('h1');

    return {
      title: document.title,
      lang: document.documentElement.lang,
      bodyText: txt(document.body).slice(0, 6000),
      bodyStyle,
      header: header ? { rect: rect(header), style: style(header, ['background-color','color','height','position']) } : null,
      h1: h1 ? { text: txt(h1), rect: rect(h1), style: style(h1, ['font-family','font-size','font-weight','line-height','letter-spacing','color','text-transform']) } : null,
      hero: hero ? { tag: hero.tagName, cls: hero.className, rect: rect(hero), style: style(hero, ['background-color','background-image','color','min-height']) } : null,
      nav,
      sections,
      allImages,
      fonts: [...new Set([...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.style))],
      links: [...document.querySelectorAll('a')].map(a => ({ text: txt(a), href: a.getAttribute('href') })).filter(x => x.text).slice(0, 120),
      buttons: [...document.querySelectorAll('button')].map(b => ({ text: txt(b), cls: b.className, style: style(b, ['background-color','color','border','border-radius','font-size','font-weight','padding','text-transform']) })).filter(x => x.text).slice(0, 30)
    };
  })()`,
  returnByValue: true,
});

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, "page-data.json"), JSON.stringify(extract.result.value, null, 2));

const metrics = await send("Page.getLayoutMetrics");
const content = metrics.cssContentSize || metrics.contentSize;
const full = await send("Page.captureScreenshot", {
  format: "png", fromSurface: true, captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: content.width, height: Math.min(content.height, 16000), scale: 1 }
});
await fs.writeFile(path.join(OUT_DIR, "home-full.png"), Buffer.from(full.data, "base64"));
const fold = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
await fs.writeFile(path.join(OUT_DIR, "home-fold.png"), Buffer.from(fold.data, "base64"));
console.log(JSON.stringify({ height: content.height, title: extract.result.value.title }));
ws.close();
