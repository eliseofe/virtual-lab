import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXPERIMENT_ARTIFACTS,
  applyExperimentArtifacts,
  artifactEditorLanguage,
  artifactWritePayload,
} from "../src/experiment-artifacts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");
async function text(relative) { return readFile(path.join(src, relative), "utf8"); }

function fakeElement() {
  return {
    value: "",
    dataset: {},
    children: [],
    className: "",
    textContent: "",
    spellcheck: false,
    setAttribute() {},
    append(...children) { this.children.push(...children); },
  };
}

function rootForPresentationProbe() {
  const editors = new Map(EXPERIMENT_ARTIFACTS.map((descriptor) => [descriptor.id, fakeElement()]));
  const extraContainer = fakeElement();
  extraContainer.replaceChildren = function replaceChildren() { this.children = []; };
  const ownerDocument = { createElement: fakeElement };
  return {
    ownerDocument,
    querySelector(selector) {
      if (selector === "#additional-experiment-artifacts") return extraContainer;
      const match = selector.match(/data-experiment-artifact-id="([^"]+)"/);
      return match ? editors.get(match[1]) ?? null : null;
    },
  };
}

const coreArtifacts = [
  { id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", order: 10, content: "N = 1" },
  { id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", order: 20, content: "def initialize(config, rng, place):\n    return" },
  { id: "controller", type: "controller", label: "Controller", format: "python-vlab", order: 30, content: "class Probe(Agent):\n    def step(self, obs):\n        return Motion(0.0, 0.0)" },
  { id: "metrics", type: "metrics", label: "Metrics", format: "python-vlab-metrics/0.1", order: 40, content: "" },
];

test("#118/#196 core artifact UI uses one metadata-driven editor contract", () => {
  assert.deepEqual(EXPERIMENT_ARTIFACTS.map(({ id }) => id), ["configuration", "initialization", "controller", "metrics"]);
  assert.deepEqual(EXPERIMENT_ARTIFACTS.map(({ language }) => language), ["python", "python", "python", "python"]);
  assert.equal(EXPERIMENT_ARTIFACTS.some((descriptor) => "editorSelector" in descriptor), false);
  assert.equal(artifactEditorLanguage({ type: "configuration", format: "vlab.config/0.2" }), "python");
  assert.equal(artifactEditorLanguage({ type: "initialization", format: "vlab.initializer-state/0.2" }), "python");
  assert.equal(artifactEditorLanguage({ type: "controller", format: "python-vlab/0.1" }), "python");
  assert.equal(artifactEditorLanguage({ type: "metrics", format: "python-vlab-metrics/0.1" }), "python");
  assert.equal(artifactEditorLanguage({ type: "documentation", format: "text/markdown" }), "markdown");
});

test("#118 unsupported artifact presentation fails explicitly instead of silently dropping content", () => {
  const experiment = artifactWritePayload([
    ...coreArtifacts,
    { id: "binary-future", type: "binary-future", label: "Binary future", format: "application/octet-stream", order: 50, content: "opaque" },
  ]);
  assert.throws(
    () => applyExperimentArtifacts(experiment, rootForPresentationProbe()),
    /no editor adapter for artifact 'binary-future' format 'application\/octet-stream'/,
  );
});

test("#118 production page provides an explicit host for dynamically rendered additional/core-generic artifacts", async () => {
  const html = await text("index.html");
  assert.match(html, /id="additional-experiment-artifacts"/);
});

test("#118 registry UI loads/saves artifacts generically", async () => {
  const registry = await text("registry-ui-v3.js");
  assert.match(registry, /experimentArtifactsEqual/);
  // #554: queries moved to registry/data.js, covered by registry-data.test.mjs; this checks the workspace uses them.
  assert.match(registry, /registryData\.listOwnExperiments\(supabase, user\.id\)/);
  assert.match(registry, /experimentArtifactEditor/);
  assert.match(registry, /captureExperimentArtifacts\(\)/);
});

test("#118/#196 simulator execution still uses established setup/controller path while Metrics execution is deferred to #197", async () => {
  const main = await text("main.js");
  assert.match(main, /#experiment-config/);
  assert.match(main, /#initializer-source/);
  assert.match(main, /#controller-source/);
  assert.doesNotMatch(main, /MetricRuntime/);
});
