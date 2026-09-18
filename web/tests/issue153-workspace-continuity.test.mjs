import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registryUrl = new URL("../src/registry-ui-v3.js", import.meta.url);

test("issue #153 restores the last owned experiment for the authenticated account", async () => {
  const source = await readFile(registryUrl, "utf8");
  assert.match(source, /WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:"/);
  assert.match(source, /window\.localStorage\.setItem\(key, value\)/);
  assert.match(source, /async function restoreRememberedWorkspace\(\)/);
  assert.match(source, /await restoreRememberedWorkspace\(\);/);
  assert.match(source, /rememberCurrentWorkspace\(\);/);
});

test("issue #153 makes experiment switching global rather than collection-scoped", async () => {
  const source = await readFile(registryUrl, "utf8");
  assert.match(source, /experimentLabel\.textContent = "Experiment"/);
  assert.match(source, /experimentSelect\.setAttribute\("aria-label", "Switch experiment"\)/);
  assert.doesNotMatch(source, /Quick switch within the current collection/);
  assert.match(source, /group\.label = "Your experiments"/);
  assert.match(source, /browse\.textContent = "Find experiment"/);
  assert.match(source, /Browse built-in, owned/);
  assert.match(source, /Collections organize only your own workspace/);
  assert.match(source, /tabs\.hidden = true/);
  assert.match(source, /filterButton\("All experiments", "all"\)/);
  assert.match(source, /filterButton\("No collection", "unfiled"\)/);
});
