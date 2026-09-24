// Behaviour tests for the authoring apply rules (#567).

import assert from "node:assert/strict";
import test from "node:test";

import { authoringStatus, createAuthoringMachine } from "../src/authoring-panel/authoring-machine.js";

function setup({ applySources = true } = {}) {
  const calls = [];
  const runtime = {
    applySources,
    sourceStatus: { setup: { state: "success" }, controller: { state: "success" } },
  };
  const machine = createAuthoringMachine({
    runtime: () => runtime,
    // Like the simulator, a started apply first reports "working".
    applySetup: () => { calls.push("applySetup"); runtime.sourceStatus = { ...runtime.sourceStatus, setup: { state: "working" } }; },
    applyController: () => { calls.push("applyController"); runtime.sourceStatus = { ...runtime.sourceStatus, controller: { state: "working" } }; },
    applyMetrics: () => calls.push("applyMetrics"),
    changed: () => {},
  });
  const outcome = (kind, state) => { runtime.sourceStatus = { ...runtime.sourceStatus, [kind]: { state } }; machine.sourcesSettled(); };
  const shown = () => { const v = machine.view(); return [v.status.text, v.applyDisabled ? "off" : "on", Object.entries(v.dirty).filter(([, d]) => d).map(([id]) => id).join(",")]; };
  return { machine, calls, runtime, outcome, shown };
}

test("nothing to apply: sources applied, Apply off", () => {
  const { shown } = setup();
  assert.deepEqual(shown(), ["Runtime sources applied", "off", ""]);
});

test("Metrics-only edits are applied by the metrics runtime alone", () => {
  const { machine, calls, shown } = setup();
  machine.edited("metrics");
  assert.deepEqual(shown(), ["Runtime changes pending", "on", "metrics"]);
  machine.apply();
  assert.deepEqual(calls, ["applyMetrics"]);
  assert.deepEqual(shown(), ["Applying runtime changes…", "off", "metrics"]);
  machine.apply();
  assert.deepEqual(calls, ["applyMetrics"], "no second apply while one is in progress");
  machine.metricsApplied();
  assert.deepEqual(shown(), ["Runtime sources applied", "off", ""]);
});

test("a Metrics error is shown until Metrics is edited again, and the edit stays pending", () => {
  const { machine, shown } = setup();
  machine.edited("metrics");
  machine.apply();
  machine.metricsFailed("bad metric");
  assert.deepEqual(shown(), ["Metrics source has an error", "on", "metrics"]);
  machine.edited("metrics");
  assert.deepEqual(shown(), ["Runtime changes pending", "on", "metrics"]);
});

test("configuration edits apply the setup; controller edits apply the controller", () => {
  const { machine, calls, outcome, shown } = setup();
  machine.edited("configuration");
  machine.edited("controller");
  assert.deepEqual(shown(), ["Runtime changes pending", "on", "configuration,initialization,controller"]);
  machine.apply();
  assert.deepEqual(calls, ["applySetup"], "the setup apply also restarts with the current controller");
  outcome("setup", "success");
  assert.deepEqual(shown(), ["Runtime sources applied", "off", ""]);

  machine.edited("controller");
  machine.apply();
  assert.deepEqual(calls, ["applySetup", "applyController"]);
  outcome("controller", "success");
  assert.deepEqual(shown(), ["Runtime sources applied", "off", ""]);
});

test("Apply follows the simulator's availability while core sources are edited", () => {
  const { machine, calls, shown } = setup({ applySources: false });
  machine.edited("controller");
  assert.deepEqual(shown(), ["Runtime changes pending", "off", "controller"]);
  machine.apply();
  assert.deepEqual(calls, []);
});

test("a successful setup or controller apply also applies pending Metrics edits", () => {
  const { machine, calls, outcome, shown } = setup();
  machine.edited("metrics");
  machine.edited("controller");
  machine.apply();
  assert.deepEqual(calls, ["applyController"], "Metrics ride along with the controller apply");
  outcome("controller", "success");
  assert.deepEqual(shown(), ["Runtime sources applied", "off", ""]);
});

test("#567 fix: a failed controller apply applies nothing, so Metrics edits stay pending", () => {
  const { machine, outcome, shown } = setup();
  machine.edited("metrics");
  machine.edited("controller");
  machine.apply();
  outcome("controller", "error");
  assert.deepEqual(shown(), ["Runtime changes pending", "on", "controller,metrics"],
    "previously the Metrics marker was cleared because an earlier, unrelated setup apply had succeeded");
});

test("#567 fix: an apply requested by another module (e.g. loading an Experiment) also applies pending Metrics", () => {
  const { machine, calls, runtime, outcome, shown } = setup();
  machine.edited("metrics");
  runtime.sourceStatus = { ...runtime.sourceStatus, setup: { state: "working" } };
  machine.applyRequested("setup");
  assert.deepEqual(shown(), ["Applying runtime changes…", "off", "metrics"]);
  assert.deepEqual(calls, [], "the other module started the apply itself");
  outcome("setup", "success");
  assert.deepEqual(shown(), ["Runtime sources applied", "off", ""],
    "previously the Metrics tab kept saying 'unapplied' although those edits had been applied");
});

test("an outside request while an apply is in progress does not replace it", () => {
  const { machine, outcome, shown } = setup();
  machine.edited("configuration");
  machine.apply();
  machine.applyRequested("controller");
  outcome("controller", "success");
  assert.deepEqual(shown()[0], "Applying runtime changes…", "still waiting for the setup outcome");
  outcome("setup", "error");
  assert.deepEqual(shown(), ["Runtime changes pending", "on", "configuration,initialization"]);
});

test("with nothing pending, a failed source is reported", () => {
  assert.deepEqual(authoringStatus({
    setupDirty: false, controllerDirty: false, metricsDirty: false, pending: null, metricsError: null,
    applySources: true, sourceStatus: { setup: { state: "error" }, controller: { state: "success" } },
  }).status.text, "Runtime source has an error");
});
