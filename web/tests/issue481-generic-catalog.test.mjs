import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileConfig } from "../src/config/compiler.js";
import { compileMetrics } from "../src/metrics/compiler.js";
import {
  DEFAULT_CATALOG_EXPERIMENT,
  catalogSelectValue,
} from "../src/experiment-catalog.js";
import { registryExperimentRunnability } from "../src/experiment-validation.js";

const corePaths = [
  "../src/main.js",
  "../src/registry-ui-v3.js",
  "../src/experiment-validation.js",
  "../src/result-persistence.js",
  "../src/metrics-runtime-bridge.js",
  "../src/showcase.js",
];

test("#481 Active Elastic is ordinary catalog content, not an execution mode", async () => {
  assert.equal(DEFAULT_CATALOG_EXPERIMENT.key, "active-elastic");
  assert.equal(catalogSelectValue(DEFAULT_CATALOG_EXPERIMENT.key), "catalog:active-elastic");
  assert.equal(registryExperimentRunnability(DEFAULT_CATALOG_EXPERIMENT).runnable, true);

  for (const relative of corePaths) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Built-in|builtin|kernel-probe|runtimeValuesForCurrentBuiltIn|allowBuiltInCompatibility|registryArtifactsFromProductionExperiment/);
  }
});

test("#481 catalog Active Elastic preserves scientific values while satisfying the generic runtime contract", () => {
  const configSource = DEFAULT_CATALOG_EXPERIMENT.artifacts.find((artifact) => artifact.id === "configuration")?.content ?? "";
  const config = compileConfig(configSource).values;
  assert.equal(config.U, 0.005);
  assert.equal(config.OMEGA_MAX, 1.5707963267948966);
  assert.equal(config.PROXIMAL_RANGE, 0.81);
  assert.equal(config.INTERACTION_RADIUS, config.PROXIMAL_RANGE);
  assert.equal(config.MAX_FORWARD_SPEED, config.U);
  assert.equal(config.MAX_ANGULAR_SPEED, config.OMEGA_MAX);

  const metricsSource = DEFAULT_CATALOG_EXPERIMENT.artifacts.find((artifact) => artifact.id === "metrics")?.content ?? "";
  const metrics = compileMetrics(metricsSource);
  assert.deepEqual(metrics.metrics.map((metric) => metric.id), ["polarization", "angular_momentum"]);
});

test("#481 catalog source carries all four core Experiment artifacts", () => {
  assert.deepEqual(
    DEFAULT_CATALOG_EXPERIMENT.artifacts.map((artifact) => artifact.id),
    ["configuration", "initialization", "controller", "metrics"],
  );
});
