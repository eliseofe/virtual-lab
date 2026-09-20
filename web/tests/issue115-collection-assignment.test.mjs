import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

async function registryUiSource() {
  return readFile(path.join(src, "registry-ui-v3.js"), "utf8");
}

test("save-as-new exposes owned collection choice and defaults owned copies to their current collection", async () => {
  const source = await registryUiSource();
  assert.match(source, /newCollection\.setAttribute\("aria-label", "New experiment collection"\)/);
  assert.match(source, /populateCollectionSelect\(ui\.newCollection, ownsCurrent \? currentRemote\.collection_id : null\)/);
  assert.match(source, /const collectionId = selectedCollectionId\(ui\.newCollection\)/);
  assert.match(source, /collection_id: collectionId/);
  assert.match(source, /data\.collection_id \? ` in \$\{collectionName\(data\.collection_id\)\}` : " without a collection"/);
});

test("owned experiments can move collections without manufacturing a scientific revision", async () => {
  const source = await registryUiSource();
  assert.match(source, /async function moveCurrentExperiment\(\)/);
  assert.match(source, /\.update\(\{ collection_id: targetCollectionId \}\)/);
  assert.match(source, /\.eq\("id", currentRemote\.id\)/);
  assert.match(source, /\.eq\("owner_id", user\.id\)/);
  assert.doesNotMatch(source, /Move conflict: a newer revision exists/);
  assert.match(source, /currentRemote = data/);
  assert.match(source, /Revision remains r\$\{data\.revision\}/);
});

test("moving first preserves dirty source edits in the Working copy, not the numbered head", async () => {
  const source = await registryUiSource();
  const start = source.indexOf("async function moveCurrentExperiment()");
  const end = source.indexOf("function openShareForm()", start);
  assert.ok(start >= 0 && end > start);
  const moveSource = source.slice(start, end);
  assert.match(moveSource, /await queueWorkingCopyAutosave\(\)/);
  assert.match(moveSource, /\.update\(\{ collection_id: targetCollectionId \}\)/);
  assert.match(source, /ui\.move\.disabled = !owned \|\| target === current/);
  assert.doesNotMatch(moveSource, /registryArtifactsForSave/);
  assert.doesNotMatch(moveSource, /updated_by_actor/);
});

test("collection selectors only use collections loaded through the signed-in account RLS path", async () => {
  const source = await registryUiSource();
  assert.match(source, /from\("experiment_collections"\)/);
  assert.match(source, /for \(const collection of collections\)/);
  assert.match(source, /option\.value = collection\.id/);
  assert.match(source, /unfiled\.value = ""/);
});
