import assert from "node:assert/strict";
import test from "node:test";

import { AUTHORING_CONTRACT } from "../../supabase/functions/experiment-mcp/authoring.js";

test("#125/#196 authoring contract names the four required core artifacts", () => {
  assert.deepEqual(AUTHORING_CONTRACT.artifact_collection.required_core_ids, [
    "configuration",
    "initialization",
    "controller",
    "metrics",
  ]);

  const capabilities = AUTHORING_CONTRACT.artifact_execution;
  assert.equal(capabilities.version, "vlab.artifact-execution/1");
  assert.deepEqual(capabilities.lifecycle_hooks, ["setup", "initialize", "control", "measure", "finalize"]);
  assert.deepEqual(capabilities.required_core.map(({ id }) => id), [
    "configuration",
    "initialization",
    "controller",
    "metrics",
  ]);
});

test("#125/#196 core artifact execution semantics are explicit rather than inferred", () => {
  const byId = new Map(AUTHORING_CONTRACT.artifact_execution.required_core.map((entry) => [entry.id, entry]));

  assert.equal(byId.get("configuration").behavior, "declarative");
  assert.equal(byId.get("configuration").execution_hook, null);

  assert.equal(byId.get("initialization").behavior, "executable");
  assert.equal(byId.get("initialization").execution_hook, "initialize");
  assert.equal(byId.get("initialization").cadence, "once-per-fresh-run");

  assert.equal(byId.get("controller").behavior, "executable");
  assert.equal(byId.get("controller").execution_hook, "control");
  assert.equal(byId.get("controller").execution_scope, "agent");
  assert.equal(byId.get("controller").cadence, "CONTROL_DT");

  assert.equal(byId.get("metrics").behavior, "read-only-executable-observer");
  assert.equal(byId.get("metrics").execution_hook, "measure");
  assert.equal(byId.get("metrics").empty_content_valid, true);
  assert.equal(byId.get("metrics").measurement_phase, "post-physics-wrapped-state/1");
});

test("#125/#196 optional artifacts remain passive and Metrics does not consume optional execution", () => {
  const capabilities = AUTHORING_CONTRACT.artifact_execution;

  assert.equal(capabilities.optional_passive.allowed, true);
  assert.ok(capabilities.optional_passive.generic_browser_formats.includes("text/plain"));
  assert.ok(capabilities.optional_passive.generic_browser_formats.includes("text/markdown"));
  assert.ok(capabilities.optional_passive.generic_browser_formats.includes("python-vlab-metrics/0.1"));
  assert.match(capabilities.optional_passive.execution_policy, /passive unless/i);

  assert.deepEqual(capabilities.optional_executable.registered_types, []);
  assert.equal(capabilities.optional_executable.unsupported_request_class, "artifact_workflow");
  assert.match(capabilities.optional_executable.execution_policy, /Metrics is a required core artifact/i);

  assert.equal(capabilities.optional_executable.registered_types.includes("world"), false);
  assert.equal(capabilities.optional_executable.registered_types.includes("control_parameters"), false);
});
