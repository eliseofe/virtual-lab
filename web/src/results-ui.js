import { resultsModel } from "./results/results-model.js";
import { provideResultsCommands } from "./results/results-commands.js";

const definitions = new Map();
const samples = new Map();
const panels = [];
let nextPanelId = 1;
let lastBuffer = null;
let lastRenderAt = 0;
let renderTimer = null;
const RENDER_INTERVAL_MS = 250;
const MAX_DISPLAY_POINTS = 1600;

function colorFor(id) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `hsl(${Math.abs(hash) % 360} 58% 43%)`;
}

function metricLabel(id) {
  const def = definitions.get(id);
  if (!def) return id;
  return def.unit ? `${def.name} (${def.unit})` : def.name;
}

function allMetricIds() {
  return [...new Set([...definitions.keys(), ...samples.keys()])];
}

function defaultMetricIds() {
  return [...definitions.keys()].slice(0, 3);
}

function defaultMetricIdForNewPanel() {
  const ids = [...definitions.keys()];
  const represented = new Set(panels.flatMap((panel) => panel.metricIds));
  return ids.find((id) => !represented.has(id)) ?? ids[0] ?? null;
}

// The results model (#564): what every view of the results panel shows.
function publishResults() {
  resultsModel.set({
    metrics: Object.freeze(allMetricIds().map((id) => Object.freeze(definitions.has(id)
      ? { id, label: metricLabel(id), color: colorFor(id) }
      : { id, label: id, color: "currentColor" }))),
    panels: Object.freeze(panels.map((panel) => Object.freeze({ id: panel.id, metricIds: Object.freeze([...panel.metricIds]) }))),
  });
}

function updateAddPlotButton() {
  resultsModel.set({ canAdd: definitions.size > 0 });
  const button = document.querySelector("#results-add-panel");
  if (!button) return;
  button.disabled = !resultsModel.get().canAdd;
  button.title = definitions.size === 0 ? "This experiment has no configured metrics." : "Add another metric plot.";
}

function mount() {
  if (document.querySelector("#live-results")) return;
  const canvasWrap = document.querySelector(".canvas-wrap");
  if (!canvasWrap) return;
  const grid = document.createElement("div");
  grid.className = "simulation-results-grid";
  canvasWrap.parentNode.insertBefore(grid, canvasWrap);
  grid.append(canvasWrap);

  const results = document.createElement("section");
  results.id = "live-results";
  results.className = "live-results";
  results.setAttribute("aria-label", "Live Results");
  results.innerHTML = `
    <header class="live-results-head">
      <div class="live-results-title">
        <h3>Results</h3>
        <span id="live-results-status" class="live-results-status">No metric samples yet</span>
      </div>
      <button id="results-add-panel" type="button">Add plot</button>
    </header>
    <div id="results-panels" class="results-panels"></div>`;
  grid.append(results);
  results.querySelector("#results-add-panel").addEventListener("click", addPanelCommand);
  updateAddPlotButton();
  refreshEmptyState();
}

function addPanel(metricIds = []) {
  const host = document.querySelector("#results-panels");
  if (!host) return null;
  const panel = {
    id: nextPanelId++,
    metricIds: [...new Set(metricIds)],
    view: null,
    drag: null,
    element: document.createElement("section"),
  };
  panel.element.className = "results-plot-panel";
  panel.element.dataset.resultsPanelId = String(panel.id);
  host.append(panel.element);
  panels.push(panel);
  buildPanel(panel);
  publishResults();
  refreshEmptyState();
  scheduleRender(true);
  return panel;
}

function removePanel(panel) {
  const index = panels.indexOf(panel);
  if (index >= 0) panels.splice(index, 1);
  panel.element.remove();
  publishResults();
  refreshEmptyState();
}

