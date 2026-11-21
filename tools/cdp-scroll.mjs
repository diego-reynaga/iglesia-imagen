// Capture viewport screenshots at several scroll positions.
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
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await fs.mkdir(OUT_DIR, { recursive: true });

for (const y of [0, 900, 1800, 2700, 3300]) {
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${y})` });
  await new Promise((r) => setTimeout(r, 1800));
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await fs.writeFile(path.join(OUT_DIR, `scroll-${y}.png`), Buffer.from(shot.data, "base64"));
}
console.log("done");
ws.close();
