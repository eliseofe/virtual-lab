import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const registry = await readFile(path.join(repo, "web/src/registry-ui-v3.js"), "utf8");
const workspace = await readFile(path.join(repo, "web/src/workspace-shell.js"), "utf8");

test("#198 production workspace executes the active registry UI", () => {
  assert.match(workspace, /import "\.\/registry-ui-v3\.js";/);
  assert.doesNotMatch(workspace, /registry-ui-v2\.js/);
});

test("#198 active registry loads canonical artifacts instead of reconstructing Metrics as empty", async () => {
  const listSelection = "id,owner_id,collection_id,title,revision,updated_at,updated_by_actor,updated_by_ai_client,artifacts,config_source,initializer_source,controller_source";
  const fullSelection = "id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,created_at,updated_at,created_by_actor,created_by_ai_client,updated_by_actor,updated_by_ai_client";

  // #554: queries moved to registry/data.js, covered by registry-data.test.mjs; this checks the workspace uses them.
  const data = await import("../src/registry/data.js");
  assert.equal(data.EXPERIMENT_LIST_COLUMNS, listSelection);
  assert.equal(data.EXPERIMENT_COLUMNS, fullSelection);
  for (const operation of ["readExperiment", "moveExperiment", "insertExperiment", "crystallizeWorkingCopy"]) {
    assert.match(registry, new RegExp(`registryData\\.${operation}\\(supabase`), `read/move/create/save must preserve canonical artifacts (${operation})`);
  }
});

test("#198 Metrics edits participate in active registry dirty-state comparison", () => {
  assert.match(registry, /experimentArtifactsEqual,/);
  assert.match(registry, /return experimentArtifactsEqual\(left, right\);/);
  assert.doesNotMatch(registry, /EXPERIMENT_ARTIFACTS\.every\(\(\{ registryField \}\)/);
});
