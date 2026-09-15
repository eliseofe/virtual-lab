import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-builtin-metric-chrome-${process.pid}`;
const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--window-size=1280,900",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools started (${child.exitCode})`);
    try {
      const text = await readFile(`${profile}/DevToolsActivePort`, "utf8");
      const port = Number(text.split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome did not publish DevToolsActivePort");
}

async function httpJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await httpJson(port, "/json/list").catch(() => []);
    const target = targets.find((entry) => entry.type === "page" && entry.url.startsWith("http"));
    if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error("Chrome page target did not appear");
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
      exceptions.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? "JavaScript exception");
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
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response?.exceptionDetails) throw new Error(response.exceptionDetails.text || "Runtime evaluation failed");
  return response?.result?.value;
}

async function snapshot(send) {
  return JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const api = globalThis.__vlabResultsUI;
    const metricEditor = document.querySelector('[data-experiment-artifact-editor="true"][data-experiment-artifact-id="metrics"]');
    return {
      worker: document.querySelector('#worker-status')?.dataset.state ?? null,
      metricBridge: Boolean(globalThis.__vlabMetricRuntime),
      results: Boolean(api),
      metricSource: metricEditor?.value ?? '',
      metricIds: api?.metricIds?.() ?? [],
      bindings: api?.panelBindings?.() ?? [],
      polarizationSamples: api?.sampleCount?.('polarization') ?? 0,
      addDisabled: document.querySelector('#results-add-panel')?.disabled ?? null,
      status: document.querySelector('#live-results-status')?.textContent ?? '',
      runDisabled: document.querySelector('#run')?.disabled ?? null,
      selectedExperiment: document.querySelector('#experiment-select')?.selectedOptions?.[0]?.textContent?.trim() ?? null
    };
  })())`));
}

let cdp;
try {
  const port = await waitForPort();
  cdp = connect(await waitForTarget(port));
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  let startup = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    startup = await snapshot(cdp.send);
    const bound = startup.bindings.some((panel) => panel.metricIds?.includes("polarization"));
    if (startup.worker === "ready" && startup.metricBridge && startup.results
        && startup.metricIds.includes("polarization") && bound
        && startup.metricSource.includes('@metric(id="polarization"')
        && startup.addDisabled === false && startup.runDisabled === false) break;
    if (startup.worker === "error") throw new Error(`browser reported startup error: ${JSON.stringify(startup)}`);
    await sleep(100);
  }

  const bound = startup?.bindings?.some((panel) => panel.metricIds?.includes("polarization"));
  if (!startup?.metricIds?.includes("polarization") || !bound || startup.addDisabled !== false
      || !startup.metricSource.includes('@metric(id="polarization"')) {
    throw new Error(`built-in polarization metric did not reach Results at startup: ${JSON.stringify(startup)}`);
  }
  if (/No metrics configured/i.test(startup.status)) {
    throw new Error(`Results incorrectly reports no metrics at startup: ${JSON.stringify(startup)}`);
  }

  await evaluate(cdp.send, `document.querySelector('#run')?.click()`);
  let running = startup;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    running = await snapshot(cdp.send);
    if (running.polarizationSamples > 0) break;
    await sleep(100);
  }
  await evaluate(cdp.send, `document.querySelector('#pause')?.click()`);

  if (running.polarizationSamples <= 0) {
    throw new Error(`polarization produced no live samples after Run: ${JSON.stringify(running)}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);

  console.log(JSON.stringify({ startup, running }, null, 2));
  console.log("Built-in Active Elastic polarization metric verified end to end: source -> compiler -> worker -> Results -> live samples.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
