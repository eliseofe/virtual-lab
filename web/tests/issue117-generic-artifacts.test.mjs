import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  artifactsFromLegacySources,
  mergeLegacySourcesIntoArtifacts,
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

test("#117/#196 legacy three-source experiments normalize mechanically to four typed core artifacts", () => {
  const artifacts = artifactsFromLegacySources(runnableSources);
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
    ...artifactsFromLegacySources(runnableSources),
    { id: "future-note", type: "future-note", label: "Future note", format: "text/plain", order: 50, content: "kept verbatim" },
  ];
  assert.equal(artifacts.length, 5);
  assert.equal(artifacts[4].content, "kept verbatim");
  assert.deepEqual(sourcesFromArtifacts(artifacts), runnableSources);
  assert.equal(validateExperimentArtifacts(artifacts).valid, true);
});

test("#117 legacy compatibility edits preserve Metrics and unknown future artifacts", () => {
  const original = [
    ...artifactsFromLegacySources(runnableSources),
    { id: "future-note", type: "future-note", label: "Future note", format: "text/plain", order: 50, content: "do not lose me" },
  ];
  const merged = mergeLegacySourcesIntoArtifacts(original, { controller_source: runnableSources.controller_source + "# changed\n" });
  assert.equal(merged.find(({ id }) => id === "metrics").content, "");
  assert.equal(merged.find(({ id }) => id === "future-note").content, "do not lose me");
  assert.equal(merged.find(({ id }) => id === "controller").content.endsWith("# changed\n"), true);
});

test("#117 original migration keeps artifacts on experiment row and compatibility mirrors", async () => {
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

test("#117 MCP keeps tool names and bounded three-source compatibility", async () => {
  const mcp = await text("supabase/functions/experiment-mcp/index.ts");
  assert.match(mcp, /experiment_artifact_interface/);
  assert.match(mcp, /artifacts: z\.array\(ARTIFACT_INPUT\)/);
  assert.match(mcp, /Legacy compatibility requires all three source arguments/);
  assert.match(mcp, /'create_experiment'/);
  assert.match(mcp, /'edit_experiment'/);
});
