import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = readFileSync(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8");
const runtimeSpeed = readFileSync(new URL("../src/runtime-speed.js", import.meta.url), "utf8");
const professorInbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const status = readFileSync(new URL("../../CURRENT_STATUS.md", import.meta.url), "utf8");
const roadmap = readFileSync(new URL("../../ROADMAP.md", import.meta.url), "utf8");
const report = JSON.parse(readFileSync(new URL("../../.github/terminal-report.json", import.meta.url), "utf8"));

test("#299 makes the Experiment library the Professor supervision discovery surface", () => {
  assert.match(registry, /let supervisedProfiles = \[\]/);
  assert.match(registry, /let supervisedExperiments = \[\]/);
  assert.match(registry, /async function loadSupervisedExperimentList\(\)/);
  assert.match(registry, /Supervised ·/);
  assert.match(registry, /browser\.contextTitle\.textContent = "Supervised research"/);
  assert.match(registry, /experimentGroup\("Supervised research", filteredSupervised, \{ access: "supervised" \}\)/);
  assert.match(registry, /Student and researcher Experiments available through Professor supervision/);
});

test("#299 supervised cards show researcher identity and remain read-only", () => {
  assert.match(registry, /supervisedResearcherName\(experiment\.owner_id\)/);
  assert.match(registry, /Supervised · Read-only · Revision/);
  assert.match(registry, /ui\.save\.hidden = !owned/);
  assert.match(registry, /Copy to my Experiments/);
  assert.match(registry, /loadRemoteExperiment\(experiment\.id, \{ access \}\)/);
});

test("#299 preserves supervised Experiment continuity across reload and refresh", () => {
  assert.match(registry, /supervisedExperiments\.some\(\(experiment\) => experiment\.id === id\)[\s\S]*access: "supervised"/);
  assert.match(registry, /previousAccess === "supervised"[\s\S]*supervisedExperiments/);
  assert.match(registry, /loadSupervisedExperimentList\(\)/);
});

test("#299 removes the duplicate supervision modal while keeping Professor administration separate", () => {
  assert.doesNotMatch(runtimeSpeed, /professor-supervision/);
  assert.match(runtimeSpeed, /professor-inbox/);
  assert.match(professorInbox, /Capability requests/);
  assert.doesNotMatch(professorInbox, /Student experiments/);
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

test("#299 finishes this bounded #273 pass and records security as separate queued work", () => {
  assert.match(status, /#301 — Virtual Lab security, identity and authorization/);
  assert.match(status, /#302/);
  assert.match(roadmap, /#301 Security \/ identity \/ authorization/);
  assert.equal(report.schema, "vlab.terminal-report/2");
  assert.equal(report.next.kind, "scope_complete");
  assert.equal(report.next.disposition, "dormant");
  assert.equal(report.next.lab_url, "https://eliseofe.github.io/virtual-lab/");
  assert.equal(report.close_issue, 299);
});
