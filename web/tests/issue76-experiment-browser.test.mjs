import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

async function browserSource() {
  return readFile(path.join(src, "registry-ui-v2.js"), "utf8");
}

test("experiment picker replaces the giant visible native dropdown with a browser dialog", async () => {
  const source = await browserSource();
  assert.match(source, /experimentSelect\.hidden = true/);
  assert.match(source, /Browse experiments/);
  assert.match(source, /document\.createElement\("dialog"\)/);
  assert.match(source, /experiment-browser/);
  assert.match(source, /showModal\(\)/);
});

test("browser separates built-in and account-owned experiment sources", async () => {
  const source = await browserSource();
  assert.match(source, /builtinTab\.textContent = "Built-in"/);
  assert.match(source, /mineTab\.textContent = "My experiments"/);
  assert.match(source, /mineTab\.disabled = !user/);
  assert.doesNotMatch(source, /Showcase/);
});

test("browser exposes backend collections, unfiled and title search", async () => {
  const source = await browserSource();
  assert.match(source, /\.from\("experiment_collections"\)/);
  assert.match(source, /\.select\("id,name,updated_at"\)/);
  assert.match(source, /collection_id/);
  assert.match(source, /filterButton\("All", "all"\)/);
  assert.match(source, /filterButton\("Unfiled", "unfiled"\)/);
  assert.match(source, /Search experiments/);
  assert.match(source, /experiment\.title\.toLocaleLowerCase\(\)\.includes\(search\)/);
});

test("results retain revision, collection and update context", async () => {
  const source = await browserSource();
  assert.match(source, /collectionName\(experiment\.collection_id\)/);
  assert.match(source, /r\$\{experiment\.revision\}/);
  assert.match(source, /formatUpdated\(experiment\.updated_at\)/);
});

test("switching away from dirty work requires explicit discard confirmation", async () => {
  const source = await browserSource();
  assert.match(source, /async function confirmDiscardIfNeeded\(\)/);
  assert.match(source, /window\.confirm\("Discard the unsaved changes to the current experiment\?"\)/);
});

test("refresh is located inside the experiment browser rather than next to a long dropdown", async () => {
  const source = await browserSource();
  assert.match(source, /headActions\.append\(refresh, close\)/);
  assert.match(source, /browser\.refresh\.addEventListener/);
  assert.doesNotMatch(source, /registry-refresh-row/);
});
