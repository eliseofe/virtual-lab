import { compileMetrics } from "./metrics/compiler.js";

const NativeWorker = globalThis.Worker;
let activeSimulationWorker = null;
let activeParameters = {};
let lastBatch = null;
let lastBuffer = null;

function metricSource() {
  return document.querySelector(
    '[data-experiment-artifact-editor="true"][data-experiment-artifact-id="metrics"]',
  )?.value ?? "";
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
        dispatch("vlab:metrics-applied", message);
      } else if (message.type === "metrics-error" || message.type === "metrics-runtime-error") {
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
