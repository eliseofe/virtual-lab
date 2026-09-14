import assert from "node:assert/strict";
import test from "node:test";

import { AUTHORING_CONTRACT } from "../../supabase/functions/experiment-mcp/authoring.js";

test("#125 authoring contract names the required core artifact interface", () => {
  assert.deepEqual(AUTHORING_CONTRACT.artifact_collection.required_core_ids, [
    "configuration",
    "initialization",
    "controller",
  ]);

  const capabilities = AUTHORING_CONTRACT.runtime_contract.artifact_capabilities;
  assert.equal(capabilities.version, "vlab.artifact-capabilities/0.1");
  assert.deepEqual(capabilities.lifecycle_hooks, ["setup", "initialize", "control", "finalize"]);
  assert.deepEqual(capabilities.required_core.map(({ id }) => id), [
    "configuration",
    "initialization",
    "controller",
  ]);
});

test("#125 core artifact execution semantics are explicit rather than inferred", () => {
  const byId = new Map(AUTHORING_CONTRACT.runtime_contract.artifact_capabilities.required_core.map((entry) => [entry.id, entry]));

  assert.equal(byId.get("configuration").behavior, "declarative");
  assert.equal(byId.get("configuration").execution_hook, null);

  assert.equal(byId.get("initialization").behavior, "executable");
  assert.equal(byId.get("initialization").execution_hook, "initialize");
  assert.equal(byId.get("initialization").cadence, "once-per-fresh-run");

  assert.equal(byId.get("controller").behavior, "executable");
  assert.equal(byId.get("controller").execution_hook, "control");
  assert.equal(byId.get("controller").execution_scope, "agent");
  assert.equal(byId.get("controller").cadence, "CONTROL_DT");
});

test("#125 optional artifacts are representable but optional execution is currently unavailable", () => {
  const capabilities = AUTHORING_CONTRACT.runtime_contract.artifact_capabilities;

  assert.equal(capabilities.optional_passive.allowed, true);
  assert.ok(capabilities.optional_passive.generic_browser_formats.includes("text/plain"));
  assert.ok(capabilities.optional_passive.generic_browser_formats.includes("text/markdown"));
  assert.match(capabilities.optional_passive.execution_policy, /passive unless/i);

  assert.deepEqual(capabilities.optional_executable.registered_types, []);
  assert.equal(capabilities.optional_executable.unsupported_request, "unsupported-capability");
  assert.match(capabilities.optional_executable.execution_policy, /never executed by inference/i);

  assert.equal(capabilities.optional_executable.registered_types.includes("world"), false);
  assert.equal(capabilities.optional_executable.registered_types.includes("control_parameters"), false);
});
