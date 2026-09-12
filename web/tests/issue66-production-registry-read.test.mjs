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

function fakeRoot(initial = {}) {
  const editors = new Map(
    EXPERIMENT_ARTIFACTS.map((descriptor) => [
      descriptor.editorSelector,
      { value: initial[descriptor.registryField] ?? "" },
    ]),
  );
  return {
    querySelector(selector) {
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

test("experiment artifact integration is descriptor-driven and currently exposes the three supported sources", () => {
  assert.deepEqual(
    EXPERIMENT_ARTIFACTS.map(({ id, registryField }) => [id, registryField]),
    [
      ["configuration", "config_source"],
      ["initialization", "initializer_source"],
      ["controller", "controller_source"],
    ],
  );
  assert.equal(new Set(EXPERIMENT_ARTIFACTS.map((item) => item.registryField)).size, EXPERIMENT_ARTIFACTS.length);
  assert.equal(new Set(EXPERIMENT_ARTIFACTS.map((item) => item.editorSelector)).size, EXPERIMENT_ARTIFACTS.length);
});

test("artifact adapter can load and capture registry sources without registry-specific editor branching", () => {
  const root = fakeRoot();
  const experiment = {
    config_source: "N = 5",
    initializer_source: "def initialize(config, rng, place):\n    return",
    controller_source: "class AgentA(Agent):\n    def step(self, obs):\n        return Motion(0.0, 0.0)",
  };

  applyExperimentArtifacts(experiment, root);
  assert.deepEqual(captureExperimentArtifacts(root), experiment);
});

test("production runnability preflight accepts a generic valid experiment and rejects empty artifacts", () => {
  assert.equal(productionExperimentRunnability(minimalRunnableExperiment).runnable, true);
  const invalid = productionExperimentRunnability({ config_source: "", initializer_source: "", controller_source: "" });
  assert.equal(invalid.runnable, false);
  assert.ok(invalid.error);
});

test("production registry pass is read-only, ownership-scoped, session-isolated and runnable-only", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui.js"), "utf8");
  assert.match(registryUi, /storageKey: "vlab-production-registry-auth-v1"/);
  assert.match(registryUi, /\.from\("experiments"\)/);
  assert.match(registryUi, /\.eq\("owner_id", user\.id\)/);
  assert.match(registryUi, /\.eq\("lifecycle", "active"\)/);
  assert.match(registryUi, /config_source,initializer_source,controller_source/);
  assert.match(registryUi, /productionExperimentRunnability\(experiment\)\.runnable/);
  assert.doesNotMatch(registryUi, /\.insert\s*\(/);
  assert.doesNotMatch(registryUi, /\.update\s*\(/);
  assert.doesNotMatch(registryUi, /\.delete\s*\(/);
  assert.match(registryUi, /Read-only integration/);
});

test("registry bootstrap is additive and cannot block the core simulator runtime-speed module", async () => {
  const runtimeSpeed = await readFile(path.join(src, "runtime-speed.js"), "utf8");
  assert.doesNotMatch(runtimeSpeed, /^import "\.\/registry-ui\.js";/);
  assert.match(runtimeSpeed, /import\("\.\/registry-ui\.js"\)\.catch/);
  assert.match(runtimeSpeed, /Registry UI failed to load/);
});
