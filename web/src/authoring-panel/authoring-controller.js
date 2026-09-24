// The authoring controller (#567): the one owner of which artifacts have edits
// not yet applied to the running simulator, which apply is in progress, and
// the apply status every view shows. The rules are the pure state machine in
// authoring-machine.js; this module wires it to the page, the simulator and
// the metrics runtime.
//
// It replaces two modules that each wrote the status (authoring-workspace.js
// for the configuration, initializer and controller; metrics-runtime-bridge.js
// for Metrics) and read each other's markers from the page. Participants:
// - the simulator (main.js) applies setup and controller through
//   simulationCommands and reports each request and outcome in the runtime
//   model (sourceApplyRequest, sourceStatus);
// - the metrics runtime (metrics-runtime-bridge.js) applies Metrics-only edits
//   when asked, and reports edits, success and failure here.
//
// Loaded early (by metrics-runtime-bridge.js) so the panel keeps working even
// if later page modules fail to load. One instance in the page.

import { authoringModel, setArtifactDirty } from "./authoring-model.js";
import { provideAuthoringCommands } from "./authoring-commands.js";
import { createAuthoringMachine } from "./authoring-machine.js";
import { runtimeModel } from "../runtime/runtime-model.js";
import { simulationCommands } from "../runtime/simulation-commands.js";

let metricsParticipant = null;

function render() {
  const view = machine.view();
  for (const [id, value] of Object.entries(view.dirty)) {
    setArtifactDirty(id, value);
    document.querySelector(`#authoring-tabs [data-artifact-id="${id}"]`)?.toggleAttribute("data-dirty", authoringModel.get().dirty[id]);
  }
  authoringModel.set({ status: view.status, applyDisabled: view.applyDisabled });
  const statusLine = document.querySelector("#authoring-runtime-state");
  const applyButton = document.querySelector("#apply-workspace");
  if (statusLine) {
    statusLine.textContent = authoringModel.get().status.text;
    statusLine.dataset.state = authoringModel.get().status.state;
  }
  if (applyButton) applyButton.disabled = authoringModel.get().applyDisabled;
}

const machine = createAuthoringMachine({
  runtime: () => ({ applySources: runtimeModel.get().controls.applySources, sourceStatus: runtimeModel.get().sourceStatus }),
  applySetup: () => simulationCommands.applySetup(),
  applyController: () => simulationCommands.applyController(),
  applyMetrics: () => metricsParticipant?.applyMetrics(),
  changed: render,
});

// --- Metrics participant ----------------------------------------------------

export function registerMetricsParticipant(participant) {
  metricsParticipant = participant;
}

export const metricsEdited = () => machine.edited("metrics");
export const metricsApplied = () => machine.metricsApplied();
export const metricsFailed = (message) => machine.metricsFailed(message);
export const metricsApplyPending = () => machine.metricsApplyPending();

// --- Wiring -------------------------------------------------------------------

document.querySelector("#experiment-config")?.addEventListener("input", () => machine.edited("configuration"));
document.querySelector("#initializer-source")?.addEventListener("input", () => machine.edited("initialization"));
document.querySelector("#controller-source")?.addEventListener("input", () => machine.edited("controller"));

// Outcomes and availability are handled after the step that reported them, as
// the page observers this replaces were.
let settleQueued = false;
let renderQueued = false;
runtimeModel.subscribe((_state, written) => {
  if (written.includes("sourceApplyRequest")) {
    const request = runtimeModel.get().sourceApplyRequest;
    if (request) machine.applyRequested(request.kind);
  }
  if (written.includes("sourceStatus") && !settleQueued) {
    settleQueued = true;
    queueMicrotask(() => { settleQueued = false; machine.sourcesSettled(); });
  }
  if (written.includes("controls") && !renderQueued) {
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; render(); });
  }
});

const apply = () => machine.apply();
document.querySelector("#apply-workspace")?.addEventListener("click", apply);
provideAuthoringCommands({ apply });
render();
