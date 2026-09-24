// The authoring apply rules (#567), as a pure state machine: no DOM. The
// authoring controller (authoring-controller.js) wires it to the page, the
// simulator and the metrics runtime; web/tests/authoring-machine.test.mjs
// tests it directly.
//
// Rules:
// - Apply, when available, applies Metrics alone if only Metrics changed;
//   otherwise the setup (if the configuration or initializer changed), else
//   the controller.
// - A setup or controller apply always carries the current Metrics, so when
//   one requested through Apply or by another module (e.g. the Experiment
//   loader) succeeds, pending Metrics edits are applied too; when it fails,
//   nothing is applied and every edit stays pending.

const STATUS = Object.freeze({
  working: Object.freeze({ text: "Applying runtime changes…", state: "working" }),
  pending: Object.freeze({ text: "Runtime changes pending", state: "dirty" }),
  metricsError: Object.freeze({ text: "Metrics source has an error", state: "error" }),
  sourceError: Object.freeze({ text: "Runtime source has an error", state: "error" }),
  applied: Object.freeze({ text: "Runtime sources applied", state: "clean" }),
});

// What the panel shows for a given state.
export function authoringStatus({ setupDirty, controllerDirty, metricsDirty, pending, metricsError, applySources, sourceStatus }) {
  if (pending) return { status: STATUS.working, applyDisabled: true };
  if (metricsError) return { status: STATUS.metricsError, applyDisabled: false };
  if (setupDirty || controllerDirty) return { status: STATUS.pending, applyDisabled: !applySources };
  if (metricsDirty) return { status: STATUS.pending, applyDisabled: false };
  const hasError = sourceStatus.setup.state === "error" || sourceStatus.controller.state === "error";
  return { status: hasError ? STATUS.sourceError : STATUS.applied, applyDisabled: true };
}

// `runtime()` returns { applySources, sourceStatus }; `applySetup`,
// `applyController` and `applyMetrics` start an apply; `changed()` is called
// after every state change.
export function createAuthoringMachine({ runtime, applySetup, applyController, applyMetrics, changed }) {
  const state = {
    setupDirty: false,
    controllerDirty: false,
    metricsDirty: false,
    // null | "setup" | "controller" | "metrics" | "external-setup" | "external-controller"
    pending: null,
    metricsError: null,
  };

  const view = () => {
    const { applySources, sourceStatus } = runtime();
    return { ...authoringStatus({ ...state, applySources, sourceStatus }), dirty: {
      configuration: state.setupDirty,
      initialization: state.setupDirty,
      controller: state.controllerDirty,
      metrics: state.metricsDirty,
    } };
  };

  const machine = {
    state: () => ({ ...state }),
    view,
    edited(artifact) {
      if (artifact === "configuration" || artifact === "initialization") state.setupDirty = true;
      else if (artifact === "controller") state.controllerDirty = true;
      else if (artifact === "metrics") {
        state.metricsDirty = true;
        state.metricsError = null;
      } else return;
      changed();
    },
    apply() {
      if (view().applyDisabled || state.pending) return;
      if (state.metricsDirty && !state.setupDirty && !state.controllerDirty) {
        state.pending = "metrics";
        state.metricsError = null;
        changed();
        applyMetrics();
      } else if (state.setupDirty) {
        state.pending = "setup";
        changed();
        applySetup();
      } else if (state.controllerDirty) {
        state.pending = "controller";
        changed();
        applyController();
      }
    },
    // Another module requested a setup/controller apply.
    applyRequested(kind) {
      if (state.pending) return;
      state.pending = `external-${kind}`;
      changed();
    },
    // The setup/controller apply outcome may have changed.
    sourcesSettled() {
      if (state.pending && state.pending !== "metrics") {
        const kind = state.pending.endsWith("setup") ? "setup" : "controller";
        const outcome = runtime().sourceStatus[kind].state;
        if (outcome === "success") {
          if (kind === "setup") state.setupDirty = false;
          state.controllerDirty = false;
          state.metricsDirty = false;
          state.metricsError = null;
          state.pending = null;
        } else if (outcome === "error") {
          state.pending = null;
        }
      }
      changed();
    },
    metricsApplied() {
      if (state.pending === "metrics") state.pending = null;
      state.metricsDirty = false;
      state.metricsError = null;
      changed();
    },
    metricsFailed(message) {
      if (state.pending === "metrics") state.pending = null;
      state.metricsError = message || "Metrics runtime error";
      changed();
    },
    metricsApplyPending: () => state.pending === "metrics",
  };
  return machine;
}
