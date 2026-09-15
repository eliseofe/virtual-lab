import { compileMetrics } from "./metrics/compiler.js";
import "./builtin-active-elastic-metrics.js";
import "./results-ui.js";
import "./result-persistence.js";

const NativeWorker = globalThis.Worker;
let activeSimulationWorker = null;
let activeParameters = {};
let lastBatch = null;
let lastBuffer = null;
let lastRuntimeContext = {};
let pendingMetricResetReason = null;
let pendingControllerApply = false;
let pendingSetupApply = false;
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

function dispatch(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

function compiledMetrics(parameters) {
  const ir = compileMetrics(metricSource(), { parameters: parameterTypes(parameters) });
  dispatch("vlab:metrics-definition", { ir });
  return ir;
}

function rememberRuntimeMessage(message) {
  if (!message) return;
  if (message.type === "initialize" || message.type === "apply-setup") {
    lastRuntimeContext = {
      ...lastRuntimeContext,
      setup: { simulation: message.setup?.simulation ?? null },
      controllerIr: message.ir ?? null,
      parameters: message.parameters ?? {},
      metricsIr: message.metricsIr ?? null,
    };
  } else if (message.type === "apply-controller") {
    lastRuntimeContext = {
      ...lastRuntimeContext,
      controllerIr: message.ir ?? lastRuntimeContext.controllerIr ?? null,
      parameters: message.parameters ?? lastRuntimeContext.parameters ?? {},
      metricsIr: message.metricsIr ?? lastRuntimeContext.metricsIr ?? null,
    };
  } else if (message.type === "apply-metrics") {
    lastRuntimeContext = {
      ...lastRuntimeContext,
      parameters: message.parameters ?? lastRuntimeContext.parameters ?? {},
      metricsIr: message.metricsIr ?? lastRuntimeContext.metricsIr ?? null,
    };
  }
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

function failMetrics(message) {
  metricsApplyPending = false;
  syncMetricsAuthoringUi({ error: message || "Metrics runtime error" });
  dispatch("vlab:metrics-error", { message: message || "Metrics runtime error" });
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
        dispatch("vlab:metric-reset", { ...message, reason: pendingMetricResetReason });
        pendingMetricResetReason = null;
      } else if (message.type === "metrics-applied") {
        metricsApplyPending = false;
        metricsDirty = false;
        syncMetricsAuthoringUi();
        dispatch("vlab:metrics-applied", message);
      } else if (message.type === "metrics-error" || message.type === "metrics-runtime-error") {
        const wasApply = metricsApplyPending;
        metricsApplyPending = false;
        pendingMetricResetReason = null;
        syncMetricsAuthoringUi({ error: message.message || "Metrics runtime error" });
        dispatch("vlab:metrics-error", message);
        if (!wasApply && message.type === "metrics-runtime-error") dispatch("vlab:run-error", message);
      } else if (message.type === "ready") {
        lastRuntimeContext = {
          ...lastRuntimeContext,
          kernelVersion: message.kernelVersion ?? lastRuntimeContext.kernelVersion ?? null,
          neighbourStrategy: message.neighbourStrategy ?? lastRuntimeContext.neighbourStrategy ?? null,
        };
        pendingSetupApply = false;
        dispatch("vlab:runtime-ready", lastRuntimeContext);
      } else if (message.type === "paused") {
        dispatch("vlab:run-paused", message);
      } else if (message.type === "completed") {
        dispatch("vlab:run-complete", message);
      } else if (message.type === "setup-applied") {
        pendingSetupApply = false;
      } else if (message.type === "controller-applied") {
        pendingControllerApply = false;
      } else if (message.type === "setup-error") {
        pendingSetupApply = false;
        pendingMetricResetReason = null;
      } else if (message.type === "controller-runtime-error") {
        const wasApply = pendingControllerApply;
        pendingControllerApply = false;
        pendingMetricResetReason = null;
        if (!wasApply) dispatch("vlab:run-error", message);
      } else if (message.type === "error") {
        dispatch("vlab:run-error", message);
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
    if (next?.type === "initialize") pendingMetricResetReason = "initialize";
    else if (next?.type === "reset") pendingMetricResetReason = "restart";
    else if (next?.type === "apply-setup") {
      pendingMetricResetReason = "configuration changed";
      pendingSetupApply = true;
    } else if (next?.type === "apply-controller") {
      pendingMetricResetReason = "controller changed";
      pendingControllerApply = true;
    } else if (next?.type === "apply-metrics") pendingMetricResetReason = "metrics changed";

    rememberRuntimeMessage(next);
    if (next?.type === "run") dispatch("vlab:run-start", {
      speed: next.speed ?? null,
      stopAtScientificTime: next.stopAtScientificTime ?? null,
    });
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
    failMetrics("Simulation worker is not ready.");
    return;
  }
  try {
    const pause = document.querySelector("#pause");
    if (pause && !pause.disabled) pause.click();
    else activeSimulationWorker.postMessage({ type: "pause" });
    activeSimulationWorker.postMessage({
      type: "apply-metrics",
      metricsIr: compiledMetrics(activeParameters),
      parameters: activeParameters,
    });
  } catch (error) {
    failMetrics(error instanceof Error ? error.message : String(error));
  }
});

Object.defineProperty(globalThis, "__vlabMetricRuntime", {
  configurable: false,
  enumerable: false,
  value: Object.freeze({
    lastBatch: () => lastBatch,
    bufferStatus: () => lastBuffer,
    runtimeContext: () => lastRuntimeContext,
  }),
});
