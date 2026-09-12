export const EXPERIMENT_ARTIFACTS = Object.freeze([
  Object.freeze({
    id: "configuration",
    registryField: "config_source",
    editorSelector: "#experiment-config",
  }),
  Object.freeze({
    id: "initialization",
    registryField: "initializer_source",
    editorSelector: "#initializer-source",
  }),
  Object.freeze({
    id: "controller",
    registryField: "controller_source",
    editorSelector: "#controller-source",
  }),
]);

function editorFor(root, descriptor) {
  const editor = root.querySelector(descriptor.editorSelector);
  if (!editor) {
    throw new Error(`Virtual Lab artifact UI mismatch: missing '${descriptor.id}' editor.`);
  }
  return editor;
}

export function captureExperimentArtifacts(root = document) {
  return Object.fromEntries(
    EXPERIMENT_ARTIFACTS.map((descriptor) => [
      descriptor.registryField,
      editorFor(root, descriptor).value,
    ]),
  );
}

export function applyExperimentArtifacts(experiment, root = document) {
  for (const descriptor of EXPERIMENT_ARTIFACTS) {
    const source = experiment?.[descriptor.registryField];
    if (typeof source !== "string") {
      throw new Error(`Experiment is missing source artifact '${descriptor.registryField}'.`);
    }
    editorFor(root, descriptor).value = source;
  }
}
