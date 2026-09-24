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
  // #554: behaviour covered by registry-workspace-location.test.mjs; this checks the workspace uses the rule.
  assert.match(registry, /const switcher = quickSwitchOptions\(\{/);
  assert.match(registry, /browse\.textContent = "Browse experiments"/);
  assert.match(registry, /vlab:open-experiment-library/);
  assert.match(library, /dialog\.className = "vlab-library"/);
  assert.match(library, /title\.textContent = "Experiment library"/);
  assert.doesNotMatch(library, /Built-in|All experiments/);
});

test("loaded experiment exposes ownership, revision and location context", async () => {
  const source = await registrySource();
  // #554: behaviour covered by registry-workspace-status.test.mjs; this checks the workspace applies the rule.
  assert.match(source, /currentUi\.origin\.textContent = status\.origin\.text/);
  assert.match(source, /Showcase · Read-only/);
  assert.match(source, /currentUi\.location\.textContent = status\.location/);
  assert.match(source, /experiment-location/);
});

test("library uses fixed role-aware sources with source-specific browse hierarchy", async () => {
  const source = await librarySource();
  // #547: behaviour covered by library-browse.test.mjs; these check the Library uses the rules.
  assert.match(source, /availableSourcesFor\(\{ signedIn: Boolean\(sessionUser\), role: profile\?\.role \}\)/);
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
  // #547: behaviour covered by library-browse.test.mjs; these check the Library uses the rules.
  assert.match(source, /results\(\{ navigation, data: libraryData\(\), sources: availableSources\(\) \}\)/);
  assert.match(source, /\["here", "Here"\], \["all", "All sources"\]/);
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
  assert.match(source, /if \(runAfter\) simulationCommands\.run\(\)/);
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
