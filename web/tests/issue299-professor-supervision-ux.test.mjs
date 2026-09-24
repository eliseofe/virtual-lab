import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = readFileSync(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8");
const runtimeSpeed = readFileSync(new URL("../src/runtime-speed.js", import.meta.url), "utf8");
const professorInbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const workspaceShell = readFileSync(new URL("../src/workspace-shell.js", import.meta.url), "utf8");
const reactChrome = readFileSync(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8");
const status = readFileSync(new URL("../../CURRENT_STATUS.md", import.meta.url), "utf8");
const roadmap = readFileSync(new URL("../../ROADMAP.md", import.meta.url), "utf8");

test("#299 makes the Experiment library the Professor supervision discovery surface", () => {
  assert.match(registry, /let supervisedProfiles = \[\]/);
  assert.match(registry, /let supervisedExperiments = \[\]/);
  assert.match(registry, /async function loadSupervisedExperimentList\(\)/);
  // #554: behaviour covered by registry-labels.test.mjs; this checks the registry uses the rule.
  assert.match(registry, /currentLocationLabelFor\(\{ remote: currentRemote, access: currentRemoteAccess, collections, supervisedProfiles \}\)/);
  // #554: the retired flat browser was removed; the unified Library shows this, covered by library-browse.test.mjs.
  assert.doesNotMatch(registry, /function renderBrowser|const browser = null/);
});

test("#299 supervised cards show researcher identity and remain read-only", () => {
  // #554: the retired flat browser was removed; the unified Library shows this, covered by library-browse.test.mjs.
  assert.match(registry, /supervisedResearcherName\(currentRemote\.owner_id\)/);
  assert.match(registry, /ui\.save\.hidden = !owned/);
  assert.match(registry, /Copy to my Experiments/);
  assert.match(registry, /openRegistry: async \(experimentId, access\) => \{[\s\S]*?loadRemoteExperiment\(experimentId, \{ access \}\)/);
});

test("#299 preserves supervised Experiment continuity across reload and refresh", () => {
  assert.match(registry, /supervisedExperiments\.some\(\(experiment\) => experiment\.id === id\)[\s\S]*access: "supervised"/);
  assert.match(registry, /previousAccess === "supervised"[\s\S]*supervisedExperiments/);
  assert.match(registry, /loadSupervisedExperimentList\(\)/);
});

test("#299 removes Professor administration from global navigation while preserving the inbox authority", () => {
  assert.doesNotMatch(runtimeSpeed, /professor-supervision/);
  assert.match(runtimeSpeed, /professor-inbox/);
  assert.match(professorInbox, /Extension requests/);
  assert.doesNotMatch(professorInbox, /Student experiments/);
  assert.match(workspaceShell, /function openProfessorInbox\(\)/);
  assert.match(workspaceShell, /professorButton\.addEventListener\("click", openProfessorInbox\)/);
  assert.match(workspaceShell, /accountPanel\.style\.display = ""/);
  assert.match(workspaceShell, /professorPanel\.style\.display = "none"/);
  assert.doesNotMatch(reactChrome, /data-vlab-nav="professor"|proxyClick\('#professor-menu'\)/);
  assert.match(reactChrome, /data-vlab-nav="account"/);
});

test("#299 leaves authorization semantics outside the UI restructuring", () => {
  const start = registry.indexOf("async function loadSupervisedExperimentList()");
  const end = registry.indexOf("async function loadExperimentList()", start);
  assert.ok(start >= 0 && end > start);
  const supervisedLoader = registry.slice(start, end);
  assert.match(supervisedLoader, /\.from\("experiments"\)/);
  assert.match(supervisedLoader, /\.select\(/);
  assert.doesNotMatch(supervisedLoader, /\.(insert|update|delete)\(/);
});

test("#299 remains complete while the living #273 lane can return dormant after bounded UI work", () => {
  assert.match(status, /#273 UI\/UX refinement[^\n]*living domain, currently dormant/i);
  assert.match(status, /#301 Security \/ identity \/ authorization[^\n]*living domain/i);
  assert.match(status, /#302/);
  assert.match(roadmap, /#301 Security \/ identity \/ authorization/);
  assert.match(roadmap, /#425 Refactoring \/ technical-debt reduction/);
});
