import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXPERIMENT_ARTIFACTS,
  applyExperimentArtifacts,
  captureExperimentArtifacts,
} from "../src/experiment-artifacts.js";
import { productionExperimentRunnability } from "../src/experiment-validation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

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

function fakeRoot(initial = {}) {
  const editors = new Map(
    EXPERIMENT_ARTIFACTS
      .filter((descriptor) => descriptor.editorSelector)
      .map((descriptor) => [
        descriptor.editorSelector,
        { value: initial[descriptor.registryField] ?? "", dataset: {} },
      ]),
  );
  const extraContainer = fakeElement();
  extraContainer.replaceChildren = function replaceChildren() { this.children = []; };
  extraContainer.querySelector = function querySelector(selector) {
    if (!selector.includes('data-experiment-artifact-editor="true"')) return null;
    const idMatch = selector.match(/data-experiment-artifact-id="([^"]+)"/);
    return this.children
      .flatMap((child) => child.children ?? [])
      .find((child) => child.dataset?.experimentArtifactEditor === "true" && (!idMatch || child.dataset.experimentArtifactId === idMatch[1])) ?? null;
  };
  extraContainer.querySelectorAll = function querySelectorAll(selector) {
    if (!selector.includes('data-experiment-artifact-editor="true"')) return [];
    return this.children
      .flatMap((child) => child.children ?? [])
      .filter((child) => child.dataset?.experimentArtifactEditor === "true");
  };
  const ownerDocument = { createElement: fakeElement };
  return {
    ownerDocument,
    querySelector(selector) {
      if (selector === "#additional-experiment-artifacts") return extraContainer;
      return editors.get(selector) ?? null;
    },
  };
}

const minimalRunnableExperiment = {
  config_source: `N = 1
ARENA_SIZE = 10.0
CONTROL_DT = 0.1
SENSOR_NOISE = 0.0
EXPERIMENT_DURATION = 10.0
INTERACTION_RADIUS = 1.0
MAX_FORWARD_SPEED = 1.0
MAX_ANGULAR_SPEED = 1.0
`,
  initializer_source: `def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
`,
  controller_source: `class MinimalAgent(Agent):
    def step(self, obs):
        return Motion(0.0, 0.0)
`,
};

test("experiment artifact integration retains three specialized adapters plus compulsory Metrics", () => {
  assert.deepEqual(
    EXPERIMENT_ARTIFACTS.map(({ id, registryField }) => [id, registryField]),
    [
      ["configuration", "config_source"],
      ["initialization", "initializer_source"],
      ["controller", "controller_source"],
      ["metrics", null],
    ],
  );
  assert.equal(new Set(EXPERIMENT_ARTIFACTS.filter((item) => item.registryField).map((item) => item.registryField)).size, 3);
  assert.equal(new Set(EXPERIMENT_ARTIFACTS.filter((item) => item.editorSelector).map((item) => item.editorSelector)).size, 3);
});

test("artifact adapter upgrades legacy registry sources into the four-artifact canonical payload", () => {
  const root = fakeRoot();
  const experiment = {
    config_source: "N = 5",
    initializer_source: "def initialize(config, rng, place):\n    return",
    controller_source: "class AgentA(Agent):\n    def step(self, obs):\n        return Motion(0.0, 0.0)",
  };

  applyExperimentArtifacts(experiment, root);
  const captured = captureExperimentArtifacts(root);
  assert.equal(captured.config_source, experiment.config_source);
  assert.equal(captured.initializer_source, experiment.initializer_source);
  assert.equal(captured.controller_source, experiment.controller_source);
  assert.deepEqual(captured.artifacts.map(({ id }) => id), ["configuration", "initialization", "controller", "metrics"]);
  assert.equal(captured.artifacts.find(({ id }) => id === "metrics").content, "");
});

test("production runnability preflight accepts a generic valid experiment and rejects empty artifacts", () => {
  assert.equal(productionExperimentRunnability(minimalRunnableExperiment).runnable, true);
  const invalid = productionExperimentRunnability({ config_source: "", initializer_source: "", controller_source: "" });
  assert.equal(invalid.runnable, false);
  assert.ok(invalid.error);
});

test("production registry read path remains ownership-scoped, session-isolated, artifact-aware and runnable-only", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui-v3.js"), "utf8");
  assert.match(registryUi, /storageKey: "vlab-production-registry-auth-v1"/);
  assert.match(registryUi, /\.from\("experiments"\)/);
  assert.match(registryUi, /\.eq\("owner_id", user\.id\)/);
  assert.match(registryUi, /\.eq\("lifecycle", "active"\)/);
  assert.match(registryUi, /artifacts,config_source,initializer_source,controller_source/);
  assert.match(registryUi, /productionExperimentRunnability\(experiment\)\.runnable/);
  assert.match(registryUi, /async function readExperiment/);
  assert.match(registryUi, /Experiment not found in your library/);
});

test("post-login registry UI hides login controls and exposes the account-owned experiment library", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui-v3.js"), "utf8");
  assert.match(registryUi, /ui\.auth\.hidden = true/);
  assert.match(registryUi, /ui\.signOut\.hidden = false/);
  assert.match(registryUi, /Find experiment/);
  assert.match(registryUi, /My experiments/);
});

test("registry bootstrap is additive and cannot block the core simulator runtime-speed module", async () => {
  const runtimeSpeed = await readFile(path.join(src, "runtime-speed.js"), "utf8");
  assert.doesNotMatch(runtimeSpeed, /^import "\.\/registry-ui-v3\.js";/);
  assert.match(runtimeSpeed, /import\("\.\/registry-ui-v3\.js"\)[\s\S]*\.catch\(\(error\) => \{[\s\S]*Registry UI failed to load/);
  assert.match(runtimeSpeed, /import\("\.\/professor-inbox\.js"\)[\s\S]*\.catch\(\(error\) => \{[\s\S]*Professor inbox failed to load/);
  assert.match(runtimeSpeed, /import\("\.\/professor-development-links\.js"\)\.catch/);
});
