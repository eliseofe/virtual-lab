// Visual no-change evidence for presentation refactors (#543).
//
// Captures, for one Lab URL at the four responsive viewports, the computed
// style and box of every body element plus a full-page screenshot, then
// compares two captures. A refactor that must not change appearance (for
// example moving CSS from JavaScript into files) must produce identical
// captures before and after.
//
//   node web/scripts/style-snapshot.mjs capture <url> <out-dir> [--mirror <dir>]
//   node web/scripts/style-snapshot.mjs compare <dir-a> <dir-b>
//
// --mirror serves the two external browser libraries from a local directory
// for offline environments: <dir>/supabase-js.mjs for esm.sh and
// <dir>/node_modules/ace-builds/src-min-noconflict/* for jsdelivr.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createSmokeSession } from "./smoke-browser-harness.mjs";

export const VIEWPORTS = Object.freeze([
  { label: "mobile", width: 390, height: 844, mobile: true },
  { label: "foldable", width: 820, height: 1180, mobile: true },
  { label: "desktop", width: 1366, height: 900, mobile: false },
  { label: "ultra-wide", width: 1920, height: 1080, mobile: false },
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mirrorFile(mirror, url) {
  if (url.startsWith("https://esm.sh/@supabase/supabase-js@")) return path.join(mirror, "supabase-js.mjs");
  const ace = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/ace-builds@[^/]+\/src-min-noconflict\/([^?#]+)$/);
  if (ace) return path.join(mirror, "node_modules/ace-builds/src-min-noconflict", ace[1]);
  return null;
}

// Runs in the page: element keys, boxes and a hash of every computed property.
const COLLECT = `(() => {
  const hash = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  const key = (el) => {
    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [node];
      // Mantine and React generate per-load ids; identify those by position only.
      const id = node.id && !/^(mantine-|_r_|:r)/.test(node.id) ? "#" + node.id : "";
      parts.unshift(node.tagName.toLowerCase() + id + ":" + siblings.indexOf(node));
    }
    return parts.join(">");
  };
  const elements = [...document.body.querySelectorAll("*")].map((el) => {
    const style = getComputedStyle(el);
    // Custom properties are enumerated in a launch-dependent order; sort.
    const entries = [];
    for (let i = 0; i < style.length; i += 1) entries.push(style[i] + ":" + style.getPropertyValue(style[i]));
    const text = entries.sort().join(";");
    const r = el.getBoundingClientRect();
    return [key(el), [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(","), hash(text)];
  });
  const head = [...document.head.querySelectorAll("style, link[rel=stylesheet]")]
    .map((node) => node.tagName === "LINK" ? "link " + new URL(node.href).pathname.split("/").pop() : "style " + Object.keys(node.dataset).join(","));
  return JSON.stringify({ head, elements });
})()`;

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function capture(url, outDir, mirror) {
  await mkdir(outDir, { recursive: true });
  const session = await createSmokeSession({ url: "about:blank" });
  const { cdp } = session;
  try {
    if (mirror) {
      cdp.onEvent(async (method, params) => {
        if (method !== "Fetch.requestPaused") return;
        const file = mirrorFile(mirror, params.request.url);
        try {
          const body = file ? await readFile(file) : null;
          if (!body) throw new Error("not mirrored");
          await cdp.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: "text/javascript; charset=utf-8" },
              { name: "Access-Control-Allow-Origin", value: "*" },
            ],
            body: body.toString("base64"),
          });
        } catch {
          await cdp.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" }).catch(() => {});
        }
      });
      await cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: "https://esm.sh/*" }, { urlPattern: "https://cdn.jsdelivr.net/*" }],
      });
    }
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    for (const viewport of VIEWPORTS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });
      await cdp.send("Page.navigate", { url });
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const ready = await evaluate(cdp, `document.readyState === "complete" && document.querySelector("#worker-status")?.dataset.state === "ready"`).catch(() => false);
        if (ready) break;
        await sleep(250);
      }
      // Let late modules (registry, Library, Professor surfaces) settle, then
      // require two identical consecutive collections.
      let previous = null;
      let current = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(previous === null ? 3_000 : 1_000);
        current = await evaluate(cdp, COLLECT);
        if (current === previous) break;
        previous = current;
      }
      await writeFile(path.join(outDir, `${viewport.label}.json`), current);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      await writeFile(path.join(outDir, `${viewport.label}.png`), Buffer.from(shot.data, "base64"));
      console.log(`[style-snapshot] captured ${viewport.label} (${JSON.parse(current).elements.length} elements)`);
    }
  } finally {
    await session.close();
  }
}

async function compare(dirA, dirB) {
  let differences = 0;
  for (const viewport of VIEWPORTS) {
    const [a, b] = await Promise.all([dirA, dirB].map((dir) => readFile(path.join(dir, `${viewport.label}.json`), "utf8").then(JSON.parse)));
    const mapA = new Map(a.elements.map(([key, box, style]) => [key, `${box} ${style}`]));
    const mapB = new Map(b.elements.map(([key, box, style]) => [key, `${box} ${style}`]));
    const keys = new Set([...mapA.keys(), ...mapB.keys()]);
    const changed = [...keys].filter((key) => mapA.get(key) !== mapB.get(key));
    const [pngA, pngB] = await Promise.all([dirA, dirB].map((dir) => readFile(path.join(dir, `${viewport.label}.png`))));
    const pixelsEqual = pngA.equals(pngB);
    console.log(`[style-snapshot] ${viewport.label}: ${keys.size} elements, ${changed.length} changed, screenshot ${pixelsEqual ? "identical" : "DIFFERENT"}`);
    for (const key of changed.slice(0, 10)) console.log(`  ${key}\n    a: ${mapA.get(key) ?? "(absent)"}\n    b: ${mapB.get(key) ?? "(absent)"}`);
    differences += changed.length + (pixelsEqual ? 0 : 1);
  }
  if (differences) {
    console.error(`[style-snapshot] ${differences} difference(s)`);
    process.exit(1);
  }
  console.log("[style-snapshot] captures are identical");
}

const [mode, first, second] = process.argv.slice(2);
const mirrorIndex = process.argv.indexOf("--mirror");
const mirror = mirrorIndex >= 0 ? process.argv[mirrorIndex + 1] : null;
if (mode === "capture" && first && second) await capture(first, second, mirror);
else if (mode === "compare" && first && second) await compare(first, second);
else {
  console.error("usage: style-snapshot.mjs capture <url> <out-dir> [--mirror <dir>] | compare <dir-a> <dir-b>");
  process.exit(2);
}
