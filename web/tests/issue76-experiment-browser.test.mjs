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

test("main Lab exposes one direct experiment switcher and one full finder", async () => {
  const source = await browserSource();
  assert.match(source, /experimentLabel\.textContent = "Experiment"/);
  assert.match(source, /experimentSelect\.setAttribute\("aria-label", "Switch experiment"\)/);
  assert.match(source, /function setQuickSwitchOptions\(\)/);
  assert.match(source, /group\.label = "Your experiments"/);
  assert.match(source, /Find experiment/);
  assert.match(source, /document\.createElement\("dialog"\)/);
  assert.doesNotMatch(source, /Quick switch stays in this collection/);
});

test("loaded experiment exposes ownership, revision and optional location context", async () => {
  const source = await browserSource();
  assert.match(source, /Your experiment · Editable/);
  assert.match(source, /Built-in · Read-only/);
  assert.match(source, /function currentLocationLabel\(\)/);
  assert.match(source, /Collection · \$\{collectionName\(currentRemote\.collection_id\)\}/);
  assert.match(source, /No collection/);
  assert.match(source, /Revision \$\{experiment\.revision\}/);
  assert.match(source, /experiment-location/);
});

test("browser unifies built-in and account-owned experiment sources", async () => {
  const source = await browserSource();
  assert.match(source, /tabs\.hidden = true/);
  assert.match(source, /browser\.contextTitle\.textContent = "Experiments"/);
  assert.match(source, /Search the built-in source and all of your runnable experiments in one place/);
  assert.match(source, /builtInResult\(\)/);
  assert.match(source, /experimentGroup\(label, filtered\)/);
  assert.doesNotMatch(source, /Showcase/);
});

test("collections remain optional filters rather than navigation prerequisites", async () => {
  const source = await browserSource();
  assert.match(source, /filterButton\("All experiments", "all"\)/);
  assert.match(source, /filterButton\("No collection", "unfiled"\)/);
  assert.match(source, /for \(const collection of collections\) browser\.filters\.append/);
  assert.match(source, /Collections are optional filters/);
  assert.match(source, /if \(browserSearch\.trim\(\)\) browserCollection = "all"/);
});

test("switching away from dirty work requires explicit discard confirmation", async () => {
  const source = await browserSource();
  assert.match(source, /async function confirmDiscardIfNeeded\(\)/);
  assert.match(source, /window\.confirm\("Discard the unsaved changes to the current experiment\?"\)/);
  assert.match(source, /if \(!\(await confirmDiscardIfNeeded\(\)\)\)/);
});

test("refresh belongs to the finder and user-facing copy avoids registry jargon", async () => {
  const source = await browserSource();
  assert.match(source, /refresh\.textContent = "Refresh library"/);
  assert.match(source, /heading\.textContent = "Experiment library"/);
  assert.match(source, /Your library is ready/);
  assert.doesNotMatch(source, /Registry experiments/);
});
