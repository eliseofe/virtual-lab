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

test("closed-loop completion policy is explicit and machine-readable", () => {
  assert.match(agents, /CLOSED LOOP \+ BOUNDED LIVENESS/);
  assert.match(agents, /do not report work as complete until the actual deployed product has been verified/i);
  assert.match(current, /project completion contract is closed-loop and bounded/i);
  assert.match(control, /completion means: implementation .* exact-candidate CI\/build .* deployment .* deployed behavior/i);
  assert.match(execution, /Local\/static success is necessary but never sufficient/i);

  assert.equal(manifest.agent_execution_policy?.closed_loop_required, true);
  assert.equal(manifest.agent_execution_policy?.local_success_is_completion, false);
  assert.equal(manifest.agent_execution_policy?.exact_candidate_scope_required, true);
  assert.equal(manifest.agent_execution_policy?.bounded_verification_required, true);
  assert.equal(manifest.agent_execution_policy?.chunk_exit_rule, "production_green_or_concrete_blocker");
  assert.equal(manifest.agent_execution_policy?.max_repaired_exact_candidates_per_chunk, 3);
  assert.equal(manifest.agent_execution_policy?.repository_wide_actions_monitoring, "forbidden");
  assert.equal(manifest.agent_execution_policy?.unbounded_status_polling, "forbidden");
  assert.equal(manifest.agent_execution_policy?.timeout_or_wedge_result, "verification_failure");
  assert.equal(manifest.agent_execution_policy?.advance_past_failed_completion_gate, "forbidden");
  assert.equal(manifest.agent_execution_policy?.scheduled_automations_without_owner_approval, "forbidden");
});

test("fire-and-forget completion policy cannot return", () => {
  for (const source of [agents, current, control, execution]) {
    assert.doesNotMatch(source, /CI\/build\/deploy\/smoke (?:runs? )?independently as a non-blocking regression signal/i);
    assert.doesNotMatch(source, /terminal_ci_boundary.*fire_and_forget/i);
  }
  assert.notEqual(manifest.agent_execution_policy?.ci_role, "non_blocking_regression_signal");
  assert.notEqual(manifest.agent_execution_policy?.terminal_ci_boundary, "fire_and_forget");
});

test("bounded liveness remains part of the closed loop", () => {
  assert.match(agents, /finite bound or timeout/i);
  assert.match(agents, /at most \*\*three repaired exact-candidate cycles\*\*/i);
  assert.match(current, /finite bound or timeout/i);
  assert.match(control, /finite status checks\/timeouts/i);
  assert.match(execution, /finite timeout or finite retry bound/i);
  assert.match(execution, /at most \*\*three repaired exact candidates\*\*/i);
  assert.equal(manifest.agent_execution_policy?.hard_timeout_required, true);
});

test("production verification waits for the exact deployed candidate", () => {
  const stamp = workflow.indexOf("Stamp exact candidate");
  const wait = workflow.indexOf("Wait for exact deployed candidate");
  const verification = workflow.indexOf("Verify deployed current Lab surface");
  assert.ok(stamp >= 0 && wait > stamp && verification > wait);
  assert.match(workflow, /deploy-sha\.txt/);
  assert.match(workflow, /wait-deployed-sha\.mjs/);
  assert.equal(manifest.coverage_policy?.exact_deployed_candidate_marker_required, true);
  assert.ok(manifest.agent_execution_policy?.completion_order?.includes("exact_candidate_propagation"));
});

test("retired Round-1 process artifacts stay retired", () => {
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

  const active = manifest.surfaces.filter((surface) => surface.state === "active");
  assert.ok(active.length > 0);
  for (const surface of active) {
    assert.ok(Array.isArray(surface.smoke) && surface.smoke.length > 0, `${surface.id} needs smoke coverage`);
    for (const check of surface.smoke) {
      assert.ok(Number.isFinite(check.timeout_seconds) && check.timeout_seconds > 0, `${surface.id} smoke needs a hard timeout`);
    }
  }
});
