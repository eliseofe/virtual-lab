import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

test("private save validates current artifacts and uses optimistic revision ownership guards", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui.js"), "utf8");
  assert.match(registryUi, /function assertCurrentSourcesRunnable\(\)/);
  assert.match(registryUi, /productionExperimentRunnability\(artifacts\)/);
  assert.match(registryUi, /async function saveCurrentExperiment\(\)/);
  assert.match(registryUi, /\.update\(\{[\s\S]*updated_by_actor: "human"[\s\S]*\}\)/);
  assert.match(registryUi, /\.eq\("id", currentRemote\.id\)/);
  assert.match(registryUi, /\.eq\("owner_id", user\.id\)/);
  assert.match(registryUi, /\.eq\("revision", baseRevision\)/);
  assert.match(registryUi, /Save conflict: a newer revision exists/);
  assert.match(registryUi, /metadataRevision\.textContent = `registry r\$\{data\.revision\}`/);
});

test("save-as-new creates a distinct private human-owned registry experiment", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui.js"), "utf8");
  assert.match(registryUi, /Save as new…/);
  assert.match(registryUi, /async function createNewExperiment\(\)/);
  assert.match(registryUi, /\.insert\(\{[\s\S]*owner_id: user\.id[\s\S]*visibility: "private"[\s\S]*created_by_actor: "human"[\s\S]*\}\)/);
  assert.match(registryUi, /currentRemote = data/);
  assert.match(registryUi, /created as a private experiment/);
});

test("anonymous state exposes no persistence controls and built-in save requires save-as-new", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui.js"), "utf8");
  assert.match(registryUi, /ui\.saveRow\.hidden = !user/);
  assert.match(registryUi, /Use Save as new for the built-in experiment/);
  assert.match(registryUi, /Sign in before saving/);
});

test("refresh detects newer remote revisions without discarding local edits", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui.js"), "utf8");
  assert.match(registryUi, /const dirty = hasUnsavedRemoteEdits\(\)/);
  assert.match(registryUi, /fresh\.revision > previousRemote\.revision/);
  assert.match(registryUi, /Your local edits are preserved; reload before saving/);
});

test("write-back remains artifact-descriptor driven", async () => {
  const registryUi = await readFile(path.join(src, "registry-ui.js"), "utf8");
  assert.match(registryUi, /EXPERIMENT_ARTIFACTS/);
  assert.match(registryUi, /captureExperimentArtifacts\(\)/);
  assert.doesNotMatch(registryUi, /document\.querySelector\("#experiment-config"\)\.value/);
  assert.doesNotMatch(registryUi, /document\.querySelector\("#initializer-source"\)\.value/);
  assert.doesNotMatch(registryUi, /document\.querySelector\("#controller-source"\)\.value/);
});
