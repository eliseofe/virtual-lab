// The live-results model (#564): what the results panel shows. results-ui.js,
// which receives the metric samples, is its only writer; views subscribe to it.
// One instance in the page (external to the React bundle; see vite.config.ts).

import { createModel } from "../runtime/runtime-model.js";

export const RESULTS_INITIAL_STATE = Object.freeze({
  status: Object.freeze({ text: "No metric samples yet", state: "idle" }),
  canAdd: false,
  // [{ id, label, color }] for every known metric, configured ones first.
  metrics: Object.freeze([]),
  // [{ id, metricIds }] for every plot panel, in order.
  panels: Object.freeze([]),
});

export const resultsModel = createModel(RESULTS_INITIAL_STATE);
