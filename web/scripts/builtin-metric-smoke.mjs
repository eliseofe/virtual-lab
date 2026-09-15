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
async function httpJson(port, path) { const r = await fetch(`http://127.0.0.1:${port}${path}`); if (!r.ok) throw new Error(`DevTools HTTP ${r.status}`); return r.json(); }
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
  const socket = new WebSocket(wsUrl); let nextId = 1; const pending = new Map(); const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); if (message.error) reject(new Error(message.error.message)); else resolve(message.result); }
    else if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? "JavaScript exception");
  });
  const ready = new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const send = async (method, params = {}) => { await ready; const id = nextId++; const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject })); socket.send(JSON.stringify({ id, method, params })); return promise; };
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
    const metricEditor = document.querySelector('#metrics-source');
    const lastBatch = globalThis.__vlabMetricRuntime?.lastBatch?.() ?? null;
    return {
      worker: document.querySelector('#worker-status')?.dataset.state ?? null,
      metricBridge: Boolean(globalThis.__vlabMetricRuntime), results: Boolean(api), metricSource: metricEditor?.value ?? '',
      metricIds: api?.metricIds?.() ?? [], bindings: api?.panelBindings?.() ?? [],
      polarizationSamples: api?.sampleCount?.('polarization') ?? 0,
      angularMomentumSamples: api?.sampleCount?.('angular_momentum') ?? 0,
      lastBatchSamples: lastBatch?.samples ?? [],
      addDisabled: document.querySelector('#results-add-panel')?.disabled ?? null,
      status: document.querySelector('#live-results-status')?.textContent ?? '', runDisabled: document.querySelector('#run')?.disabled ?? null,
      selectedExperiment: document.querySelector('#experiment-select')?.selectedOptions?.[0]?.textContent?.trim() ?? null
    };
  })())`));
}

let cdp;
try {
  const port = await waitForPort(); cdp = connect(await waitForTarget(port)); await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  let startup = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    startup = await snapshot(cdp.send);
    if (startup.worker === "ready" && startup.metricBridge && startup.results
        && startup.metricIds.includes("polarization") && startup.metricIds.includes("angular_momentum")
        && startup.bindings.length === 1 && startup.bindings[0].metricIds.length === 1 && startup.bindings[0].metricIds[0] === "polarization"
        && startup.addDisabled === false && startup.runDisabled === false) break;
    if (startup.worker === "error") throw new Error(`browser reported startup error: ${JSON.stringify(startup)}`);
    await sleep(100);
  }
  if (!startup?.metricIds?.includes("polarization") || !startup?.metricIds?.includes("angular_momentum")) throw new Error(`two built-in metrics did not reach Results: ${JSON.stringify(startup)}`);
  if (/No metrics configured/i.test(startup.status)) throw new Error(`Results incorrectly reports no metrics: ${JSON.stringify(startup)}`);

  const gui = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    const add = document.querySelector('#results-add-panel'); add.click();
    const panels = [...document.querySelectorAll('.results-plot-panel')];
    const findInput = (panel, text) => [...panel.querySelectorAll('.results-series-option')].find((label) => label.textContent.includes(text))?.querySelector('input');
    const findColor = (panel, text) => [...panel.querySelectorAll('.results-series-option')].find((label) => label.textContent.includes(text))?.querySelector('.results-series-swatch')?.style.getPropertyValue('--series-color') ?? null;
    const separated = globalThis.__vlabResultsUI.panelBindings();
    findInput(panels[0], 'Angular momentum')?.click();
    const combined = globalThis.__vlabResultsUI.panelBindings();
    findInput(panels[1], 'Polarization')?.click();
    const duplicated = globalThis.__vlabResultsUI.panelBindings();
    return { separated, combined, duplicated,
      polarizationColor1: findColor(panels[0], 'Polarization'), polarizationColor2: findColor(panels[1], 'Polarization'),
      angularColor1: findColor(panels[0], 'Angular momentum'), angularColor2: findColor(panels[1], 'Angular momentum') };
  })())`));
  if (gui.separated.length !== 2 || gui.separated[0].metricIds.join(',') !== 'polarization' || gui.separated[1].metricIds.join(',') !== 'angular_momentum') throw new Error(`Add plot did not choose the next unrepresented metric: ${JSON.stringify(gui)}`);
  if (!gui.combined[0].metricIds.includes('polarization') || !gui.combined[0].metricIds.includes('angular_momentum')) throw new Error(`GUI could not combine real metrics: ${JSON.stringify(gui)}`);
  if (!gui.duplicated[1].metricIds.includes('polarization') || !gui.duplicated[1].metricIds.includes('angular_momentum')) throw new Error(`GUI could not reuse metrics across panels: ${JSON.stringify(gui)}`);
  if (!gui.polarizationColor1 || gui.polarizationColor1 !== gui.polarizationColor2 || !gui.angularColor1 || gui.angularColor1 !== gui.angularColor2 || gui.polarizationColor1 === gui.angularColor1) throw new Error(`stable automatic metric colors failed: ${JSON.stringify(gui)}`);

  await evaluate(cdp.send, `document.querySelector('#run')?.click()`);
  let running = startup;
  for (let attempt = 0; attempt < 150; attempt += 1) { running = await snapshot(cdp.send); if (running.polarizationSamples > 0 && running.angularMomentumSamples > 0) break; await sleep(100); }
  await evaluate(cdp.send, `document.querySelector('#pause')?.click()`);
  if (running.polarizationSamples <= 0 || running.angularMomentumSamples <= 0) throw new Error(`both real metrics must produce live samples: ${JSON.stringify(running)}`);
  const latest = new Map(running.lastBatchSamples.map((sample) => [sample.metric_id, Number(sample.value)]));
  for (const id of ['polarization', 'angular_momentum']) {
    const value = latest.get(id); if (!Number.isFinite(value) || value < -1e-9 || value > 1.000000001) throw new Error(`${id} sample outside normalized finite range: ${JSON.stringify(running.lastBatchSamples)}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log(JSON.stringify({ startup, gui, running }, null, 2));
  console.log("Built-in Active Elastic verified two real metrics end to end plus GUI separation, combination, reuse, and stable automatic colors.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error)); if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions); if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog); process.exitCode = 1;
} finally { try { cdp?.socket?.close(); } catch {} child.kill("SIGTERM"); }
