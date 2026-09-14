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
  assert.match(source, /created in My experiments \/ \$\{collectionName\(data\.collection_id\)\}/);
});

test("owned experiments can move collections with optimistic ownership and revision guards", async () => {
  const source = await registryUiSource();
  assert.match(source, /async function moveCurrentExperiment\(\)/);
  assert.match(source, /\.update\(\{ collection_id: targetCollectionId, updated_by_actor: "human", updated_by_ai_client: null \}\)/);
  assert.match(source, /\.eq\("id", currentRemote\.id\)/);
  assert.match(source, /\.eq\("owner_id", user\.id\)/);
  assert.match(source, /\.eq\("revision", baseRevision\)/);
  assert.match(source, /Move conflict: a newer revision exists/);
  assert.match(source, /currentRemote = data/);
  assert.match(source, /moved to My experiments \/ \$\{collectionName\(data\.collection_id\)\}/);
});

test("moving never implicitly persists dirty source edits", async () => {
  const source = await registryUiSource();
  const start = source.indexOf("async function moveCurrentExperiment()");
  const end = source.indexOf("function defaultCopyTitle()", start);
  assert.ok(start >= 0 && end > start);
  const moveSource = source.slice(start, end);
  assert.match(moveSource, /if \(hasUnsavedRemoteEdits\(\)\) throw new Error\("Save or discard source edits before moving this experiment\."\)/);
  assert.match(source, /ui\.move\.disabled = !owned \|\| dirty \|\| conflictRevision !== null \|\| target === current/);
  assert.doesNotMatch(moveSource, /registryArtifactsForSave/);
});

test("collection selectors only use collections loaded through the signed-in account RLS path", async () => {
  const source = await registryUiSource();
  assert.match(source, /from\("experiment_collections"\)/);
  assert.match(source, /for \(const collection of collections\)/);
  assert.match(source, /option\.value = collection\.id/);
  assert.match(source, /unfiled\.value = ""/);
});
