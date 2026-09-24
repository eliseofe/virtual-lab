// The authoring panel's commands (#564), provided by authoring-workspace.js and
// called by every view. One instance in the page.
//
// apply() still runs through the workspace's Apply button, because the metrics
// runtime intercepts that button to apply Metrics-only edits; making Apply a
// direct command with Metrics as a participant is a separate step.

let provided = null;

export function provideAuthoringCommands(commands) {
  provided = commands;
}

export const authoringCommands = Object.freeze({
  selectArtifact: (id) => provided?.selectArtifact(id),
  apply: () => provided?.apply(),
});
