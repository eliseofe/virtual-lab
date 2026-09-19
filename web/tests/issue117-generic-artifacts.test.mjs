import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  sourcesFromArtifacts,
  validateExperimentArtifacts,
} from "../../supabase/functions/experiment-mcp/authoring.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
async function text(relative) { return readFile(path.join(repo, relative), "utf8"); }

const runnableSources = {
  config_source: `N = 1\nARENA_SIZE = 10.0\nCONTROL_DT = 0.1\nSENSOR_NOISE = 0.0\nEXPERIMENT_DURATION = 1.0\nINTERACTION_RADIUS = 1.0\nMAX_FORWARD_SPEED = 1.0\nMAX_ANGULAR_SPEED = 1.0\n`,
  initializer_source: `def initialize(config, rng, place):\n    place(0, 0.0, 0.0, 0.0)\n`,
  controller_source: `class Probe(Agent):\n    def step(self, obs):\n        return Motion(0.0, 0.0)\n`,
};

function canonicalArtifacts(metrics = "") {
  return [
    { id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", order: 10, content: runnableSources.config_source },
    { id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", order: 20, content: runnableSources.initializer_source },
    { id: "controller", type: "controller", label: "Controller", format: "python-vlab/0.1", order: 30, content: runnableSources.controller_source },
    { id: "metrics", type: "metrics", label: "Metrics", format: "python-vlab-metrics/0.1", order: 40, content: metrics },
  ];
}

test("#117/#196 canonical authoring uses four explicit typed core artifacts", () => {
  const artifacts = canonicalArtifacts();
  assert.deepEqual(artifacts.map(({ id, type, order }) => [id, type, order]), [
    ["configuration", "configuration", 10],
    ["initialization", "initialization", 20],
    ["controller", "controller", 30],
    ["metrics", "metrics", 40],
  ]);
  assert.equal(artifacts[3].content, "");
  assert.deepEqual(sourcesFromArtifacts(artifacts), runnableSources);
  assert.equal(validateExperimentArtifacts(artifacts).valid, true);
});

test("#117 generic optional artifacts still survive beside the four required core artifacts", () => {
  const artifacts = [
    ...canonicalArtifacts(),
    { id: "future-note", type: "future-note", label: "Future note", format: "text/plain", order: 50, content: "kept verbatim" },
  ];
  assert.equal(artifacts.length, 5);
  assert.equal(artifacts[4].content, "kept verbatim");
  assert.deepEqual(sourcesFromArtifacts(artifacts), runnableSources);
  assert.equal(validateExperimentArtifacts(artifacts).valid, true);
});

test("#117 canonical whole-artifact edits preserve Metrics and unknown future artifacts", () => {
  const original = [
    ...canonicalArtifacts(),
    { id: "future-note", type: "future-note", label: "Future note", format: "text/plain", order: 50, content: "do not lose me" },
  ];
  const edited = original.map((artifact) =>
    artifact.id === "controller"
      ? { ...artifact, content: artifact.content + "# changed\n" }
      : { ...artifact }
  );
  assert.equal(edited.find(({ id }) => id === "metrics").content, "");
  assert.equal(edited.find(({ id }) => id === "future-note").content, "do not lose me");
  assert.equal(edited.find(({ id }) => id === "controller").content.endsWith("# changed\n"), true);
  assert.equal(validateExperimentArtifacts(edited).valid, true);
});

test("#117 historical migration keeps artifacts on the experiment row", async () => {
  const migration = await text("supabase/migrations/20260914100000_generic_experiment_artifacts.sql");
  assert.match(migration, /add column if not exists artifacts jsonb/);
  assert.match(migration, /disable trigger bump_experiment_revision/);
  assert.match(migration, /security definer/);
  assert.match(migration, /artifact_sync_experiment_artifacts/);
  assert.doesNotMatch(migration, /create table[^;]*experiment_artifacts/i);
});

test("#196 registry schema v3 requires four core artifacts while v1/v2 remain archived", async () => {
  const v3 = JSON.parse(await text("schemas/registry-experiment.schema.json"));
  const v2 = JSON.parse(await text("schemas/registry-experiment-v2.schema.json"));
  const v1 = JSON.parse(await text("schemas/registry-experiment-v1.schema.json"));
  assert.equal(v3.properties.schema_version.const, "vlab.registry-experiment/3");
  assert.equal(v3.properties.interface_version.const, "vlab.experiment-artifacts/3");
  assert.equal(v3.properties.artifacts.minItems, 4);
  assert.equal(v2.properties.schema_version.const, "vlab.registry-experiment/2");
  assert.equal(v1.properties.schema_version.const, "vlab.registry-experiment/1");
});

test("#117 MCP keeps tool names with canonical artifacts-only authoring", async () => {
  const mcp = await text("supabase/functions/experiment-mcp/index.ts");
  assert.match(mcp, /experiment_artifact_interface/);
  assert.match(mcp, /artifacts: z\.array\(ARTIFACT_INPUT\)\.min\(4\)/);
  assert.doesNotMatch(mcp, /config_source|initializer_source|controller_source|legacySourceArgumentsPresent/);
  assert.match(mcp, /'create_experiment'/);
  assert.match(mcp, /'edit_experiment'/);
});
