import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellUrl = new URL("../src/workspace-shell.js", import.meta.url);
const organizationUrl = new URL("../src/collection-organization.js", import.meta.url);
const registryUrl = new URL("../src/registry-ui-v3.js", import.meta.url);

async function sources() {
  return Promise.all([
    readFile(shellUrl, "utf8"),
    readFile(organizationUrl, "utf8"),
    readFile(registryUrl, "utf8"),
  ]);
}

test("issue #157 keeps collections out of primary experiment navigation", async () => {
  const [shell, organization] = await sources();
  assert.match(shell, /import "\.\/collection-organization\.js";/);
  assert.match(organization, /\.experiment-browser-body \{ grid-template-columns: minmax\(0, 1fr\) !important; \}/);
  assert.match(organization, /setHidden\(filters, true\)/);
  assert.match(organization, /Collections are optional metadata, never navigation/);
  assert.doesNotMatch(organization, /filterButton\(|browserCollection/);
});

test("issue #157 exposes one explicit secondary Organize surface", async () => {
  const [, organization] = await sources();
  assert.match(organization, /organizeButton\.textContent = "Organize"/);
  assert.match(organization, /dialog\.id = "collection-organizer"/);
  assert.match(organization, /Collections are optional organization/);
  assert.match(organization, /Open one of your experiments to change its organization/);
});

test("issue #157 reuses existing move semantics instead of writing experiments directly", async () => {
  const [, organization] = await sources();
  assert.match(organization, /document\.querySelector\("\.registry-move-row"\)/);
  assert.match(organization, /organizer\.assignmentSlot\.append\(row\)/);
  assert.match(organization, /setText\(button, "Save organization"\)/);
  assert.doesNotMatch(organization, /from\("experiments"\)/);
  assert.doesNotMatch(organization, /collection_id\s*:/);
});

test("issue #157 confines no-collection language to organization contexts", async () => {
  const [, organization] = await sources();
  assert.match(organization, /setText\(emptyOption, "No collection"\)/);
  assert.match(organization, /Collection \(optional\)/);
  assert.match(organization, /replaceAll\("Unfiled", "No collection"\)/);
  assert.match(organization, /location\.textContent\?\.trim\(\) === "No collection"/);
  assert.match(organization, /label\.endsWith\(" · No collection"\)/);
  assert.match(organization, /Your experiment · No collection ·/);
});

test("issue #157 collection management is bounded to the existing collection table", async () => {
  const [, organization] = await sources();
  assert.match(organization, /from\("experiment_collections"\)\.insert/);
  assert.match(organization, /from\("experiment_collections"\)[\s\S]*\.update\(\{ name \}\)/);
  assert.match(organization, /\.eq\("owner_id", user\.id\)/);
  assert.doesNotMatch(organization, /\.delete\(\)/);
  assert.doesNotMatch(organization, /capability_requests|experiment-mcp|controller_source|initializer_source/);
});

test("issue #157 observer mutations are idempotent", async () => {
  const [, organization] = await sources();
  assert.match(organization, /function setHidden\(element, hidden\)/);
  assert.match(organization, /if \(element\.hidden !== hidden\) element\.hidden = hidden;/);
  assert.match(organization, /function setText\(element, text\)/);
  assert.match(organization, /if \(element\.textContent !== text\) element\.textContent = text;/);
  assert.match(organization, /attributeFilter: \["hidden", "data-kind"\]/);
});

test("issue #157 preserves existing registry save-as-new and move endpoints underneath", async () => {
  const [, , registry] = await sources();
  assert.match(registry, /async function moveCurrentExperiment\(\)/);
  assert.match(registry, /ui\.move\.addEventListener\("click", \(\) => run\(moveCurrentExperiment\)\)/);
  assert.match(registry, /populateCollectionSelect\(ui\.newCollection/);
  assert.match(registry, /collection_id: collectionId/);
});
