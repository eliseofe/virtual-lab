import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const source = await readFile(path.join(repo, "web/src/registry-ui-v2.js"), "utf8");

test("#198 registry loads canonical artifacts instead of reconstructing Metrics as empty", () => {
  const canonicalSelections = [
    "id,owner_id,collection_id,title,revision,updated_at,artifacts,config_source,initializer_source,controller_source",
    "id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,updated_at",
  ];

  assert.match(source, new RegExp(`\\.select\\(\\"${canonicalSelections[0]}\\"\\)`));
  const fullRowMatches = source.match(new RegExp(`\\.select\\(\\"${canonicalSelections[1]}\\"\\)`, "g")) ?? [];
  assert.equal(fullRowMatches.length, 3, "read, save and create must all return canonical artifacts");
});

test("#198 Metrics edits participate in registry dirty-state comparison", () => {
  assert.match(source, /experimentArtifactsEqual,/);
  assert.match(source, /return experimentArtifactsEqual\(left, right\);/);
  assert.doesNotMatch(source, /EXPERIMENT_ARTIFACTS\.every\(\(\{ registryField \}\)/);
});
