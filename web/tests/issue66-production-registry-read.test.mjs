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

test("production registry pass is read-only and ownership-scoped", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui.js"), "utf8");
  assert.match(registryUi, /\.from\("experiments"\)/);
  assert.match(registryUi, /\.eq\("owner_id", user\.id\)/);
  assert.match(registryUi, /\.eq\("lifecycle", "active"\)/);
  assert.doesNotMatch(registryUi, /\.insert\s*\(/);
  assert.doesNotMatch(registryUi, /\.update\s*\(/);
  assert.doesNotMatch(registryUi, /\.delete\s*\(/);
  assert.match(registryUi, /Read-only integration/);
});

test("production browser bootstraps the registry read client without changing the main simulator module", async () => {
  const runtimeSpeed = await readFile(path.join(src, "runtime-speed.js"), "utf8");
  assert.match(runtimeSpeed, /^import "\.\/registry-ui\.js";/);
});
