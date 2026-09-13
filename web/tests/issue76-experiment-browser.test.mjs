import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

async function browserSource() {
  return readFile(path.join(src, "registry-ui-v3.js"), "utf8");
}

test("main Lab keeps a quick switch scoped to the current collection and a separate full library browser", async () => {
  const source = await browserSource();
  assert.match(source, /experimentLabel\.textContent = "Quick switch"/);
  assert.match(source, /function setQuickSwitchOptions\(\)/);
  assert.match(source, /experimentsInCollection\(currentRemote\.collection_id\)/);
  assert.match(source, /Quick switch stays in this collection/);
  assert.match(source, /Browse library/);
  assert.match(source, /document\.createElement\("dialog"\)/);
  assert.doesNotMatch(source, /experimentSelect\.hidden = true/);
});

test("loaded experiment always exposes source and location context", async () => {
  const source = await browserSource();
  assert.match(source, /Your experiment · Editable/);
  assert.match(source, /Built-in · Read-only/);
  assert.match(source, /function currentLocationLabel\(\)/);
  assert.match(source, /My experiments \/ \$\{collectionName\(currentRemote\.collection_id\)\}/);
  assert.match(source, /experiment-location/);
});

test("browser separates built-in and account-owned experiment sources", async () => {
  const source = await browserSource();
  assert.match(source, /builtinTab\.textContent = "Built-in"/);
  assert.match(source, /mineTab\.textContent = "My experiments"/);
  assert.match(source, /browser\.mineTab\.disabled = !user/);
  assert.doesNotMatch(source, /Showcase/);
});

test("All experiments renders visible Unfiled and collection sections", async () => {
  const source = await browserSource();
  assert.match(source, /filterButton\("All experiments", "all"\)/);
  assert.match(source, /filterButton\("Unfiled", "unfiled"\)/);
  assert.match(source, /const groups = \[/);
  assert.match(source, /\{ id: "unfiled", label: "Unfiled" \}/);
  assert.match(source, /collections\.map\(\(collection\) => \(\{ id: collection\.id, label: collection\.name \}\)\)/);
  assert.match(source, /experimentGroup\(groupInfo\.label, experiments/);
  assert.match(source, /grouped by where each experiment is stored/);
});

test("collection filters show one location while search expands to the whole private library", async () => {
  const source = await browserSource();
  assert.match(source, /browser\.contextTitle\.textContent = `My experiments \/ \$\{label\}`/);
  assert.match(source, /Showing only this collection/);
  assert.match(source, /Search all my experiments/);
  assert.match(source, /if \(browserSearch\.trim\(\)\) browserCollection = "all"/);
  assert.match(source, /Searching your whole private library/);
});

test("results retain revision and update context without repeating collection inside grouped sections", async () => {
  const source = await browserSource();
  assert.match(source, /Revision \$\{experiment\.revision\}/);
  assert.match(source, /Updated \$\{updated\}/);
  assert.match(source, /formatUpdated\(experiment\.updated_at\)/);
});

test("switching away from dirty work requires explicit discard confirmation", async () => {
  const source = await browserSource();
  assert.match(source, /async function confirmDiscardIfNeeded\(\)/);
  assert.match(source, /window\.confirm\("Discard the unsaved changes to the current experiment\?"\)/);
});

test("refresh belongs to the library browser and user-facing copy avoids registry jargon", async () => {
  const source = await browserSource();
  assert.match(source, /refresh\.textContent = "Refresh library"/);
  assert.match(source, /heading\.textContent = "Experiment library"/);
  assert.match(source, /Your library is ready/);
  assert.doesNotMatch(source, /Registry experiments/);
});
