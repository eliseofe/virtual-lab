import { runtimeModel } from "./runtime/runtime-model.js";
import { simulationCommands } from "./runtime/simulation-commands.js";
import { metricsApplied, metricsApplyPending, metricsEdited, metricsFailed, registerMetricsParticipant } from "./authoring-panel/authoring-controller.js";
import { compileMetrics } from "./metrics/compiler.js";
import "./catalog-workspace.js";
import "./results-ui.js";
import "./result-persistence.js";

const NativeWorker = globalThis.Worker;
let activeSimulationWorker = null;
let activeParameters = {};
let activeReferences = [];
let activeAgentState = {};
let activeRuntimeCapabilities = [];
let lastBatch = null;
let lastBuffer = null;
let lastRuntimeContext = {};
let pendingMetricResetReason = null;
let pendingControllerApply = false;
let pendingSetupApply = false;

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
  const ir = compileMetrics(metricSource(), {
    parameters: parameterTypes(parameters),
    references: activeReferences,
    agentState: activeAgentState,
    runtimeCapabilities: activeRuntimeCapabilities,
  });
  dispatch("vlab:metrics-definition", { ir });
  return ir;
}

function rememberRuntimeMessage(message) {
  if (!message) return;
  if (message.type === "initialize" || message.type === "apply-setup") {
    lastRuntimeContext = {
      ...lastRuntimeContext,
      setup: {
        simulation: message.setup?.simulation ?? null,
        worldReferences: message.setup?.worldReferences ?? null,
      },
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

// Metrics apply outcomes are reported to the authoring controller (#567),
// which owns the apply status.
function failMetrics(message) {
  metricsFailed(message || "Metrics runtime error");
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
        metricsApplied();
      } else if (message.type === "metrics-error" || message.type === "metrics-runtime-error") {
        const wasApply = metricsApplyPending();
        pendingMetricResetReason = null;
        metricsFailed(message.message || "Metrics runtime error");
        if (!wasApply && message.type === "metrics-runtime-error") dispatch("vlab:run-error", message);
      } else if (message.type === "ready") {
        lastRuntimeContext = {
          ...lastRuntimeContext,
          kernelVersion: message.kernelVersion ?? lastRuntimeContext.kernelVersion ?? null,
          neighbourStrategy: message.neighbourStrategy ?? lastRuntimeContext.neighbourStrategy ?? null,
        };
        pendingSetupApply = false;
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
      if (Array.isArray(message.ir?.state)) {
        activeAgentState = Object.fromEntries(message.ir.state.map(({ name, type }) => [name, type]));
      }
      if (message.type === "initialize" || message.type === "apply-setup") {
        activeReferences = message.setup?.worldReferences?.references?.map(({ name }) => name) ?? [];
        activeRuntimeCapabilities = message.setup?.environment ? ["environment_scalar"] : [];
      }
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
  metricsEdited();
});

// The authoring controller asks for Metrics-only applies.
registerMetricsParticipant({ applyMetrics: () => dispatch("vlab:apply-metrics") });

document.addEventListener("vlab:apply-metrics", () => {
  if (!activeSimulationWorker) {
    failMetrics("Simulation worker is not ready.");
    return;
  }
  try {
    if (runtimeModel.get().controls.pause) simulationCommands.pause();
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
