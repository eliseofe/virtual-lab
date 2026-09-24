import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registryUrl = new URL("../src/registry-ui-v3.js", import.meta.url);
const libraryUrl = new URL("../src/experiment-library.js", import.meta.url);

test("issue #153 restores the last owned experiment for the authenticated account", async () => {
  const source = await readFile(registryUrl, "utf8");
  assert.match(source, /WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:"/);
  assert.match(source, /window\.localStorage\.setItem\(key, value\)/);
  assert.match(source, /async function restoreRememberedWorkspace\(\)/);
  assert.match(source, /await restoreRememberedWorkspace\(\);/);
  assert.match(source, /rememberCurrentWorkspace\(\);/);
});

test("issue #153 makes experiment switching global while #480 gives browsing source-specific hierarchy", async () => {
  const source = await readFile(registryUrl, "utf8");
  const library = await readFile(libraryUrl, "utf8");
  assert.match(source, /experimentLabel\.textContent = "Experiment"/);
  assert.match(source, /experimentSelect\.setAttribute\("aria-label", "Switch experiment"\)/);
  assert.doesNotMatch(source, /Quick switch within the current collection/);
  // #554: behaviour covered by registry-workspace-location.test.mjs; this checks the workspace uses the rule.
  assert.match(source, /const switcher = quickSwitchOptions\(\{/);
  assert.match(source, /browse\.textContent = "Browse experiments"/);
  assert.match(source, /vlab:open-experiment-library/);
  assert.match(library, /"All Showcase"/);
  assert.match(library, /"All in Mine"/);
  assert.match(library, /"All shared"/);
  assert.doesNotMatch(library, /"All experiments"/);
});
