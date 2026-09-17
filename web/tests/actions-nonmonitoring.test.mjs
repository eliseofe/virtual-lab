import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const agents = readFileSync(new URL("../../AGENTS.md", import.meta.url), "utf8");
const current = readFileSync(new URL("../../CURRENT.md", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/round1a-pages.yml", import.meta.url), "utf8");
const legacyNotifier = new URL("../../.github/workflows/success-report-notifier.yml", import.meta.url);

test("agent execution forbids proactive GitHub Actions monitoring", () => {
  assert.match(agents, /must \*\*not call workflow-run, job, log, queue, check-status or Actions-history APIs/);
  assert.match(agents, /No polling, no single status check, no waiting for a run, and no monitoring loop/);
  assert.match(current, /There is no exception for “one quick check,” an exact SHA, or an exact run ID/);
  assert.doesNotMatch(agents, /Track only the exact current SHA\/PR\/run IDs/);
  assert.doesNotMatch(current, /Track only the exact workflow run IDs\/SHA\/PR/);
});

test("terminal CI reports autonomously and legacy notifier is gone", () => {
  assert.match(workflow, /\.github\/terminal-report\.json/);
  assert.match(workflow, /Send terminal success report without agent monitoring/);
  assert.match(workflow, /terminal-failure-report:/);
  assert.match(workflow, /Send terminal failure report without agent monitoring/);
  assert.equal(existsSync(legacyNotifier), false);
});
