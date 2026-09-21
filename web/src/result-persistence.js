import {
  DEFAULT_FLUSH_INTERVAL_MS,
  PENDING_SAMPLE_LIMIT,
  RUN_LOG_SCHEMA,
  buildStoredZip,
  metricFileName,
  nextRunNumberFromLogText,
  nextRunNumberFromNames,
  samplesToCsv,
  sanitizePathSegment,
} from "./result-storage-core.js";

const HANDLE_DB = "vlab-results-workspace-v1";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "root";
const FLUSH_CHOICES = [1000, 5000, 15000, 30000];

let rootHandle = null;
let rememberedHandle = null;
let definitionsIr = null;
let activeRun = null;
let lastFinishedRun = null;
let unsavedRuns = [];
let localSequence = 0;
let flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS;
let flushTimer = null;
let ioChain = Promise.resolve();
let lastError = null;
const persistenceSupported = typeof globalThis.showDirectoryPicker === "function";

const stats = {
  flushCount: 0,
  flushMs: 0,
  samplesFlushed: 0,
  maxPendingSamples: 0,
  autoPauseCount: 0,
};

function nowIso() { return new Date().toISOString(); }

function currentExperiment() {
  const select = document.querySelector("#experiment-select");
  const value = select?.value ?? "unknown";
  const title = document.querySelector(".experiment-current-title")?.textContent?.trim()
    || select?.selectedOptions?.[0]?.textContent?.trim()
    || "Experiment";
  return {
    id: value.startsWith("registry:") ? value.slice("registry:".length) : value,
    title,
    revision: document.querySelector(".metadata-panel .panel-heading strong")?.textContent?.trim() ?? null,
    build: document.querySelector('meta[name="vlab-build"]')?.content ?? "development",
  };
}

function runtimeContext() {
  const context = globalThis.__vlabMetricRuntime?.runtimeContext?.() ?? {};
  const simulation = context.setup?.simulation ?? context.simulation ?? null;
  return {
    seed: Number.isInteger(Number(simulation?.seed ?? context.seed)) ? Number(simulation?.seed ?? context.seed) : null,
    simulation: simulation ? {
      physicsDt: simulation.physicsDt ?? null,
      controlDt: simulation.controlDt ?? null,
      metricDt: simulation.metricDt ?? null,
      interactionRadius: simulation.interactionRadius ?? null,
      arenaSize: simulation.arenaSize ?? null,
      sensorNoise: simulation.sensorNoise ?? null,
      maxForwardSpeed: simulation.maxForwardSpeed ?? null,
      maxAngularSpeed: simulation.maxAngularSpeed ?? null,
    } : null,
    parameters: context.parameters ?? null,
    metricsIr: context.metricsIr ?? definitionsIr,
    controllerSchema: context.controllerIr?.schema ?? context.controllerIr?.version ?? null,
    kernelVersion: context.kernelVersion ?? null,
    neighbourStrategy: context.neighbourStrategy ?? null,
  };
}

function metricDefinitions() {
  return [...(definitionsIr?.metrics ?? [])].map((metric) => ({
    id: metric.id,
    name: metric.name ?? metric.id,
    unit: metric.unit ?? null,
    sampling: metric.sampling ?? null,
  }));
}

