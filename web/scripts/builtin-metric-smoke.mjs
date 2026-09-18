import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      reactResults: Boolean(document.querySelector('[data-vlab-react-results="mounted"]')),
      reactPanelControls: document.querySelectorAll('[data-vlab-results-panel-control]').length,
      metricIds: api?.metricIds?.() ?? [], bindings: api?.panelBindings?.() ?? [],
      polarizationSamples: api?.sampleCount?.('polarization') ?? 0,
      angularMomentumSamples: api?.sampleCount?.('angular_momentum') ?? 0,
      lastBatchSamples: lastBatch?.samples ?? [],
      addDisabled: document.querySelector('[data-vlab-results-add]')?.disabled ?? null,
      status: document.querySelector('#live-results-status')?.textContent ?? '', runDisabled: document.querySelector('#run')?.disabled ?? null,
      selectedExperiment: document.querySelector('#experiment-select')?.selectedOptions?.[0]?.textContent?.trim() ?? null
    };
  })())`));
}
async function waitFor(send, predicate, label, attempts = 100) {
  let value = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await evaluate(send, predicate);
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function openSeriesAndToggle(send, panelId, metricId) {
  await evaluate(send, `document.querySelector('[data-vlab-results-series="${panelId}"]')?.click()`);
  await waitFor(send, `Boolean(document.querySelector('[data-vlab-results-panel="${panelId}"][data-vlab-results-metric="${metricId}"] input'))`, `React series control ${panelId}/${metricId}`);
  await evaluate(send, `document.querySelector('[data-vlab-results-panel="${panelId}"][data-vlab-results-metric="${metricId}"] input')?.click()`);
}

let session;
let cdp;
try {
  session = await createSmokeSession({ url }); cdp = session.cdp; await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  let startup = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    startup = await snapshot(cdp.send);
    if (startup.worker === "ready" && startup.metricBridge && startup.results && startup.reactResults
        && startup.metricIds.includes("polarization") && startup.metricIds.includes("angular_momentum")
        && startup.bindings.length === 1 && startup.bindings[0].metricIds.length === 1 && startup.bindings[0].metricIds[0] === "polarization"
        && startup.reactPanelControls === 1 && startup.addDisabled === false && startup.runDisabled === false) break;
    if (startup.worker === "error") throw new Error(`browser reported startup error: ${JSON.stringify(startup)}`);
    await sleep(100);
  }
  if (!startup?.reactResults) throw new Error(`React Results presentation did not mount: ${JSON.stringify(startup)}`);
  if (!startup?.metricIds?.includes("polarization") || !startup?.metricIds?.includes("angular_momentum")) throw new Error(`two built-in metrics did not reach Results: ${JSON.stringify(startup)}`);
  if (/No metrics configured/i.test(startup.status)) throw new Error(`Results incorrectly reports no metrics: ${JSON.stringify(startup)}`);

  await evaluate(cdp.send, `document.querySelector('[data-vlab-results-add]')?.click()`);
  await waitFor(cdp.send, `globalThis.__vlabResultsUI?.panelBindings?.().length === 2 && document.querySelectorAll('[data-vlab-results-panel-control]').length === 2`, "second React Results panel");
  let bindings = await evaluate(cdp.send, `globalThis.__vlabResultsUI.panelBindings()`);
  if (bindings.length !== 2 || bindings[0].metricIds.join(',') !== 'polarization' || bindings[1].metricIds.join(',') !== 'angular_momentum') throw new Error(`React Add plot did not choose the next unrepresented metric: ${JSON.stringify(bindings)}`);

  await openSeriesAndToggle(cdp.send, bindings[0].id, 'angular_momentum');
  await waitFor(cdp.send, `globalThis.__vlabResultsUI.panelBindings()[0].metricIds.includes('angular_momentum')`, "combined React Results series");
  bindings = await evaluate(cdp.send, `globalThis.__vlabResultsUI.panelBindings()`);
  if (!bindings[0].metricIds.includes('polarization') || !bindings[0].metricIds.includes('angular_momentum')) throw new Error(`React series chooser could not combine real metrics: ${JSON.stringify(bindings)}`);

  await openSeriesAndToggle(cdp.send, bindings[1].id, 'polarization');
  await waitFor(cdp.send, `globalThis.__vlabResultsUI.panelBindings()[1].metricIds.includes('polarization')`, "reused React Results series");
  bindings = await evaluate(cdp.send, `globalThis.__vlabResultsUI.panelBindings()`);
  if (!bindings[1].metricIds.includes('polarization') || !bindings[1].metricIds.includes('angular_momentum')) throw new Error(`React series chooser could not reuse metrics across panels: ${JSON.stringify(bindings)}`);

  const colors = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    const panels = [...document.querySelectorAll('.results-plot-panel')];
    const findColor = (panel, text) => [...panel.querySelectorAll('.results-series-option')].find((label) => label.textContent.includes(text))?.querySelector('.results-series-swatch')?.style.getPropertyValue('--series-color') ?? null;
    return {
      polarizationColor1: findColor(panels[0], 'Polarization'), polarizationColor2: findColor(panels[1], 'Polarization'),
      angularColor1: findColor(panels[0], 'Angular momentum'), angularColor2: findColor(panels[1], 'Angular momentum')
    };
  })())`));
  if (!colors.polarizationColor1 || colors.polarizationColor1 !== colors.polarizationColor2 || !colors.angularColor1 || colors.angularColor1 !== colors.angularColor2 || colors.polarizationColor1 === colors.angularColor1) throw new Error(`stable automatic metric colors failed: ${JSON.stringify(colors)}`);

  await evaluate(cdp.send, `document.querySelector('#run')?.click()`);
  let running = startup;
  for (let attempt = 0; attempt < 150; attempt += 1) { running = await snapshot(cdp.send); if (running.polarizationSamples > 0 && running.angularMomentumSamples > 0) break; await sleep(100); }
  await evaluate(cdp.send, `document.querySelector('#pause')?.click()`);
  if (running.polarizationSamples <= 0 || running.angularMomentumSamples <= 0) throw new Error(`both real metrics must produce live samples: ${JSON.stringify(running)}`);
  const latest = new Map(running.lastBatchSamples.map((sample) => [sample.metric_id, Number(sample.value)]));
  for (const id of ['polarization', 'angular_momentum']) {
    const value = latest.get(id); if (!Number.isFinite(value) || value < -1e-9 || value > 1.000000001) throw new Error(`${id} sample outside normalized finite range: ${JSON.stringify(running.lastBatchSamples)}`);
  }

  const firstPanelId = bindings[0].id;
  const beforeFollow = JSON.parse(await evaluate(cdp.send, `JSON.stringify({ bindings: globalThis.__vlabResultsUI.panelBindings(), polarization: globalThis.__vlabResultsUI.sampleCount('polarization'), angular: globalThis.__vlabResultsUI.sampleCount('angular_momentum') })`));
  await evaluate(cdp.send, `(() => {
    const panel = document.querySelector('.results-plot-panel[data-results-panel-id="${firstPanelId}"]');
    const canvas = panel?.querySelector('.results-plot-canvas');
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    return true;
  })()`);
  await waitFor(cdp.send, `Boolean(document.querySelector('[data-vlab-results-follow="${firstPanelId}"]'))`, "Follow live control after plot detaches");
  await evaluate(cdp.send, `document.querySelector('[data-vlab-results-follow="${firstPanelId}"]')?.click()`);
  await waitFor(cdp.send, `!document.querySelector('[data-vlab-results-follow="${firstPanelId}"]') && Boolean(document.querySelector('[data-vlab-results-live="${firstPanelId}"]'))`, "return to live Results view");
  const afterFollow = JSON.parse(await evaluate(cdp.send, `JSON.stringify({ bindings: globalThis.__vlabResultsUI.panelBindings(), polarization: globalThis.__vlabResultsUI.sampleCount('polarization'), angular: globalThis.__vlabResultsUI.sampleCount('angular_momentum') })`));
  if (JSON.stringify(afterFollow.bindings) !== JSON.stringify(beforeFollow.bindings) || afterFollow.polarization !== beforeFollow.polarization || afterFollow.angular !== beforeFollow.angular) throw new Error(`Follow live modified scientific samples or bindings: ${JSON.stringify({ beforeFollow, afterFollow })}`);

  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log(JSON.stringify({ startup, bindings, running, beforeFollow, afterFollow }, null, 2));
  console.log("React/Mantine Results verified: visible add/series controls, multi-series reuse, live metrics, and presentation-only Follow live recovery.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error)); if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions); if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog()); process.exitCode = 1;
} finally { try { await session?.close(); } catch {} }
