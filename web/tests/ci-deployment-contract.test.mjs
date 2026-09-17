import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const workflow = read(".github/workflows/ci-pages.yml");
const manifest = JSON.parse(read("web/product-surface.json"));
const legacyNotifier = new URL("../../.github/workflows/success-report-notifier.yml", import.meta.url);
const legacyRound1Workflow = new URL("../../.github/workflows/round1a-pages.yml", import.meta.url);
const legacyRound1Acceptance = new URL("../../docs/ROUND1_ACCEPTANCE.md", import.meta.url);

test("production verification waits for the exact deployed candidate", () => {
  const stamp = workflow.indexOf("Stamp exact candidate");
  const wait = workflow.indexOf("Wait for exact deployed candidate");
  const verification = workflow.indexOf("Verify deployed current Lab surface");
  assert.ok(stamp >= 0 && wait > stamp && verification > wait);
  assert.match(workflow, /deploy-sha\.txt/);
  assert.match(workflow, /wait-deployed-sha\.mjs/);
  assert.equal(manifest.coverage_policy?.exact_deployed_candidate_marker_required, true);
});

test("retired Round-1 workflow artifacts stay retired", () => {
  assert.equal(existsSync(legacyRound1Workflow), false);
  assert.equal(existsSync(legacyRound1Acceptance), false);
});

test("owner notification is success-only and occurs after deployed smoke", () => {
  const smokeJob = workflow.indexOf("smoke:");
  const verification = workflow.indexOf("Verify deployed current Lab surface");
  const successReport = workflow.indexOf("Send owner success report");
  assert.ok(smokeJob >= 0 && verification > smokeJob && successReport > verification);
  assert.match(workflow, /Virtual Lab production deployment succeeded/);
  assert.doesNotMatch(workflow, /terminal-failure-report:/);
  assert.doesNotMatch(workflow, /Virtual Lab production run failed/);
  assert.equal(existsSync(legacyNotifier), false);
});

test("every active production surface has executable smoke coverage", () => {
  const active = manifest.surfaces.filter((surface) => surface.state === "active");
  assert.ok(active.length > 0);
  for (const surface of active) {
    assert.ok(Array.isArray(surface.smoke) && surface.smoke.length > 0, `${surface.id} needs smoke coverage`);
    for (const check of surface.smoke) {
      assert.ok(Number.isFinite(check.timeout_seconds) && check.timeout_seconds > 0, `${surface.id} smoke needs a hard timeout`);
    }
  }
});
