import { METRICS_LANGUAGE } from "./metrics/compiler.js";

export const EXPERIMENT_ARTIFACTS = Object.freeze([
  Object.freeze({ id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", language: "python", order: 10, registryField: "config_source" }),
  Object.freeze({ id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", language: "python", order: 20, registryField: "initializer_source" }),
  Object.freeze({ id: "controller", type: "controller", label: "Controller", format: "python-vlab", language: "python", order: 30, registryField: "controller_source" }),
  Object.freeze({ id: "metrics", type: "metrics", label: "Metrics", format: METRICS_LANGUAGE, language: "python", order: 40, registryField: null }),
]);

const CORE_BY_ID = new Map(EXPERIMENT_ARTIFACTS.map((descriptor) => [descriptor.id, descriptor]));
const CORE_BY_TYPE = new Map(EXPERIMENT_ARTIFACTS.map((descriptor) => [descriptor.type, descriptor]));
const GENERIC_TEXT_FORMATS = new Set(["python-vlab", METRICS_LANGUAGE, "text/plain", "text/markdown", "markdown"]);

export function artifactEditorLanguage(artifact) {
  const core = CORE_BY_TYPE.get(artifact?.type);
  if (core?.language) return core.language;
  const format = typeof artifact?.format === "string" ? artifact.format.trim() : "";
  if (format === "text/markdown" || format === "markdown") return "markdown";
  if (format === "python-vlab" || format.startsWith("python-vlab-") || format.startsWith("python-vlab/")) return "python";
  return "plain";
}

const SOURCE_REPLACED_EVENT = "vlab:artifact-source-replaced";

function notifyAuthoritativeSourceReplaced(editor) {
  if (typeof editor?.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  editor.dispatchEvent(new CustomEvent(SOURCE_REPLACED_EVENT));
}

function artifactEditorFor(root, id) {
  const selector = `[data-experiment-artifact-editor="true"][data-experiment-artifact-id="${id}"]`;
  const declared = root.querySelector?.(selector);
  if (declared) return declared;
  const container = root.querySelector("#additional-experiment-artifacts");
  return container?.querySelector?.(selector) ?? null;
}

function normalizeArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") throw new Error("Experiment artifact must be an object.");
  const normalized = { id: artifact.id, type: artifact.type, label: artifact.label, format: artifact.format, order: artifact.order, content: artifact.content };
  if (typeof normalized.id !== "string" || !normalized.id.trim()) throw new Error("Experiment artifact requires a non-empty id.");
  if (typeof normalized.type !== "string" || !normalized.type.trim()) throw new Error(`Artifact '${normalized.id}' requires a non-empty type.`);
  if (typeof normalized.label !== "string" || !normalized.label.trim()) throw new Error(`Artifact '${normalized.id}' requires a non-empty label.`);
  if (typeof normalized.format !== "string" || !normalized.format.trim()) throw new Error(`Artifact '${normalized.id}' requires a non-empty format.`);
  if (typeof normalized.order !== "number" || !Number.isFinite(normalized.order)) throw new Error(`Artifact '${normalized.id}' requires a finite numeric order.`);
  if (typeof normalized.content !== "string") throw new Error(`Artifact '${normalized.id}' content must be a string.`);
  return normalized;
}

function coreArtifactsFromLegacy(experiment) {
  return EXPERIMENT_ARTIFACTS.map((descriptor) => ({
    id: descriptor.id,
    type: descriptor.type,
    label: descriptor.label,
    format: descriptor.format,
    order: descriptor.order,
    content: descriptor.registryField ? (experiment?.[descriptor.registryField] ?? "") : "",
  }));
}

export function experimentArtifactArray(experiment) {
  const raw = Array.isArray(experiment?.artifacts) ? experiment.artifacts : coreArtifactsFromLegacy(experiment);
  const artifacts = raw.map(normalizeArtifact);
  const ids = new Set();
  for (const artifact of artifacts) {
    if (ids.has(artifact.id)) throw new Error(`Duplicate experiment artifact id '${artifact.id}'.`);
    ids.add(artifact.id);
  }
  for (const descriptor of EXPERIMENT_ARTIFACTS) {
    let artifact = artifacts.find((item) => item.id === descriptor.id);
    if (!artifact && descriptor.id === "metrics") {
      artifact = { id: descriptor.id, type: descriptor.type, label: descriptor.label, format: descriptor.format, order: descriptor.order, content: "" };
      artifacts.push(artifact);
    }
    if (!artifact) throw new Error(`Experiment is missing source artifact '${descriptor.id}'.`);
    if (artifact.type !== descriptor.type) throw new Error(`Artifact '${descriptor.id}' must have type '${descriptor.type}'.`);
  }
  return artifacts.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function sourceFieldsFromArtifactArray(artifacts) {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  return Object.fromEntries(EXPERIMENT_ARTIFACTS.filter((descriptor) => descriptor.registryField).map((descriptor) => [descriptor.registryField, byId.get(descriptor.id)?.content ?? ""]));
}

export function artifactWritePayload(artifacts) {
  const normalized = experimentArtifactArray({ artifacts });
  return { artifacts: normalized, ...sourceFieldsFromArtifactArray(normalized) };
}

function applyArtifactMetadata(editor, artifact) {
  editor.dataset.experimentArtifactId = artifact.id;
  editor.dataset.experimentArtifactType = artifact.type;
  editor.dataset.experimentArtifactLabel = artifact.label;
  editor.dataset.experimentArtifactFormat = artifact.format;
  editor.dataset.experimentArtifactLanguage = artifactEditorLanguage(artifact);
  editor.dataset.experimentArtifactOrder = String(artifact.order);
}

function clearAdditionalArtifacts(root) {
  const container = root.querySelector("#additional-experiment-artifacts");
  if (container) container.replaceChildren();
  return container;
}

function renderGenericArtifact(root, container, artifact) {
  if (!GENERIC_TEXT_FORMATS.has(artifact.format)) throw new Error(`Virtual Lab has no editor adapter for artifact '${artifact.id}' format '${artifact.format}'.`);
  if (!container) throw new Error(`Virtual Lab artifact UI mismatch: no container for additional artifact '${artifact.id}'.`);
  const doc = root.ownerDocument ?? root;
  const panel = doc.createElement("section");
  panel.className = "panel editor-panel generic-artifact-panel";
  panel.dataset.experimentArtifactPanel = artifact.id;
  const heading = doc.createElement("div"); heading.className = "stage-heading editor-heading";
  const titleWrap = doc.createElement("div");
  const kicker = doc.createElement("p"); kicker.className = "section-kicker"; kicker.textContent = artifact.type.toUpperCase();
  const title = doc.createElement("h2"); title.textContent = artifact.label;
  titleWrap.append(kicker, title); heading.append(titleWrap);
  const editor = doc.createElement("textarea"); editor.className = "code-editor generic-artifact-editor"; editor.spellcheck = false;
  editor.setAttribute("aria-label", artifact.label); editor.dataset.experimentArtifactEditor = "true"; applyArtifactMetadata(editor, artifact); editor.value = artifact.content;
  panel.append(heading, editor); container.append(panel);
}

export function captureExperimentArtifactArray(root = document) {
  const artifacts = [];
  for (const descriptor of EXPERIMENT_ARTIFACTS) {
    const editor = artifactEditorFor(root, descriptor.id);
    artifacts.push({
      id: editor?.dataset.experimentArtifactId || descriptor.id,
      type: editor?.dataset.experimentArtifactType || descriptor.type,
      label: editor?.dataset.experimentArtifactLabel || descriptor.label,
      format: editor?.dataset.experimentArtifactFormat || descriptor.format,
      order: Number(editor?.dataset.experimentArtifactOrder || descriptor.order),
      content: editor?.value ?? "",
    });
  }
  const container = root.querySelector("#additional-experiment-artifacts");
  if (container) {
    for (const editor of container.querySelectorAll?.('[data-experiment-artifact-editor="true"]') ?? []) {
      if (CORE_BY_ID.has(editor.dataset.experimentArtifactId)) continue;
      artifacts.push({ id: editor.dataset.experimentArtifactId, type: editor.dataset.experimentArtifactType, label: editor.dataset.experimentArtifactLabel, format: editor.dataset.experimentArtifactFormat, order: Number(editor.dataset.experimentArtifactOrder), content: editor.value });
    }
  }
  return experimentArtifactArray({ artifacts });
}

export function captureExperimentArtifacts(root = document) { return artifactWritePayload(captureExperimentArtifactArray(root)); }

export function applyExperimentArtifacts(experiment, root = document) {
  const artifacts = experimentArtifactArray(experiment);
  const container = clearAdditionalArtifacts(root);
  for (const artifact of artifacts) {
    const descriptor = CORE_BY_ID.get(artifact.id);
    const editor = artifactEditorFor(root, artifact.id);
    if (editor) {
      editor.value = artifact.content;
      applyArtifactMetadata(editor, artifact);
      notifyAuthoritativeSourceReplaced(editor);
    } else renderGenericArtifact(root, container, artifact);
  }
}

export function experimentArtifactsEqual(left, right) {
  if (!left || !right) return false;
  let leftArtifacts; let rightArtifacts;
  try { leftArtifacts = experimentArtifactArray(left); rightArtifacts = experimentArtifactArray(right); } catch { return false; }
  if (leftArtifacts.length !== rightArtifacts.length) return false;
  return leftArtifacts.every((artifact, index) => {
    const other = rightArtifacts[index];
    return artifact.id === other.id && artifact.type === other.type && artifact.label === other.label && artifact.format === other.format && artifact.order === other.order && artifact.content === other.content;
  });
}