function createRun() {
  localSequence += 1;
  return {
    localId: globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${localSequence}`,
    portableOrdinal: localSequence,
    startedAt: nowIso(),
    endedAt: null,
    experiment: currentExperiment(),
    runtime: runtimeContext(),
    metrics: metricDefinitions(),
    runNumber: null,
    location: null,
    startLogged: false,
    terminal: null,
    durable: false,
    exported: false,
    pending: new Map(),
    all: new Map(),
    committed: new Map(),
    lastBuffer: null,
    status: "running",
  };
}

function sampleCount(map) {
  let count = 0;
  for (const values of map.values()) count += values.length;
  return count;
}

function addSamples(run, batch) {
  for (const sample of batch?.samples ?? []) {
    const id = String(sample.metric_id);
    const point = { t: Number(sample.scientific_time), value: Number(sample.value) };
    if (!Number.isFinite(point.t) || !Number.isFinite(point.value)) continue;
    if (!run.pending.has(id)) run.pending.set(id, []);
    if (!run.all.has(id)) run.all.set(id, []);
    run.pending.get(id).push(point);
    run.all.get(id).push(point);
  }
  run.lastBuffer = batch?.buffer ?? run.lastBuffer;
  stats.maxPendingSamples = Math.max(stats.maxPendingSamples, sampleCount(run.pending));
}

function openHandleDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function rememberRootHandle(handle) {
  const db = await openHandleDb();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {}
  finally { db.close(); }
}

async function readRememberedRootHandle() {
  const db = await openHandleDb();
  if (!db) return null;
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } finally { db.close(); }
}

async function permissionState(handle) {
  if (!handle) return "denied";
  if (typeof handle.queryPermission !== "function") return "granted";
  try { return await handle.queryPermission({ mode: "readwrite" }); }
  catch { return "denied"; }
}

async function requestPermission(handle) {
  if (!handle) return "denied";
  if (typeof handle.requestPermission !== "function") return "granted";
  try { return await handle.requestPermission({ mode: "readwrite" }); }
  catch { return "denied"; }
}

async function readFileText(fileHandle) {
  try { return await (await fileHandle.getFile()).text(); }
  catch { return ""; }
}

async function replaceText(fileHandle, text) {
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function appendText(fileHandle, text) {
  const file = await fileHandle.getFile();
  const writable = await fileHandle.createWritable({ keepExistingData: true });
  await writable.seek(file.size);
  await writable.write(text);
  await writable.close();
}

function identitySuffix(id) {
  const text = String(id ?? "experiment").replace(/[^A-Za-z0-9]/g, "");
  return text.slice(0, 8) || "experiment";
}

async function experimentDirectory(root, experiment) {
  const base = sanitizePathSegment(experiment.title);
  for (const candidate of [base, `${base} — ${identitySuffix(experiment.id)}`]) {
    const directory = await root.getDirectoryHandle(candidate, { create: true });
    const meta = await directory.getDirectoryHandle(".vlab", { create: true });
    const identity = await meta.getFileHandle("experiment.json", { create: true });
    const existing = await readFileText(identity);
    if (existing.trim()) {
      try {
        const parsed = JSON.parse(existing);
        if (parsed.experiment_id !== experiment.id) continue;
      } catch {}
    }
    if (!existing.trim()) {
      await replaceText(identity, `${JSON.stringify({
        schema: "vlab.experiment-storage/0.1",
        experiment_id: experiment.id,
        title: experiment.title,
      }, null, 2)}\n`);
    }
    return { directory, meta, name: candidate };
  }
  throw new Error("Could not allocate a distinct Experiment results directory.");
}

async function listNames(directory) {
  const names = [];
  if (typeof directory.entries !== "function") return names;
  for await (const [name] of directory.entries()) names.push(name);
  return names;
}

function runLogStart(run) {
  return {
    schema: RUN_LOG_SCHEMA,
    event: "started",
    at: run.startedAt,
    run_id: run.localId,
    run_number: run.runNumber,
    experiment: run.experiment,
    runtime: run.runtime,
    metrics: run.metrics,
  };
}

function runLogFlush(run) {
  return {
    schema: RUN_LOG_SCHEMA,
    event: "flushed",
    at: nowIso(),
    run_id: run.localId,
    run_number: run.runNumber,
    samples: Object.fromEntries(run.committed),
    buffer: run.lastBuffer,
  };
}

function runLogTerminal(run) {
  return {
    schema: RUN_LOG_SCHEMA,
    event: run.terminal?.status ?? "interrupted",
    at: run.endedAt ?? nowIso(),
    run_id: run.localId,
    run_number: run.runNumber,
    samples: Object.fromEntries(run.committed),
    buffer: run.lastBuffer,
    reason: run.terminal?.reason ?? null,
  };
}

async function ensureRunLocation(run) {
  if (run.location) return run.location;
  if (!rootHandle) return null;
  if (await permissionState(rootHandle) !== "granted") throw new Error("Results-folder permission is no longer available.");
  const experiment = await experimentDirectory(rootHandle, run.experiment);
  const runs = await experiment.directory.getDirectoryHandle("runs", { create: true });
  const log = await experiment.meta.getFileHandle("runs.ndjson", { create: true });
  const filesNext = nextRunNumberFromNames(await listNames(runs));
  const logNext = nextRunNumberFromLogText(await readFileText(log));
  run.runNumber = Math.max(filesNext, logNext);
  run.location = { experiment, runs, log };
  if (!run.startLogged) {
    await appendText(log, `${JSON.stringify(runLogStart(run))}\n`);
    run.startLogged = true;
  }
  return run.location;
}

async function appendMetricSamples(run, metricId, points) {
  const location = await ensureRunLocation(run);
  if (!location) return false;
  const file = await location.runs.getFileHandle(metricFileName(metricId, run.runNumber), { create: true });
  const existing = await file.getFile();
  const text = samplesToCsv(points, { includeHeader: existing.size === 0 });
  await appendText(file, text);
  run.committed.set(metricId, (run.committed.get(metricId) ?? 0) + points.length);
  return true;
}

async function flushRunDirect(run, { terminal = false } = {}) {
  if (!rootHandle) return false;
  const started = performance.now();
  const location = await ensureRunLocation(run);
  if (!location) return false;
  let wrote = 0;
  for (const [id] of [...run.pending.entries()]) {
    const points = run.pending.get(id) ?? [];
    if (!points.length) { run.pending.delete(id); continue; }
    run.pending.set(id, []);
    try {
      await appendMetricSamples(run, id, points);
      wrote += points.length;
      if ((run.pending.get(id) ?? []).length === 0) run.pending.delete(id);
    } catch (error) {
      const newer = run.pending.get(id) ?? [];
      run.pending.set(id, [...points, ...newer]);
      throw error;
    }
  }
  if (wrote > 0) await appendText(location.log, `${JSON.stringify(runLogFlush(run))}\n`);
  if (terminal && run.terminal) {
    await appendText(location.log, `${JSON.stringify(runLogTerminal(run))}\n`);
    run.durable = true;
  }
  stats.flushCount += 1;
  stats.samplesFlushed += wrote;
  stats.flushMs += performance.now() - started;
  lastError = null;
  renderControls();
  return true;
}

function enqueue(task) {
  const next = ioChain.then(task);
  ioChain = next.catch((error) => {
    lastError = error instanceof Error ? error.message : String(error);
    renderControls();
  });
  return next;
}

function scheduleFlush(run = activeRun, immediate = false) {
  if (!run || !rootHandle || run.durable) return;
  if (immediate && flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  } else if (!immediate && flushTimer !== null) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    enqueue(() => flushRunDirect(run)).catch(() => {});
    if (run === activeRun && !run.terminal) scheduleFlush(run, false);
  }, immediate ? 0 : flushIntervalMs);
}

async function flushAllUnsavedToRoot() {
  if (!rootHandle) return;
  const candidates = [...unsavedRuns, ...(activeRun ? [activeRun] : [])];
  for (const run of candidates) {
    await flushRunDirect(run, { terminal: Boolean(run.terminal) });
    if (run.durable) unsavedRuns = unsavedRuns.filter((candidate) => candidate !== run);
  }
  renderControls();
}

function pauseForBackpressure() {
  if (!activeRun || activeRun.status !== "running") return;
  stats.autoPauseCount += 1;
  document.querySelector("#pause")?.click();
}

function enforcePendingBound(run) {
  if (sampleCount(run.pending) < PENDING_SAMPLE_LIMIT) return;
  lastError = rootHandle
    ? "Results writing is falling behind; the run was paused before samples could be lost."
    : "Results are not attached to a folder; the run was paused before the unsaved buffer could grow further.";
  scheduleFlush(run, true);
  pauseForBackpressure();
  renderControls();
}

function beginOrResumeRun() {
  if (!(definitionsIr?.metrics?.length > 0)) return;
  if (activeRun && !activeRun.terminal) {
    activeRun.status = "running";
    renderControls();
    return;
  }
  if (lastFinishedRun?.durable) lastFinishedRun.all.clear();
  activeRun = createRun();
  scheduleFlush(activeRun, false);
  renderControls();
}

function receiveBatch(batch) {
  if (!activeRun) beginOrResumeRun();
  if (!activeRun) return;
  addSamples(activeRun, batch);
  enforcePendingBound(activeRun);
  if (rootHandle) scheduleFlush(activeRun, false);
  renderControls();
}

function pauseRun() {
  if (!activeRun || activeRun.terminal) return;
  activeRun.status = "paused";
  if (rootHandle) scheduleFlush(activeRun, true);
  renderControls();
}

function finishRun(status, reason = null) {
  const run = activeRun;
  if (!run || run.terminal) return;
  activeRun = null;
  run.status = status;
  run.endedAt = nowIso();
  run.terminal = { status, reason };
  lastFinishedRun = run;
  if (!rootHandle) {
    if (!unsavedRuns.includes(run)) unsavedRuns.push(run);
    renderControls();
    return;
  }
  enqueue(async () => {
    try {
      await flushRunDirect(run, { terminal: true });
    } catch (error) {
      if (!unsavedRuns.includes(run)) unsavedRuns.push(run);
      throw error;
    }
  }).catch(() => {});
  renderControls();
}

function packageRunsForCurrentExperiment() {
  const experimentId = currentExperiment().id;
  return unsavedRuns.filter((run) => (
    run.experiment.id === experimentId
    && Boolean(run.terminal)
    && sampleCount(run.all) > 0
  ));
}

function packageRunCounts(run) {
  return Object.fromEntries([...run.all.entries()].map(([id, points]) => [id, points.length]));
}

function portableExperimentPackage() {
  const runs = packageRunsForCurrentExperiment();
  if (!runs.length) return null;
  const experiment = runs[0].experiment;
  const directory = sanitizePathSegment(experiment.title, "Experiment");
  const entries = [];
  const logLines = [];

  runs.forEach((run, index) => {
    const number = index + 1;
    for (const [id, points] of run.all.entries()) {
      entries.push({
        name: `${directory}/runs/${metricFileName(id, number)}`,
        text: samplesToCsv(points),
      });
    }
    logLines.push(JSON.stringify({
      ...runLogStart(run),
      run_number: number,
    }));
    logLines.push(JSON.stringify({
      ...runLogTerminal(run),
      run_number: number,
      samples: packageRunCounts(run),
    }));
  });

  entries.push({
    name: `${directory}/.vlab/experiment.json`,
    text: `${JSON.stringify({
      schema: "vlab.experiment-storage/0.1",
      experiment_id: experiment.id,
      title: experiment.title,
    }, null, 2)}\n`,
  });
  entries.push({
    name: `${directory}/.vlab/runs.ndjson`,
    text: `${logLines.join("\n")}\n`,
  });

  return {
    experiment,
    directory,
    runs,
    bytes: buildStoredZip(entries),
  };
}

function downloadExperimentPackage() {
  const packaged = portableExperimentPackage();
  if (!packaged) return;
  const blob = new Blob([packaged.bytes], { type: "application/zip" });
  const link = document.createElement("a");
  const href = URL.createObjectURL(blob);
  link.href = href;
  link.download = `${packaged.directory}_results.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  for (const run of packaged.runs) run.exported = true;
  renderControls();
}

function installStyles() {
  if (document.querySelector("style[data-vlab-result-storage]")) return;
  const style = document.createElement("style");
  style.dataset.vlabResultStorage = "";
  style.textContent = `
    .results-storage { display:flex; flex-wrap:wrap; align-items:center; gap:7px; padding:8px 0 0; border-top:1px solid #e7edef; }
    .results-storage-status { min-width:150px; flex:1 1 190px; font-size:11px; color:#65757c; }
    .results-storage-status[data-state="error"] { color:#9e2d29; }
    .results-storage-status[data-state="ok"] { color:#246240; }
    .results-storage label { display:inline-flex; align-items:center; gap:5px; font-size:10.5px; color:#607178; }
    .results-storage button, .results-storage select { min-height:32px; }
    .results-storage button { padding:5px 9px; font-size:11px; }
    .results-storage select { border:1px solid #cfd8dc; border-radius:8px; background:#fff; padding:4px 6px; }
    @media (max-width:560px) { .results-storage-status { flex-basis:100%; } }
  `;
  document.head.append(style);
}

function mountControls() {
  const results = document.querySelector("#live-results");
  if (!results || results.querySelector(".results-storage")) return;
  installStyles();
  const controls = document.createElement("div");
  controls.className = "results-storage";
  controls.innerHTML = `
    <span id="results-storage-status" class="results-storage-status" role="status"></span>
    <button id="results-storage-folder" type="button">Choose results folder</button>
    <label>Save every <select id="results-storage-frequency" aria-label="Results save frequency"></select></label>
    <button id="results-storage-export" type="button" hidden>Download experiment package</button>`;
  results.querySelector(".live-results-head")?.insertAdjacentElement("afterend", controls);
  const frequency = controls.querySelector("#results-storage-frequency");
  for (const ms of FLUSH_CHOICES) {
    const option = document.createElement("option");
    option.value = String(ms);
    option.textContent = ms < 1000 ? `${ms} ms` : `${ms / 1000} s`;
    frequency.append(option);
  }
  frequency.value = String(flushIntervalMs);
  frequency.addEventListener("change", () => {
    flushIntervalMs = Number(frequency.value) || DEFAULT_FLUSH_INTERVAL_MS;
    if (activeRun && rootHandle) scheduleFlush(activeRun, false);
  });
  controls.querySelector("#results-storage-folder").addEventListener("click", chooseOrReconnectRoot);
  controls.querySelector("#results-storage-export").addEventListener("click", downloadExperimentPackage);
  renderControls();
}

function renderControls() {
  const status = document.querySelector("#results-storage-status");
  const folder = document.querySelector("#results-storage-folder");
  const frequency = document.querySelector("#results-storage-frequency");
  const exportButton = document.querySelector("#results-storage-export");
  if (!status || !folder || !frequency || !exportButton) return;
  const pending = activeRun ? sampleCount(activeRun.pending) : 0;
  if (lastError) {
    status.textContent = lastError;
    status.dataset.state = "error";
  } else if (rootHandle) {
    status.textContent = pending > 0
      ? `Saving results to ${rootHandle.name || "selected folder"} · ${pending.toLocaleString()} samples pending`
      : `Results folder: ${rootHandle.name || "selected folder"}`;
    status.dataset.state = "ok";
  } else if (rememberedHandle) {
    status.textContent = "Reconnect the previously selected results folder.";
    status.dataset.state = "idle";
  } else if (!persistenceSupported) {
    status.textContent = "Direct folder writing is unavailable in this browser.";
    status.dataset.state = "idle";
  } else {
    status.textContent = "Choose a results folder to save raw metric files.";
    status.dataset.state = "idle";
  }
  folder.hidden = !persistenceSupported;
  folder.textContent = rootHandle ? "Change folder" : rememberedHandle ? "Reconnect folder" : "Choose results folder";
  folder.disabled = Boolean(rootHandle && activeRun && !activeRun.terminal);
  frequency.disabled = !rootHandle;
  exportButton.hidden = packageRunsForCurrentExperiment().length === 0;
}

async function chooseOrReconnectRoot() {
  try {
    lastError = null;
    if (rememberedHandle && !rootHandle) {
      const permission = await requestPermission(rememberedHandle);
      if (permission === "granted") rootHandle = rememberedHandle;
    }
    if (!rootHandle) {
      rootHandle = await globalThis.showDirectoryPicker({ id: "vlab-results-root", mode: "readwrite" });
      rememberedHandle = rootHandle;
      await rememberRootHandle(rootHandle);
    } else if (!activeRun) {
      rootHandle = await globalThis.showDirectoryPicker({ id: "vlab-results-root", mode: "readwrite" });
      rememberedHandle = rootHandle;
      await rememberRootHandle(rootHandle);
    }
    if (rootHandle) await enqueue(flushAllUnsavedToRoot);
  } catch (error) {
    if (error?.name !== "AbortError") lastError = error instanceof Error ? error.message : String(error);
  }
  renderControls();
}

async function restoreRoot() {
  if (!persistenceSupported) { renderControls(); return; }
  rememberedHandle = await readRememberedRootHandle();
  if (!rememberedHandle) { renderControls(); return; }
  if (await permissionState(rememberedHandle) === "granted") {
    rootHandle = rememberedHandle;
    enqueue(flushAllUnsavedToRoot).catch(() => {});
  }
  renderControls();
}

function diagnostics() {
  return {
    supported: persistenceSupported,
    mode: rootHandle ? "directory" : persistenceSupported ? "not-selected" : "package-export",
    rootName: rootHandle?.name ?? null,
    active: activeRun ? {
      id: activeRun.localId,
      runNumber: activeRun.runNumber,
      status: activeRun.status,
      pendingSamples: sampleCount(activeRun.pending),
      allSamples: sampleCount(activeRun.all),
    } : null,
    lastFinished: lastFinishedRun ? {
      runNumber: lastFinishedRun.runNumber,
      status: lastFinishedRun.terminal?.status ?? lastFinishedRun.status,
      durable: lastFinishedRun.durable,
      exported: lastFinishedRun.exported,
      samples: sampleCount(lastFinishedRun.all),
    } : null,
    unsavedRuns: unsavedRuns.length,
    packageRuns: packageRunsForCurrentExperiment().length,
    flushIntervalMs,
    pendingLimit: PENDING_SAMPLE_LIMIT,
    stats: { ...stats },
    error: lastError,
  };
}

document.addEventListener("vlab:metrics-definition", (event) => {
  definitionsIr = event.detail?.ir ?? null;
  renderControls();
});
document.addEventListener("vlab:run-start", beginOrResumeRun);
document.addEventListener("vlab:metric-batch", (event) => receiveBatch(event.detail));
document.addEventListener("vlab:run-paused", pauseRun);
document.addEventListener("vlab:run-complete", () => finishRun("completed"));
document.addEventListener("vlab:run-error", (event) => finishRun("failed", event.detail?.message ?? null));
document.addEventListener("vlab:metric-reset", (event) => {
  const reason = event.detail?.reason ?? "restarted";
  if (activeRun) finishRun("restarted", reason);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && activeRun && rootHandle) scheduleFlush(activeRun, true);
});

mountControls();
restoreRoot().catch(() => {});

Object.defineProperty(globalThis, "__vlabResultPersistence", {
  configurable: false,
  enumerable: false,
  value: Object.freeze({
    diagnostics,
    flushNow: () => activeRun ? enqueue(() => flushRunDirect(activeRun)) : Promise.resolve(false),
  }),
});
