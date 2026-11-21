// Capture screenshots from the running headless Chrome over CDP.
import fs from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "http://127.0.0.1:9333";
const OUT_DIR = path.resolve("ref");
const ORIGIN = "https://www.vangoghmuseum.nl";

const list = await (await fetch(`${ENDPOINT}/json/list`)).json();
const target = list.find((t) => t.type === "page" && t.url.startsWith(ORIGIN));
if (!target) {
  console.error("No target found");
  process.exit(1);
}

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
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.reload", { ignoreCache: false });
await new Promise((r) => setTimeout(r, 6000));

await fs.mkdir(OUT_DIR, { recursive: true });

// Visible fold
const fold = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
await fs.writeFile(path.join(OUT_DIR, "home-fold.png"), Buffer.from(fold.data, "base64"));

// Full page
const metrics = await send("Page.getLayoutMetrics");
const content = metrics.cssContentSize || metrics.contentSize;
const full = await send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
  captureBeyondViewport: true,
  clip: {
    x: 0,
    y: 0,
    width: content.width,
    height: Math.min(content.height, 12000),
    scale: 1,
  },
});
await fs.writeFile(path.join(OUT_DIR, "home-full.png"), Buffer.from(full.data, "base64"));

// Mobile view
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await new Promise((r) => setTimeout(r, 2500));
const mobile = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
await fs.writeFile(path.join(OUT_DIR, "home-mobile.png"), Buffer.from(mobile.data, "base64"));

console.log(JSON.stringify({ title: target.title, width: content.width, height: content.height }));
ws.close();
