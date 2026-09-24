// The authoring (code editor) panel's model (#564): the artifact tabs, which
// one is open, which have unapplied edits, and the runtime-apply status. It is
// written by authoring-workspace.js and, for the Metrics artifact and its
// apply cycle, by metrics-runtime-bridge.js, at exactly the moments they have
// always updated the page; views subscribe to it. One instance in the page
// (external to the React bundle; see vite.config.ts).

import { createModel } from "../runtime/runtime-model.js";

export const AUTHORING_INITIAL_STATE = Object.freeze({
  // [{ id, label, controls }] in tab order. The four built-in artifacts are part
  // of the page's fixed structure (index.html); authoring-workspace.js adds
  // any further artifacts an Experiment declares.
  artifacts: Object.freeze([
    Object.freeze({ id: "configuration", label: "Configuration", controls: "authoring-pane-configuration" }),
    Object.freeze({ id: "initialization", label: "Initialization", controls: "authoring-pane-initialization" }),
    Object.freeze({ id: "controller", label: "Controller", controls: "authoring-pane-controller" }),
    Object.freeze({ id: "metrics", label: "Metrics", controls: "authoring-pane-metrics" }),
  ]),
  active: "configuration",
  // { [artifactId]: true } for artifacts with edits not yet applied to the runtime.
  dirty: Object.freeze({}),
  status: Object.freeze({ text: "Runtime sources applied", state: "clean" }),
  applyDisabled: true,
});

export const authoringModel = createModel(AUTHORING_INITIAL_STATE);

// Marks one artifact's unapplied-edits flag.
export function setArtifactDirty(id, dirty) {
  const current = authoringModel.get().dirty;
  authoringModel.set({ dirty: Object.freeze({ ...current, [id]: Boolean(dirty) }) });
}
