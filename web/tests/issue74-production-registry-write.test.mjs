import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { registryExperimentRunnability } from "../src/experiment-validation.js";
import { DEFAULT_CATALOG_EXPERIMENT } from "../src/experiment-catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

async function registryUiSource() {
  return readFile(path.join(src, "registry-ui-v3.js"), "utf8");
}

test("private human edits autosave to a Working copy and only Save Revision crystallizes", async () => {
  const registryUi = await registryUiSource();
  assert.match(registryUi, /function registryArtifactsForSave/);
  assert.match(registryUi, /registryExperimentRunnability\(artifacts\)/);
  assert.match(registryUi, /async function persistWorkingCopy\(\)/);
  assert.match(registryUi, /\.from\("experiment_working_copies"\)/);
  assert.match(registryUi, /base_revision: baseRevision/);
  assert.match(registryUi, /async function saveCurrentExperiment\(\)/);
  assert.match(registryUi, /crystallize_experiment_working_copy/);
  assert.match(registryUi, /Save Revision/);
  assert.doesNotMatch(registryUi, /Save conflict: a newer revision exists/);
  assert.doesNotMatch(registryUi, /conflictRevision/);
});

test("catalog examples satisfy the same strict registry runtime contract as saved Experiments", () => {
  assert.equal(registryExperimentRunnability(DEFAULT_CATALOG_EXPERIMENT).runnable, true);
});

test("save-as-new creates a distinct private human-owned registry experiment", async () => {
  const registryUi = await registryUiSource();
  assert.match(registryUi, /Save as new…/);
  assert.match(registryUi, /async function createNewExperiment\(\)/);
  assert.match(registryUi, /const artifacts = registryArtifactsForSave\(\);/);
  assert.doesNotMatch(registryUi, /allowBuiltInCompatibility|registryArtifactsFromProductionExperiment/);
  assert.match(registryUi, /\.insert\(\{[\s\S]*owner_id: user\.id[\s\S]*collection_id: collectionId[\s\S]*visibility: "private"[\s\S]*created_by_actor: "human"[\s\S]*\}\)/);
  assert.match(registryUi, /currentRemote = data/);
  assert.match(registryUi, /data\.collection_id \? ` in \$\{collectionName\(data\.collection_id\)\}` : " without a collection"/);
});

test("editability feedback distinguishes numbered state from Working-copy persistence", async () => {
  const registryUi = await registryUiSource();
  assert.match(registryUi, /Showcase · Read-only/);
  assert.match(registryUi, /Your experiment · Editable/);
  assert.match(registryUi, /currentRemote\.revision \+ " · Saved"/);
  assert.match(registryUi, /"Working · pending · " \+ baseRevision/);
  assert.match(registryUi, /"Working · " \+ currentWorkingCopy\.base_revision/);
  assert.match(registryUi, /ui\.save\.hidden = !owned \|\| protectedWorkingCopy/);
  assert.match(registryUi, /ui\.save\.disabled = !owned \|\| protectedWorkingCopy \|\| \(!dirty && !currentWorkingCopy\)/);
});

test("anonymous state exposes no persistence controls and Showcase sources can only be copied after sign-in", async () => {
  const registryUi = await registryUiSource();
  assert.match(registryUi, /ui\.saveRow\.hidden = !user/);
  assert.match(registryUi, /Sign in before saving/);
  assert.match(registryUi, /The Showcase source cannot be overwritten/);
});

test("refresh exposes newer numbered revisions without changing the current revision view", async () => {
  const registryUi = await registryUiSource();
  assert.match(registryUi, /fresh\.revision > previousRemote\.revision/);
  assert.match(registryUi, /await loadRevisionHistory\(\)/);
  // #554: behaviour covered by registry-labels.test.mjs; this checks the registry uses the rule.
  assert.match(registryUi, /setMessage\(newRevisionMessage\(fresh\.revision, actor\), "success"\)/);
  assert.doesNotMatch(registryUi, /Reload the experiment before saving/);
});

test("write-back remains artifact-descriptor driven", async () => {
  const registryUi = await registryUiSource();
  assert.match(registryUi, /EXPERIMENT_ARTIFACTS/);
  assert.match(registryUi, /captureExperimentArtifacts\(\)/);
  assert.doesNotMatch(registryUi, /document\.querySelector\("#experiment-config"\)\.value/);
  assert.doesNotMatch(registryUi, /document\.querySelector\("#initializer-source"\)\.value/);
  assert.doesNotMatch(registryUi, /document\.querySelector\("#controller-source"\)\.value/);
});
