// Behaviour tests for the live-results model and command surface (#564).

import assert from "node:assert/strict";
import test from "node:test";

import { provideResultsCommands, resultsCommands } from "../src/results-panel/results-commands.js";
import { RESULTS_INITIAL_STATE, resultsModel } from "../src/results-panel/results-model.js";

test("the results model starts empty with the page's initial status", async () => {
  const { readFile } = await import("node:fs/promises");
  const ui = await readFile(new URL("../src/results-ui.js", import.meta.url), "utf8");
  assert.match(ui, new RegExp(`id="live-results-status" class="live-results-status">${RESULTS_INITIAL_STATE.status.text}<`));
  assert.deepEqual(resultsModel.get(), RESULTS_INITIAL_STATE);
  assert.equal(RESULTS_INITIAL_STATE.canAdd, false);
});

test("results commands do nothing until provided, then reach the one results controller", () => {
  assert.doesNotThrow(() => resultsCommands.addPanel());
  const calls = [];
  provideResultsCommands({
    addPanel: () => calls.push(["addPanel"]),
    removePanel: (id) => calls.push(["removePanel", id]),
    toggleMetric: (id, metric) => calls.push(["toggleMetric", id, metric]),
    followLive: (id) => calls.push(["followLive", id]),
  });
  resultsCommands.addPanel();
  resultsCommands.toggleMetric(2, "order");
  resultsCommands.followLive(2);
  resultsCommands.removePanel(2);
  assert.deepEqual(calls, [["addPanel"], ["toggleMetric", 2, "order"], ["followLive", 2], ["removePanel", 2]]);
  assert.ok(Object.isFrozen(resultsCommands));
});
