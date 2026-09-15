import { compileMetrics } from "./metrics/compiler.js";

const NativeWorker = globalThis.Worker;
let activeSimulationWorker = null;
let activeParameters = {};
let lastBatch = null;
let lastBuffer = null;
let metricsDirty = false;
let metricsApplyPending = false;
let metricsPiggybackPending = false;

function metricEditor() {
  return document.querySelector(
    '[data-experiment-artifact-editor="true"][data-experiment-artifact-id="metrics"]',
  );
}

function metricSource() {
  return metricEditor()?.value ?? "";
}

function parameterTypes(parameters) {
  return Object.fromEntries(Object.keys(parameters ?? {}).map((name) => [name, "scalar"]));
}

function compiledMetrics(parameters) {
  return compileMetrics(metricSource(), { parameters: parameterTypes(parameters) });
}

function dispatch(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

function coreRuntimeDirty() {
  return ["configuration", "initialization", "controller"].some((id) =>
    document.querySelector(`[data-artifact-id="${id}"]`)?.hasAttribute("data-dirty"));
}

function syncMetricsAuthoringUi({ error = null } = {}) {
  const tab = document.querySelector('[data-artifact-id="metrics"]');
  tab?.toggleAttribute("data-dirty", metricsDirty);
  const apply = document.querySelector("#apply-workspace");
  const state = document.querySelector("#authoring-runtime-state");
  if (!apply || !state) return;

  if (metricsApplyPending) {
    apply.disabled = true;
    state.textContent = "Applying runtime changes…";
    state.dataset.state = "working";
    return;
  }
  if (error) {
    apply.disabled = false;
    state.textContent = "Metrics source has an error";
    state.dataset.state = "error";
    return;
  }
  if (metricsDirty) {
    apply.disabled = false;
    state.textContent = "Runtime changes pending";
    state.dataset.state = "dirty";
    return;
  }
  if (!coreRuntimeDirty()) {
    apply.disabled = true;
    state.textContent = "Runtime sources applied";
    state.dataset.state = "clean";
  }
}

function settlePiggybackFromFeedback() {
  if (!metricsPiggybackPending) return;
  const setupState = document.querySelector("#setup-feedback")?.dataset.state;
  const controllerState = document.querySelector("#compile-feedback")?.dataset.state;
  if (setupState === "success" || controllerState === "success") {
    metricsDirty = false;
    metricsPiggybackPending = false;
    syncMetricsAuthoringUi();
  } else if (setupState === "error" || controllerState === "error") {
    metricsPiggybackPending = false;
    syncMetricsAuthoringUi();
  }
}

class MetricsAwareWorker extends NativeWorker {
  constructor(url, options) {
    super(url, options);
    const href = String(url instanceof URL ? url.href : url);
    if (!href.includes("worker.js")) return;
    activeSimulationWorker = this;
    this.addEventListener("message", (event) => {
      const message = event.data ?? {};
      if (message.type === "metric-batch") {
        lastBatch = message.batch ?? null;
        lastBuffer = message.batch?.buffer ?? null;
        dispatch("vlab:metric-batch", message.batch ?? {});
      } else if (message.type === "metric-reset") {
        lastBatch = null;
        lastBuffer = null;
        dispatch("vlab:metric-reset", message);
      } else if (message.type === "metrics-applied") {
        metricsApplyPending = false;
        metricsDirty = false;
        syncMetricsAuthoringUi();
        dispatch("vlab:metrics-applied", message);
      } else if (message.type === "metrics-error" || message.type === "metrics-runtime-error") {
        metricsApplyPending = false;
        syncMetricsAuthoringUi({ error: message.message || "Metrics runtime error" });
        dispatch("vlab:metrics-error", message);
      }
    });
  }

  postMessage(message, transferOrOptions) {
    let next = message;
    if (message && ["initialize", "apply-setup", "apply-controller"].includes(message.type)) {
      activeParameters = message.parameters ?? activeParameters;
      next = {
        ...message,
        metricsIr: compiledMetrics(activeParameters),
      };
    }
    return super.postMessage(next, transferOrOptions);
  }
}

globalThis.Worker = MetricsAwareWorker;

document.addEventListener("input", (event) => {
  if (event.target !== metricEditor()) return;
  metricsDirty = true;
  syncMetricsAuthoringUi();
});

document.addEventListener("click", (event) => {
  const apply = event.target?.closest?.("#apply-workspace");
  if (!apply || !metricsDirty || metricsApplyPending) return;
  if (coreRuntimeDirty()) {
    metricsPiggybackPending = true;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  metricsApplyPending = true;
  syncMetricsAuthoringUi();
  dispatch("vlab:apply-metrics");
}, true);

for (const feedback of [document.querySelector("#setup-feedback"), document.querySelector("#compile-feedback")]) {
  if (!feedback) continue;
  new MutationObserver(settlePiggybackFromFeedback).observe(feedback, {
    attributes: true,
    attributeFilter: ["data-state"],
    childList: true,
    characterData: true,
    subtree: true,
  });
}

document.addEventListener("vlab:apply-metrics", () => {
  if (!activeSimulationWorker) {
    dispatch("vlab:metrics-error", { message: "Simulation worker is not ready." });
    return;
  }
  try {
    activeSimulationWorker.postMessage({
      type: "apply-metrics",
      metricsIr: compiledMetrics(activeParameters),
      parameters: activeParameters,
    });
  } catch (error) {
    metricsApplyPending = false;
    dispatch("vlab:metrics-error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

Object.defineProperty(globalThis, "__vlabMetricRuntime", {
  configurable: false,
  enumerable: false,
  value: Object.freeze({
    lastBatch: () => lastBatch,
    bufferStatus: () => lastBuffer,
  }),
});
