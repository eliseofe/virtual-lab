import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const agents = read("AGENTS.md");
const current = read("CURRENT.md");
const control = read("PROJECT_CONTROL.md");
const execution = read("docs/EXECUTION_GRANULARITY.md");
const workflow = read(".github/workflows/ci-pages.yml");
const manifest = JSON.parse(read("web/product-surface.json"));
const legacyNotifier = new URL("../../.github/workflows/success-report-notifier.yml", import.meta.url);
const legacyRound1Workflow = new URL("../../.github/workflows/round1a-pages.yml", import.meta.url);
const legacyRound1Acceptance = new URL("../../docs/ROUND1_ACCEPTANCE.md", import.meta.url);

test("agent liveness policy is absolute and machine-readable", () => {
  assert.match(agents, /ZERO-TOLERANCE LIVENESS/);
  assert.match(agents, /must never put an asynchronous external process inside its own feedback loop/);
  assert.match(current, /No asynchronous external process may ever sit inside the agent's execution loop/);
  assert.match(control, /Asynchronous external systems never participate in the agent feedback loop/);
  assert.equal(manifest.agent_execution_policy?.zero_tolerance_liveness, true);
  assert.equal(manifest.agent_execution_policy?.async_external_feedback_loops, "forbidden");
  assert.equal(manifest.agent_execution_policy?.github_actions_api_during_ordinary_execution, "forbidden");
  assert.equal(manifest.agent_execution_policy?.external_status_polling, "forbidden");
  assert.equal(manifest.agent_execution_policy?.work_browser_wait_loops, "forbidden");
  assert.equal(manifest.agent_execution_policy?.long_running_remote_job_waits, "forbidden");
  assert.equal(manifest.agent_execution_policy?.connector_capability_discovery_mid_task, "forbidden");
  assert.equal(manifest.agent_execution_policy?.terminal_ci_boundary, "fire_and_forget");
});

test("stale synchronous verification-loop instructions cannot return", () => {
  for (const source of [agents, current, control, execution]) {
    assert.doesNotMatch(source, /Track only (?:the )?(?:exact )?current .*run IDs/i);
    assert.doesNotMatch(source, /wait for (?:the )?(?:GitHub )?Actions/i);
  }
  assert.match(execution, /Deployment and production verification are not agent-side waiting steps/);
});

test("retired Round-1 process artifacts stay retired", () => {
  assert.equal(existsSync(legacyRound1Workflow), false);
  assert.equal(existsSync(legacyRound1Acceptance), false);
});

test("terminal CI is autonomous, bounded, and legacy notifier is gone", () => {
  assert.match(workflow, /\.github\/terminal-report\.json/);
  assert.match(workflow, /Send terminal success report without agent monitoring/);
  assert.match(workflow, /terminal-failure-report:/);
  assert.equal(existsSync(legacyNotifier), false);

  const active = manifest.surfaces.filter((surface) => surface.state === "active");
  assert.ok(active.length > 0);
  for (const surface of active) {
    assert.ok(Array.isArray(surface.smoke) && surface.smoke.length > 0, `${surface.id} needs smoke coverage`);
    for (const check of surface.smoke) {
      assert.ok(Number.isFinite(check.timeout_seconds) && check.timeout_seconds > 0, `${surface.id} smoke needs a hard timeout`);
    }
  }
});
