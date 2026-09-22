import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileMetrics } from "../src/metrics/compiler.js";
import { DEFAULT_CATALOG_EXPERIMENT } from "../src/experiment-catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const bridge = await readFile(path.join(repo, "web/src/metrics-runtime-bridge.js"), "utf8");
const html = await readFile(path.join(repo, "web/src/index.html"), "utf8");
const artifacts = await readFile(path.join(repo, "web/src/experiment-artifacts.js"), "utf8");
const catalogWorkspace = await readFile(path.join(repo, "web/src/catalog-workspace.js"), "utf8");

const metricsSource = DEFAULT_CATALOG_EXPERIMENT.artifacts.find((artifact) => artifact.id === "metrics")?.content ?? "";

test("#198 Active Elastic catalog content retains the two owner-authorized live metrics", () => {
  assert.match(metricsSource, /@metric\(id="polarization", name="Polarization order parameter"/);
  assert.match(metricsSource, /@metric\(id="angular_momentum", name="Angular momentum order parameter"/);
  assert.match(metricsSource, /rotation \+= cross2\(radial_hat, agent\.heading\)/);
  const ir = compileMetrics(metricsSource);
  assert.deepEqual(ir.metrics.map((metric) => metric.id), ["polarization", "angular_momentum"]);
  assert.match(JSON.stringify(ir.metrics[1]), /"name":"cross2"/);
});

test("#481 Metrics reaches the editor through the same metadata-driven Experiment artifact contract as the other core artifacts", () => {
  assert.match(html, /id="metrics-source"/);
  assert.match(html, /data-artifact-id="metrics"/);
  assert.match(artifacts, /id: "metrics"[\s\S]*language: "python"/);
  assert.match(artifacts, /artifactEditorFor/);
  assert.doesNotMatch(artifacts, /editorSelector/);
  assert.match(catalogWorkspace, /applyExperimentArtifacts\(experiment\)/);
  assert.doesNotMatch(bridge, /builtin-active-elastic-metrics/);
});

test("#481 catalog workspace is initialized before Results/runtime bridge initialization", () => {
  const catalogImport = bridge.indexOf('import "./catalog-workspace.js";');
  const resultsImport = bridge.indexOf('import "./results-ui.js";');
  assert.ok(catalogImport >= 0);
  assert.ok(resultsImport > catalogImport);
});
