import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const registry = await readFile(path.join(repo, "web/src/registry-ui-v3.js"), "utf8");

test("#409 reopening an owned Experiment defaults to the newest numbered revision", () => {
  const start = registry.indexOf('async function loadRemoteExperiment(id, { access = "owned" } = {})');
  const end = registry.indexOf("function connectedMessage()", start);
  assert.ok(start >= 0 && end > start);
  const load = registry.slice(start, end);

  assert.match(load, /currentWorkingCopy = workingCopy/);
  assert.match(load, /currentRevisionView = \{ kind: "revision", revision: experiment\.revision \}/);
  assert.match(load, /currentRevisions\.find\(\(revision\) => revision\.revision === experiment\.revision\)/);
  assert.doesNotMatch(load, /currentRevisionView = workingCopy\s*\?/);
  assert.doesNotMatch(load, /const initial = workingCopy\s*\?\?/);
  assert.match(load, /latest revision " \+ experiment\.revision[\s\S]*Working copy based on revision " \+ workingCopy\.base_revision \+ " remains preserved/);
});

test("#409 keeps the preserved Working copy explicitly navigable", () => {
  assert.match(registry, /if \(currentWorkingCopy && revisionFilter !== "ai"\)/);
  assert.match(registry, /revisionHistory\.list\.append\(workingCopyHistoryItem\(\)\)/);
  assert.match(registry, /button\.addEventListener\("click", \(\) => run\(selectWorkingCopy\)\)/);
});

test("#409 exposes an owner-only Discard Working copy action", () => {
  assert.match(registry, /discardWorkingCopy\.textContent = "Discard Working copy"/);
  assert.match(registry, /currentUi\.discardWorkingCopy\.hidden = !owned \|\| !currentWorkingCopy/);
  assert.match(registry, /currentUi\.discardWorkingCopy\.addEventListener\("click", \(\) => run\(discardCurrentWorkingCopy\)\)/);
});

test("#409 discard is explicit, owner-scoped and returns to the latest numbered revision", () => {
  const start = registry.indexOf("async function discardCurrentWorkingCopy()");
  const end = registry.indexOf("async function openRevisionHistory()", start);
  assert.ok(start >= 0 && end > start);
  const discard = registry.slice(start, end);

  assert.match(discard, /window\.confirm\(/);
  assert.match(discard, /Numbered revisions will remain unchanged/);
  assert.match(discard, /await workingCopyAutosave/);
  assert.match(discard, /\.from\("experiment_working_copies"\)/);
  assert.match(discard, /\.delete\(\{ count: "exact" \}\)/);
  assert.match(discard, /\.eq\("experiment_id", currentRemote\.id\)/);
  assert.match(discard, /\.eq\("owner_id", user\.id\)/);
  assert.match(discard, /currentWorkingCopy = null/);
  assert.match(discard, /currentRevisionView = \{ kind: "revision", revision: currentRemote\.revision \}/);
  assert.match(discard, /Latest revision R" \+ currentRemote\.revision \+ " loaded/);
});