function buildPanel(panel) {
  panel.element.innerHTML = `
    <header class="results-plot-head">
      <strong>Metric plot</strong>
      <button class="results-plot-action" data-action="reset-view" type="button">Reset view</button>
      <button class="results-plot-action" data-action="remove" type="button" aria-label="Remove plot" title="Remove plot">×</button>
    </header>
    <details class="results-series-picker">
      <summary>Choose metric</summary>
      <div class="results-series-options"></div>
    </details>
    <div class="results-plot-wrap">
      <canvas class="results-plot-canvas" tabindex="0" aria-label="Live metric time-series plot"></canvas>
      <div class="results-plot-message">Choose one or more metrics.</div>
      <div class="results-tooltip" hidden></div>
    </div>
    <div class="results-legend"></div>`;
  panel.canvas = panel.element.querySelector("canvas");
  panel.message = panel.element.querySelector(".results-plot-message");
  panel.tooltip = panel.element.querySelector(".results-tooltip");
  panel.legend = panel.element.querySelector(".results-legend");
  panel.options = panel.element.querySelector(".results-series-options");
  panel.element.querySelector('[data-action="reset-view"]').addEventListener("click", () => followLiveCommand(panel.id));
  panel.element.querySelector('[data-action="remove"]').addEventListener("click", () => removePanelCommand(panel.id));
  panel.canvas.addEventListener("wheel", (event) => onWheel(panel, event), { passive: false });
  panel.canvas.addEventListener("pointerdown", (event) => onPointerDown(panel, event));
  panel.canvas.addEventListener("pointermove", (event) => onPointerMove(panel, event));
  panel.canvas.addEventListener("pointerup", (event) => onPointerUp(panel, event));
  panel.canvas.addEventListener("pointercancel", (event) => onPointerUp(panel, event));
  panel.canvas.addEventListener("pointerleave", () => { if (!panel.drag) panel.tooltip.hidden = true; });
  refreshPanelControls(panel);
}

function refreshPanelControls(panel) {
  if (!panel.options) return;
  panel.options.replaceChildren();
  const ids = [...definitions.keys()];
  for (const id of ids) {
    const label = document.createElement("label");
    label.className = "results-series-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = panel.metricIds.includes(id);
    input.addEventListener("change", () => setPanelMetric(panel, id, input.checked));
    const swatch = document.createElement("span");
    swatch.className = "results-series-swatch";
    swatch.style.setProperty("--series-color", colorFor(id));
    const name = document.createElement("span");
    name.className = "results-series-name";
    name.textContent = metricLabel(id);
    label.append(input, swatch, name);
    panel.options.append(label);
  }

  const title = panel.element.querySelector(".results-plot-head strong");
  const summary = panel.element.querySelector(".results-series-picker > summary");
  if (panel.metricIds.length === 1) {
    const label = metricLabel(panel.metricIds[0]);
    title.textContent = label;
    summary.textContent = `Metric: ${label}`;
  } else if (panel.metricIds.length > 1) {
    title.textContent = `${panel.metricIds.length} metrics`;
    summary.textContent = `Metrics: ${panel.metricIds.length} selected`;
  } else {
    title.textContent = "Choose a metric";
    summary.textContent = "Choose metric";
  }

  panel.legend.replaceChildren();
  for (const id of panel.metricIds) {
    const item = document.createElement("span");
    item.className = "results-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "results-legend-swatch";
    swatch.style.setProperty("--series-color", colorFor(id));
    const name = document.createElement("span");
    name.className = "results-legend-label";
    name.textContent = metricLabel(id);
    item.append(swatch, name);
    panel.legend.append(item);
  }
  publishResults();
  refreshEmptyState();
}

function refreshAllPanels() {
  for (const panel of panels) refreshPanelControls(panel);
  refreshEmptyState();
  updateAddPlotButton();
  scheduleRender(true);
}

function refreshEmptyState() {
  const host = document.querySelector("#results-panels");
  if (!host) return;
  host.querySelector(".results-empty")?.remove();
  if (panels.length) return;
  const empty = document.createElement("p");
  empty.className = "results-empty";
  empty.textContent = definitions.size
    ? "No plot panels. Add a plot to inspect the configured metrics."
    : "No metrics configured for this experiment.";
  host.append(empty);
}

