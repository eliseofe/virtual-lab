import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-showcase-chrome-${process.pid}`;
const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--window-size=1280,900", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });

let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools started (code ${child.exitCode})`);
    try {
      const text = await readFile(`${profile}/DevToolsActivePort`, "utf8");
      const port = Number(text.split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome did not publish DevToolsActivePort");
}

async function json(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const targets = await json(port, "/json/list").catch(() => []);
    const target = targets.find((item) => item.type === "page" && item.url.startsWith("http"));
    if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error("Chrome DevTools page target did not appear");
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      exceptions.push(details?.exception?.description ?? details?.text ?? "JavaScript exception");
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = async (method, params = {}) => {
    await ready;
    const id = nextId++;
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return promise;
  };
  return { socket, send, exceptions };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result?.result?.value;
}

async function waitReady(send) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = await evaluate(send, "document.querySelector('#worker-status')?.dataset.state ?? null");
    if (state === "ready") return;
    if (state === "error") throw new Error("Browser reported simulator startup error");
    await sleep(100);
  }
  throw new Error("Browser did not reach simulator ready state");
}

async function waitForShowcaseLauncher(send) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await evaluate(send, "Boolean(document.querySelector('.showcase-launcher'))");
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Showcase launcher did not initialize");
}

async function inspectShowcase(send, label) {
  await waitForShowcaseLauncher(send);
  await evaluate(send, "document.querySelector('.showcase-launcher').click()");

  let launchState = null;
  for (let attempt = 0; attempt < 250; attempt += 1) {
    launchState = JSON.parse(await evaluate(send, `JSON.stringify((() => {
      const dialog = document.querySelector('.showcase-dialog');
      const message = document.querySelector('.showcase-message');
      return {
        open: Boolean(dialog?.open),
        entries: document.querySelectorAll('.showcase-entry').length,
        message: message?.textContent?.trim() ?? '',
        messageState: message?.dataset?.state ?? null,
      };
    })())`));
    if (launchState.messageState === "error") {
      throw new Error(`${label} Showcase reported an error: ${JSON.stringify(launchState)}`);
    }
    if (launchState.open && launchState.entries > 0) break;
    await sleep(100);
  }
  if (!launchState?.open || launchState.entries < 1) {
    throw new Error(`${label} Showcase did not become usable after launch: ${JSON.stringify(launchState)}`);
  }

  const value = await evaluate(send, `JSON.stringify((() => {
    const dialog = document.querySelector('.showcase-dialog');
    const rect = dialog?.getBoundingClientRect();
    const entries = [...document.querySelectorAll('.showcase-entry')].map((entry) => entry.textContent?.replace(/\\s+/g, ' ').trim() ?? '');
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      open: Boolean(dialog?.open),
      withinViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      entries,
      activeElastic: entries.some((text) => text.includes('Active Elastic') && text.includes('Curated') && text.includes('Open & run')),
      homogeneous: entries.length >= 1 && entries.every((text) => text.includes('Curated') && text.includes('Open & run')),
      falseEmpty: document.body.textContent?.includes('No Showcase experiments yet.') ?? false,
      syntheticBuiltin: entries.some((text) => text.includes('Built-in') || text.includes('Public example')),
      closeHeight: Math.round(document.querySelector('.showcase-head-actions button:last-child')?.getBoundingClientRect().height ?? 0),
      message: document.querySelector('.showcase-message')?.textContent?.trim() ?? '',
    };
  })())`);
  const state = JSON.parse(value);
  if (!state.open || !state.withinViewport || !state.activeElastic || !state.homogeneous || state.syntheticBuiltin || state.falseEmpty || state.scrollWidth > state.width + 1) {
    throw new Error(`${label} Showcase UX failed: ${JSON.stringify(state)}`);
  }
  await evaluate(send, "document.querySelector('.showcase-dialog')?.close()");
  return state;
}

let cdp;
try {
  const port = await waitForPort();
  const wsUrl = await waitForTarget(port);
  cdp = connect(wsUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await waitReady(cdp.send);
  const desktop = await inspectShowcase(cdp.send, "desktop");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitReady(cdp.send);
  const mobile = await inspectShowcase(cdp.send, "mobile");
  if (mobile.closeHeight < 44) throw new Error(`mobile Showcase close target is ${mobile.closeHeight}px, expected at least 44px`);

  console.log(JSON.stringify({ desktop, mobile }, null, 2));
  console.log("Showcase smoke verified homogeneous curated entries, Active Elastic presence, and responsive layout on desktop and 390x844 mobile.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
