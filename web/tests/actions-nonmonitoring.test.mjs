import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const agents = readFileSync(new URL("../../AGENTS.md", import.meta.url), "utf8");
const current = readFileSync(new URL("../../CURRENT.md", import.meta.url), "utf8");
const surface = JSON.parse(readFileSync(new URL("../product-surface.json", import.meta.url), "utf8"));
const workflow = readFileSync(new URL("../../.github/workflows/round1a-pages.yml", import.meta.url), "utf8");
const legacyNotifier = new URL("../../.github/workflows/success-report-notifier.yml", import.meta.url);

test("agent execution absolutely forbids GitHub Actions monitoring", () => {
  assert.match(agents, /ABSOLUTE RULE: during ordinary Virtual Lab product work or maintenance, the agent must NEVER inspect, monitor, poll, wait on, or query GitHub Actions execution state/);
  assert.match(agents, /There is no permitted “one quick check”/);
  assert.match(current, /not for an exact SHA, not for an exact run ID, not once/);
  assert.equal(surface.agent_execution_policy?.github_actions_api_during_ordinary_execution, "forbidden");
  assert.equal(surface.agent_execution_policy?.github_actions_role, "fire-and-forget-ci-deploy-smoke-report-only");
  assert.doesNotMatch(agents, /Track only the exact current SHA\/PR\/run IDs/);
  assert.doesNotMatch(current, /same execution turn/);
  assert.doesNotMatch(agents, /same execution turn/);
});

test("only explicit failed-run diagnosis may inspect Actions", () => {
  assert.match(agents, /sole exception is a separate diagnostic turn explicitly requested by the owner for a specific failed run or failure notification/);
  assert.match(current, /only exception is a separate owner-requested diagnostic turn for a specific failure notification\/run/);
  assert.equal(surface.agent_execution_policy?.diagnostic_exception, "owner-explicit-specific-failure-only-no-polling");
});

test("terminal CI reports autonomously and legacy notifier is gone", () => {
  assert.match(workflow, /\.github\/terminal-report\.json/);
  assert.match(workflow, /Send terminal success report without agent monitoring/);
  assert.match(workflow, /terminal-failure-report:/);
  assert.match(workflow, /Send terminal failure report without agent monitoring/);
  assert.equal(existsSync(legacyNotifier), false);
});