function updateStatus() {
  const status = document.querySelector("#live-results-status");
  if (!status) return;
  const total = [...samples.values()].reduce((sum, series) => sum + series.length, 0);
  const dropped = Number(lastBuffer?.dropped_samples ?? 0);
  let next;
  if (dropped > 0) next = { text: `${total.toLocaleString()} samples · ${dropped.toLocaleString()} dropped`, state: "warning" };
  else if (total > 0) next = { text: `${total.toLocaleString()} samples · complete`, state: "ok" };
  else if (definitions.size) next = { text: "Waiting for metric samples", state: "idle" };
  else next = { text: "No metrics configured", state: "idle" };
  resultsModel.set({ status: Object.freeze(next) });
  status.textContent = resultsModel.get().status.text;
  status.dataset.state = resultsModel.get().status.state;
}

function receiveDefinitions(ir) {
  definitions.clear();
  for (const metric of ir?.metrics ?? []) {
    definitions.set(metric.id, { id: metric.id, name: metric.name ?? metric.id, unit: metric.unit ?? null });
  }

  const available = new Set(definitions.keys());
  for (const panel of panels) panel.metricIds = panel.metricIds.filter((id) => available.has(id));

  if (!definitions.size) {
    for (const panel of [...panels]) removePanel(panel);
  } else if (!panels.length) {
    addPanel(defaultMetricIds().slice(0, 1));
  } else if (panels[0].metricIds.length === 0) {
    panels[0].metricIds = defaultMetricIds().slice(0, 1);
  }

  refreshAllPanels();
  publishResults();
  updateStatus();
}

function receiveBatch(batch) {
  let newMetric = false;
  for (const sample of batch?.samples ?? []) {
    const id = String(sample.metric_id);
    if (!samples.has(id)) { samples.set(id, []); newMetric = true; }
    samples.get(id).push({ t: Number(sample.scientific_time), value: Number(sample.value) });
  }
  lastBuffer = batch?.buffer ?? lastBuffer;
  if (newMetric) {
    if (panels.length === 1 && panels[0].metricIds.length === 0) panels[0].metricIds = defaultMetricIds();
    refreshAllPanels();
    publishResults();
  }
  updateStatus();
  scheduleRender(false);
}

function resetSamples() {
  samples.clear();
  lastBuffer = null;
  for (const panel of panels) panel.view = null;
  publishResults();
  updateStatus();
  scheduleRender(true);
}

function scheduleRender(immediate = false) {
  if (document.hidden) return;
  const now = performance.now();
  const delay = immediate ? 0 : Math.max(0, RENDER_INTERVAL_MS - (now - lastRenderAt));
  if (renderTimer !== null) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    lastRenderAt = performance.now();
    for (const panel of panels) {
      if (panel.element.offsetParent === null) continue;
      renderPanel(panel);
    }
  }, delay);
}

function dataExtent(panel) {
  let min = Infinity;
  let max = -Infinity;
  for (const id of panel.metricIds) {
    const series = samples.get(id) ?? [];
    if (!series.length) continue;
    min = Math.min(min, series[0].t);
    max = Math.max(max, series[series.length - 1].t);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max <= min) max = min + 1;
  return { min, max };
}

function activeRange(panel) {
  const extent = dataExtent(panel);
  if (!extent) return null;
  if (!panel.view) return extent;
  const span = Math.max(1e-9, panel.view.max - panel.view.min);
  const min = Math.max(extent.min, Math.min(panel.view.min, extent.max - span * 0.05));
  return { min, max: Math.min(extent.max, min + span) };
}

function visiblePoints(series, minT, maxT) {
  const visible = series.filter((point) => point.t >= minT && point.t <= maxT && Number.isFinite(point.value));
  if (visible.length <= MAX_DISPLAY_POINTS) return visible;
  const stride = Math.ceil(visible.length / MAX_DISPLAY_POINTS);
  const reduced = [];
  for (let i = 0; i < visible.length; i += stride) {
    const chunk = visible.slice(i, Math.min(visible.length, i + stride));
    let lo = chunk[0];
    let hi = chunk[0];
    for (const point of chunk) {
      if (point.value < lo.value) lo = point;
      if (point.value > hi.value) hi = point;
    }
    if (lo.t <= hi.t) reduced.push(lo, ...(hi === lo ? [] : [hi]));
    else reduced.push(hi, lo);
  }
  return reduced;
}

