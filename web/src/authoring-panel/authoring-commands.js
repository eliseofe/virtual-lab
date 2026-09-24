// The authoring panel's commands (#564), provided by authoring-workspace.js and
// called by every view. One instance in the page.
//
// authoring-controller.js provides apply(); authoring-workspace.js provides
// selectArtifact(). Each provider supplies its own commands.

let provided = null;

export function provideAuthoringCommands(commands) {
  provided = { ...provided, ...commands };
}

export const authoringCommands = Object.freeze({
  selectArtifact: (id) => provided?.selectArtifact(id),
  apply: () => provided?.apply(),
});
