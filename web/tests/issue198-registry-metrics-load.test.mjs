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

test("#198 active registry loads canonical artifacts instead of reconstructing Metrics as empty", () => {
  const listSelection = "id,owner_id,collection_id,title,revision,updated_at,artifacts,config_source,initializer_source,controller_source";
  const fullSelection = "id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,updated_at";

  assert.match(registry, new RegExp(`\\.select\\(\\"${listSelection}\\"\\)`));
  const fullRowMatches = registry.match(new RegExp(`\\.select\\(\\"${fullSelection}\\"\\)`, "g")) ?? [];
  assert.ok(fullRowMatches.length >= 4, "read/save/move/create must preserve canonical artifacts");
});

test("#198 Metrics edits participate in active registry dirty-state comparison", () => {
  assert.match(registry, /experimentArtifactsEqual,/);
  assert.match(registry, /return experimentArtifactsEqual\(left, right\);/);
  assert.doesNotMatch(registry, /EXPERIMENT_ARTIFACTS\.every\(\(\{ registryField \}\)/);
});