function renderPanel(panel) {
  const canvas = panel.canvas;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  const range = activeRange(panel);
  const seriesData = panel.metricIds.map((id) => ({ id, points: range ? visiblePoints(samples.get(id) ?? [], range.min, range.max) : [] }));
  const values = seriesData.flatMap((entry) => entry.points.map((point) => point.value)).filter(Number.isFinite);
  if (!range || !values.length) {
    panel.message.hidden = false;
    panel.message.textContent = panel.metricIds.length ? "Waiting for samples from the selected metrics." : "Choose one or more metrics.";
    return;
  }
  panel.message.hidden = true;
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (maxY <= minY) { const pad = Math.max(1, Math.abs(minY) * .05); minY -= pad; maxY += pad; }
  const pad = { left: 48 * ratio, right: 10 * ratio, top: 10 * ratio, bottom: 27 * ratio };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  const x = (t) => pad.left + ((t - range.min) / (range.max - range.min)) * plotW;
  const y = (value) => pad.top + (1 - (value - minY) / (maxY - minY)) * plotH;
  context.strokeStyle = "#e8edef";
  context.lineWidth = ratio;
  context.fillStyle = "#708087";
  context.font = `${9 * ratio}px ui-monospace, monospace`;
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const yy = pad.top + (plotH * i / 4);
    context.beginPath(); context.moveTo(pad.left, yy); context.lineTo(width - pad.right, yy); context.stroke();
    const value = maxY - (maxY - minY) * i / 4;
    context.fillText(formatNumber(value), pad.left - 5 * ratio, yy);
  }
  context.textAlign = "center";
  context.textBaseline = "top";
  for (let i = 0; i <= 4; i += 1) {
    const xx = pad.left + plotW * i / 4;
    const value = range.min + (range.max - range.min) * i / 4;
    context.fillText(formatNumber(value), xx, height - pad.bottom + 7 * ratio);
  }
  for (const { id, points } of seriesData) {
    if (!points.length) continue;
    context.strokeStyle = colorFor(id);
    context.lineWidth = 1.6 * ratio;
    context.beginPath();
    points.forEach((point, index) => index ? context.lineTo(x(point.t), y(point.value)) : context.moveTo(x(point.t), y(point.value)));
    context.stroke();
  }
  panel.plotFrame = { range, minY, maxY, pad, plotW, plotH, ratio, width, height };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if ((abs > 0 && abs < 0.001) || abs >= 10000) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}

function eventTime(panel, event) {
  const frame = panel.plotFrame;
  if (!frame) return null;
  const rect = panel.canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * frame.ratio;
  const fraction = Math.max(0, Math.min(1, (px - frame.pad.left) / frame.plotW));
  return frame.range.min + fraction * (frame.range.max - frame.range.min);
}

function nearest(series, t) {
  if (!series.length) return null;
  let lo = 0, hi = series.length - 1;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (series[mid].t < t) lo = mid + 1; else hi = mid; }
  const a = series[lo];
  const b = lo > 0 ? series[lo - 1] : a;
  return Math.abs(a.t - t) < Math.abs(b.t - t) ? a : b;
}

function onWheel(panel, event) {
  const range = activeRange(panel);
  const center = eventTime(panel, event);
  if (!range || center == null) return;
  event.preventDefault();
  const extent = dataExtent(panel);
  const span = range.max - range.min;
  const factor = event.deltaY > 0 ? 1.3 : 0.75;
  const nextSpan = Math.max((extent.max - extent.min) / 500, Math.min(extent.max - extent.min, span * factor));
  const fraction = (center - range.min) / span;
  let min = center - nextSpan * fraction;
  let max = min + nextSpan;
  if (min < extent.min) { max += extent.min - min; min = extent.min; }
  if (max > extent.max) { min -= max - extent.max; max = extent.max; }
  panel.view = { min: Math.max(extent.min, min), max: Math.min(extent.max, max) };
  scheduleRender(true);
}

