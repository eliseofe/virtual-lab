import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileMetrics } from "../src/metrics/compiler.js";
import {
  AUTHORING_CONTRACT,
  normalizeExperimentArtifacts,
  validateExperimentArtifacts,
} from "../../supabase/functions/experiment-mcp/authoring.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
async function text(relative) { return readFile(path.join(repo, relative), "utf8"); }

const sources = {
  config_source: `N = 2\nARENA_SIZE = 10.0\nCONTROL_DT = 0.1\nSENSOR_NOISE = 0.0\nEXPERIMENT_DURATION = 1.0\nINTERACTION_RADIUS = 1.0\nMAX_FORWARD_SPEED = 1.0\nMAX_ANGULAR_SPEED = 1.0\n`,
  initializer_source: `def initialize(config, rng, place):\n    place(0, -1.0, 0.0, 0.0)\n    place(1, 1.0, 0.0, 0.0)\n`,
  controller_source: `class Probe(Agent):\n    def step(self, obs):\n        return Motion(0.0, 0.0)\n`,
};

function canonicalArtifacts(metrics = "") {
  return [
    { id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", order: 10, content: sources.config_source },
    { id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", order: 20, content: sources.initializer_source },
    { id: "controller", type: "controller", label: "Controller", format: "python-vlab/0.1", order: 30, content: sources.controller_source },
    { id: "metrics", type: "metrics", label: "Metrics", format: "python-vlab-metrics/0.1", order: 40, content: metrics },
  ];
}

const polarizationLike = `@metric(id="polarization", name="Polarization", unit=None, sampling=every(0.1))\ndef polarization(snapshot):\n    total = Vec2(0.0, 0.0)\n    for agent in snapshot.agents:\n        total += agent.heading\n    return norm(total) / snapshot.agent_count\n`;

test("#196 empty Metrics is valid while omitting the compulsory Metrics artifact is rejected", () => {
  const canonical = canonicalArtifacts("");
  const normalized = normalizeExperimentArtifacts(canonical);
  assert.deepEqual(normalized.map(({ id }) => id), ["configuration", "initialization", "controller", "metrics"]);
  assert.equal(normalized[3].content, "");
  assert.equal(validateExperimentArtifacts(canonical).valid, true);

  const missingMetrics = canonical.filter(({ id }) => id !== "metrics");
  assert.throws(() => normalizeExperimentArtifacts(missingMetrics), /missing required artifact 'metrics'/);
  assert.equal(validateExperimentArtifacts(missingMetrics).valid, false);
});

test("#196 constrained Metrics compiler supports multiple read-only scalar metrics", () => {
  const source = `${polarizationLike}\n@metric(id="agent_count", name="Agent count", unit="agents", sampling=final())\ndef agent_count(snapshot):\n    return snapshot.agent_count\n`;
  const compiled = compileMetrics(source);
  assert.equal(compiled.language, "python-vlab-metrics/0.1");
  assert.equal(compiled.schema, "vlab.metrics-ir/0.1");
  assert.equal(compiled.measurement_phase, "post-physics-wrapped-state/1");
  assert.deepEqual(compiled.metrics.map(({ id }) => id), ["polarization", "agent_count"]);
  assert.deepEqual(compiled.metrics.map(({ sampling }) => sampling.kind), ["periodic", "final"]);
});

test("#196 Metrics compiler rejects mutation-adjacent/forbidden simulator capabilities", () => {
  assert.throws(
    () => compileMetrics(`@metric(id="bad", name="Bad", sampling=every(0.1))\ndef bad(snapshot):\n    return rng.uniform(0.0, 1.0)\n`),
    /forbidden-capability/,
  );
  assert.throws(
    () => compileMetrics(`@metric(id="bad", name="Bad", sampling=every(0.1))\ndef bad(snapshot):\n    return snapshot.controller_state\n`),
    /invalid-observation-field/,
  );
});

test("#196 complete experiment validation compiles Metrics and reports metric diagnostics", () => {
  const artifacts = canonicalArtifacts(polarizationLike);
  const valid = validateExperimentArtifacts(artifacts);
  assert.equal(valid.valid, true);
  assert.equal(valid.compiled.metric_count, 1);
  assert.equal(valid.compiled.metrics_ir_schema, "vlab.metrics-ir/0.1");

  const invalid = validateExperimentArtifacts(artifacts.map((artifact) => artifact.id === "metrics" ? { ...artifact, content: `@metric(id="x", name="X", sampling=every(0.1))\ndef x(snapshot):\n    return snapshot.secret\n` } : artifact));
  assert.equal(invalid.valid, false);
  assert.equal(invalid.diagnostics[0].artifact, "metrics");
  assert.equal(invalid.diagnostics[0].category, "invalid-observation-field");
  assert.equal(invalid.diagnostics[0].diagnostic_class, "semantic_capability");
  assert.equal(invalid.diagnostics[0].request_class, "semantic_capability");
});

test("#196 authoring/artifact contracts are versioned for four compulsory artifacts", () => {
  assert.equal(AUTHORING_CONTRACT.contract_version, "vlab.authoring/0.9");
  assert.equal(AUTHORING_CONTRACT.experiment_interface_version, "9");
  assert.equal(AUTHORING_CONTRACT.experiment_artifact_interface, "vlab.experiment-artifacts/3");
  assert.deepEqual(AUTHORING_CONTRACT.artifact_collection.required_core_ids, ["configuration", "initialization", "controller", "metrics"]);
  assert.equal(AUTHORING_CONTRACT.artifacts.metrics.measurement_phase.id, "post-physics-wrapped-state/1");
});

test("#196 database migration backfills Metrics without revision bump and enforces four core artifacts", async () => {
  const migration = await text("supabase/migrations/20260915130000_metrics_fourth_core_artifact.sql");
  assert.match(migration, /disable trigger artifact_sync_experiment_artifacts/);
  assert.match(migration, /enable trigger artifact_sync_experiment_artifacts/);
  assert.match(migration, /disable trigger bump_experiment_revision/);
  assert.match(migration, /ensure_metrics_artifact/);
  assert.match(migration, /vlab\.registry-experiment\/3/);
  assert.match(migration, /vlab\.experiment-artifacts\/3/);
  assert.match(migration, /configuration, initialization, controller, and metrics core artifact/);
  const disableSync = migration.indexOf("disable trigger artifact_sync_experiment_artifacts");
  const backfill = migration.indexOf("update public.experiments");
  const enableSync = migration.indexOf("enable trigger artifact_sync_experiment_artifacts");
  assert.ok(disableSync >= 0 && disableSync < backfill && backfill < enableSync, "legacy artifact sync must be disabled only around the v3 backfill");
});

test("#196 browser artifact adapter recognizes Metrics as core while using generic editor presentation", async () => {
  const browser = await text("web/src/experiment-artifacts.js");
  assert.match(browser, /id: "metrics"/);
  assert.match(browser, /type: "metrics"/);
  assert.match(browser, /editorSelector: null/);
  assert.match(browser, /dynamicEditorFor/);
});
