import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-results-chrome-${process.pid}`;
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

async function waitReady(send) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const state = JSON.parse(await evaluate(send, `JSON.stringify({
      worker: document.querySelector('#worker-status')?.dataset.state ?? null,
      metricBridge: Boolean(globalThis.__vlabMetricRuntime),
      results: Boolean(globalThis.__vlabResultsUI),
      surface: Boolean(document.querySelector('#live-results'))
    })`));
    if (state.worker === "ready" && state.metricBridge && state.results && state.surface) return state;
    if (state.worker === "error") throw new Error(`browser reported startup error: ${JSON.stringify(state)}`);
    await sleep(100);
  }
  throw new Error("browser did not reach Results-ready state");
}

let cdp;
try {
  const port = await waitForPort();
  cdp = connect(await waitForTarget(port));
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await waitReady(cdp.send);

  await evaluate(cdp.send, `(() => {
    document.dispatchEvent(new CustomEvent('vlab:metrics-definition', { detail: { ir: { metrics: [
      { id: 'ui.probe.one', name: 'Probe one', unit: 'u' },
      { id: 'ui.probe.two', name: 'Probe two', unit: null }
    ] } } }));
    document.dispatchEvent(new CustomEvent('vlab:metric-batch', { detail: {
      samples: [
        { metric_id: 'ui.probe.one', scientific_time: 0.1, value: 1.0 },
        { metric_id: 'ui.probe.two', scientific_time: 0.1, value: 4.0 },
        { metric_id: 'ui.probe.one', scientific_time: 0.2, value: 2.0 },
        { metric_id: 'ui.probe.two', scientific_time: 0.2, value: 3.0 }
      ],
      buffer: { dropped_samples: 0, complete: true }
    } }));
  })()`);
  await sleep(400);

  const desktop = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    const grid = document.querySelector('.simulation-results-grid');
    const arena = document.querySelector('.canvas-wrap');
    const results = document.querySelector('#live-results');
    const plot = document.querySelector('.results-plot-canvas');
    const api = globalThis.__vlabResultsUI;
    const added = api.addPanel(['ui.probe.one']);
    const second = document.querySelector('[data-results-panel-id="' + added + '"]');
    const secondProbeTwo = [...second.querySelectorAll('.results-series-option')].find((label) => label.textContent.includes('Probe two'))?.querySelector('input');
    secondProbeTwo?.click();
    return {
      sameGrid: arena?.parentElement === grid && results?.parentElement === grid,
      columns: getComputedStyle(grid).gridTemplateColumns,
      metricIds: api.metricIds(),
      oneCount: api.sampleCount('ui.probe.one'),
      twoCount: api.sampleCount('ui.probe.two'),
      bindings: api.panelBindings(),
      plotWidth: Math.round(plot?.getBoundingClientRect().width ?? 0),
      plotHeight: Math.round(plot?.getBoundingClientRect().height ?? 0),
      status: document.querySelector('#live-results-status')?.textContent ?? '',
      overflow: document.documentElement.scrollWidth - window.innerWidth
    };
  })())`));
  if (!desktop.sameGrid || !desktop.columns.includes(" ")) throw new Error(`Results are not co-located beside the simulation: ${JSON.stringify(desktop)}`);
  if (desktop.oneCount !== 2 || desktop.twoCount !== 2) throw new Error(`sample accumulation failed: ${JSON.stringify(desktop)}`);
  if (desktop.bindings.length !== 2 || !desktop.bindings[0].metricIds.includes('ui.probe.one') || !desktop.bindings[1].metricIds.includes('ui.probe.one') || !desktop.bindings[1].metricIds.includes('ui.probe.two')) {
    throw new Error(`multi-panel or configurable binding failed: ${JSON.stringify(desktop)}`);
  }
  if (desktop.plotWidth < 100 || desktop.plotHeight < 100 || !desktop.status.includes("complete") || desktop.overflow > 1) {
    throw new Error(`Results rendering/status regression: ${JSON.stringify(desktop)}`);
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await sleep(180);
  const mobile = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    const grid = document.querySelector('.simulation-results-grid');
    const arena = document.querySelector('.canvas-wrap').getBoundingClientRect();
    const results = document.querySelector('#live-results').getBoundingClientRect();
    return {
      columns: getComputedStyle(grid).gridTemplateColumns,
      stacked: results.top >= arena.bottom - 2,
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      resultsRight: Math.ceil(results.right),
      resultsLeft: Math.floor(results.left)
    };
  })())`));
  if (!mobile.stacked || mobile.scrollWidth > mobile.width + 1 || mobile.resultsRight > mobile.width + 1 || mobile.resultsLeft < -1) {
    throw new Error(`mobile Results reflow failed: ${JSON.stringify(mobile)}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);

  console.log(JSON.stringify({ desktop, mobile }, null, 2));
  console.log("Live Results smoke verified co-location, complete sample retention, configurable multi-panel bindings, rendered plots, and mobile reflow.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
