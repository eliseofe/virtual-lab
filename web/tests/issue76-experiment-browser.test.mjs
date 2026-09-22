import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

async function registrySource() {
  return readFile(path.join(src, "registry-ui-v3.js"), "utf8");
}

async function librarySource() {
  return readFile(path.join(src, "experiment-library.js"), "utf8");
}

test("main Lab exposes one direct switcher and one unified Experiment Library", async () => {
  const registry = await registrySource();
  const library = await librarySource();
  assert.match(registry, /experimentLabel\.textContent = "Experiment"/);
  assert.match(registry, /experimentSelect\.setAttribute\("aria-label", "Switch experiment"\)/);
  assert.match(registry, /function setQuickSwitchOptions\(\)/);
  assert.match(registry, /group\.label = "Your experiments"/);
  assert.match(registry, /browse\.textContent = "Browse experiments"/);
  assert.match(registry, /vlab-open-experiment-library/);
  assert.match(library, /dialog\.className = "vlab-library"/);
  assert.match(library, /title\.textContent = "Experiment library"/);
  assert.doesNotMatch(library, /Built-in|All experiments/);
});

test("loaded experiment exposes ownership, revision and location context", async () => {
  const source = await registrySource();
  assert.match(source, /Your experiment · Editable/);
  assert.match(source, /Showcase · Read-only/);
  assert.match(source, /function currentLocationLabel\(\)/);
  assert.match(source, /Collection · \$\{collectionName\(currentRemote\.collection_id\)\}/);
  assert.match(source, /No collection/);
  assert.match(source, /Showcase \/ \$\{currentShowcase\.showcase_collection_name \|\| "Uncategorized"\}/);
  assert.match(source, /experiment-location/);
});

test("library uses fixed role-aware sources with source-specific browse hierarchy", async () => {
  const source = await librarySource();
  assert.match(source, /SOURCE_ORDER = \["showcase", "mine", "shared", "supervised"\]/);
  assert.match(source, /"All Showcase"/);
  assert.match(source, /"Uncategorized"/);
  assert.match(source, /"All in Mine"/);
  assert.match(source, /"Unfiled"/);
  assert.match(source, /"All shared"/);
  assert.match(source, /ownerGroups\(sharedExperiments\)/);
  assert.match(source, /ownerGroups\(supervisedExperiments\)/);
  assert.match(source, /navigation\.supervised\.researcherId/);
  assert.match(source, /navigation\.supervised\.kind === "collection"/);
});

test("search accelerates browsing but does not define the navigation tree", async () => {
  const source = await librarySource();
  assert.match(source, /function renderDirectory\(\)/);
  assert.match(source, /function hereRows\(/);
  assert.match(source, /\["here", "Here"\], \["all", "All sources"\]/);
  assert.match(source, /if \(query && navigation\.scope === "all"\)/);
  assert.match(source, /if \(!navigation\.query\.trim\(\) && navigation\.scope === "all"\) navigation\.scope = "here"/);
  assert.doesNotMatch(source, /filterButton\("All experiments"/);
});

test("switching away from dirty owned work autosaves before navigation", async () => {
  const source = await registrySource();
  assert.match(source, /async function confirmDiscardIfNeeded\(\)/);
  assert.match(source, /await queueWorkingCopyAutosave\(\)/);
  assert.match(source, /if \(!\(await confirmDiscardIfNeeded\(\)\)\)/);
});

test("Open is load-only while Open & run is explicit in Details", async () => {
  const source = await librarySource();
  assert.match(source, /async function openRow\(source, row, runAfter = false\)/);
  assert.match(source, /if \(runAfter\) document\.querySelector\("#run"\)\?\.click\(\)/);
  assert.match(source, /button\("Open & run"\)/);
  assert.match(source, /openRow\(source, row, true\)/);
});

test("experiment library exposes exact revision time and actor provenance", async () => {
  const source = await librarySource();
  assert.match(source, /function formatDateTime\(value\)/);
  assert.match(source, /timeZoneName: "short"/);
  assert.match(source, /"Revision time"/);
  assert.match(source, /"Revision actor"/);
  assert.match(source, /row\.revision_actor \|\| "Not recorded"/);
});