function onPointerDown(panel, event) {
  const range = activeRange(panel);
  if (!range) return;
  panel.drag = { pointerId: event.pointerId, startX: event.clientX, range: { ...range } };
  panel.canvas.setPointerCapture(event.pointerId);
  panel.canvas.dataset.dragging = "true";
  panel.tooltip.hidden = true;
}

function onPointerMove(panel, event) {
  if (panel.drag?.pointerId === event.pointerId) {
    const rect = panel.canvas.getBoundingClientRect();
    const extent = dataExtent(panel);
    const span = panel.drag.range.max - panel.drag.range.min;
    const delta = -(event.clientX - panel.drag.startX) / Math.max(1, rect.width) * span;
    let min = panel.drag.range.min + delta;
    let max = min + span;
    if (min < extent.min) { max += extent.min - min; min = extent.min; }
    if (max > extent.max) { min -= max - extent.max; max = extent.max; }
    panel.view = { min, max };
    scheduleRender(true);
    return;
  }
  const t = eventTime(panel, event);
  if (t == null || !panel.metricIds.length) { panel.tooltip.hidden = true; return; }
  const lines = [`t = ${formatNumber(t)}`];
  for (const id of panel.metricIds) {
    const point = nearest(samples.get(id) ?? [], t);
    if (point) lines.push(`${metricLabel(id)}: ${formatNumber(point.value)}`);
  }
  if (lines.length < 2) { panel.tooltip.hidden = true; return; }
  const rect = panel.canvas.getBoundingClientRect();
  panel.tooltip.textContent = lines.join("\n");
  panel.tooltip.style.left = `${Math.min(rect.width - 150, Math.max(6, event.clientX - rect.left + 10))}px`;
  panel.tooltip.style.top = `${Math.max(6, event.clientY - rect.top - 10)}px`;
  panel.tooltip.hidden = false;
}

function onPointerUp(panel, event) {
  if (panel.drag?.pointerId !== event.pointerId) return;
  panel.drag = null;
  panel.canvas.dataset.dragging = "false";
  try { panel.canvas.releasePointerCapture(event.pointerId); } catch {}
}

document.addEventListener("vlab:metrics-definition", (event) => receiveDefinitions(event.detail?.ir));
document.addEventListener("vlab:metric-batch", (event) => receiveBatch(event.detail));
document.addEventListener("vlab:metric-reset", resetSamples);
document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleRender(true); });
window.addEventListener("resize", () => scheduleRender(true));

// The results controller (#564): every view acts through these commands.
function panelById(panelId) {
  return panels.find((panel) => panel.id === panelId) ?? null;
}

function setPanelMetric(panel, id, visible) {
  if (visible) panel.metricIds.push(id);
  else panel.metricIds = panel.metricIds.filter((candidate) => candidate !== id);
  panel.view = null;
  refreshPanelControls(panel);
  scheduleRender(true);
}

function addPanelCommand() {
  if (!resultsModel.get().canAdd) return;
  const id = defaultMetricIdForNewPanel();
  if (!id) return;
  addPanel([id]);
}

function removePanelCommand(panelId) {
  const panel = panelById(panelId);
  if (panel) removePanel(panel);
}

// Only configured metrics can be shown or hidden in a plot.
function toggleMetricCommand(panelId, metricId) {
  const panel = panelById(panelId);
  if (!panel || !definitions.has(metricId)) return;
  setPanelMetric(panel, metricId, !panel.metricIds.includes(metricId));
}

function followLiveCommand(panelId) {
  const panel = panelById(panelId);
  if (!panel) return;
  panel.view = null;
  scheduleRender(true);
}

provideResultsCommands({
  addPanel: addPanelCommand,
  removePanel: removePanelCommand,
  toggleMetric: toggleMetricCommand,
  followLive: followLiveCommand,
});

mount();
updateStatus();

Object.defineProperty(globalThis, "__vlabResultsUI", {
  configurable: false,
  enumerable: false,
  value: Object.freeze({
    metricIds: () => allMetricIds(),
    sampleCount: (id) => (samples.get(id) ?? []).length,
    panelBindings: () => panels.map((panel) => ({ id: panel.id, metricIds: [...panel.metricIds] })),
    addPanel: (ids = []) => addPanel(ids)?.id ?? null,
  }),
});
