import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AUTHORING_CONTRACT,
  validateExperimentSources,
} from "../../supabase/functions/experiment-mcp/authoring.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const repo = path.resolve(web, "..");

async function text(relative) {
  return readFile(path.join(repo, relative), "utf8");
}

const SOFTWARE_FIXTURE = {
  config_source: `N = 2\nARENA_SIZE = 10.0\nCONTROL_DT = 0.1\nSENSOR_NOISE = 0.0\nEXPERIMENT_DURATION = 1.0\nINTERACTION_RADIUS = 2.0\nMAX_FORWARD_SPEED = 1.0\nMAX_ANGULAR_SPEED = 1.0\nGAIN = 0.5\n`,
  initializer_source: `def initialize(config, rng, place):\n    place(0, 0.0, 0.0, 0.0)\n    place(1, 1.0, 0.0, 0.0)\n`,
  controller_source: `class Probe(Agent):\n    def step(self, obs):\n        return Motion(GAIN, 0.0)\n`,
  metrics_source: "",
};

test("issue #55/#63/#196 edge validator vendors the exact production compilers and runtime contract", async () => {
  for (const [production, vendored] of [
    ["web/src/config/compiler.js", "supabase/functions/experiment-mcp/vendor/config-compiler.js"],
    ["web/src/initializer/compiler.js", "supabase/functions/experiment-mcp/vendor/initializer-compiler.js"],
    ["web/src/controller/compiler.js", "supabase/functions/experiment-mcp/vendor/controller-compiler.js"],
    ["web/src/runtime/contract.js", "supabase/functions/experiment-mcp/vendor/runtime-contract.js"],
  ]) {
    assert.equal(await text(vendored), await text(production), `${vendored} must remain byte-identical to ${production}`);
  }
});

test("issue #55/#196 contract contains software interface only, not a scientific reference experiment", () => {
  assert.equal(AUTHORING_CONTRACT.contract_version, "vlab.authoring/0.13");
  assert.equal(AUTHORING_CONTRACT.experiment_interface_version, "9");
  assert.equal(AUTHORING_CONTRACT.experiment_artifact_interface, "vlab.experiment-artifacts/3");
  assert.equal(AUTHORING_CONTRACT.runtime_contract.version, "vlab.runtime/0.2");
  assert.equal(AUTHORING_CONTRACT.content_policy.includes_scientific_models, false);
  assert.equal(AUTHORING_CONTRACT.content_policy.includes_reference_experiments, false);
  assert.equal(Object.prototype.hasOwnProperty.call(AUTHORING_CONTRACT, "reference_examples"), false);

  const serialized = JSON.stringify(AUTHORING_CONTRACT);
  for (const required of ["N", "CONTROL_DT", "EXPERIMENT_DURATION", "python-vlab-metrics/0.1"]) {
    assert.equal(serialized.includes(required), true, `authoring contract omitted stable language/runtime requirement: ${required}`);
  }
  for (const capabilityOwned of ["INTERACTION_RADIUS", "MAX_FORWARD_SPEED", "MAX_ANGULAR_SPEED", "obs.heading", "obs.neighbours", "rng.uniform"]) {
    assert.equal(serialized.includes(capabilityOwned), false, `authoring contract leaked capability-owned surface: ${capabilityOwned}`);
  }
  for (const forbidden of [
    "Active Elastic", "ActiveElastic", "POTENTIAL_ALPHA", "POTENTIAL_EPSILON", "DESIRED_DISTANCE",
    "PROXIMAL_RANGE", "INITIAL_POSITION_NOISE", "K1", "K2",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `authoring contract leaked experiment-specific content: ${forbidden}`);
  }
});

test("issue #55/#63/#196 a generic experiment with arbitrary scientific parameter names and empty Metrics validates", () => {
  const result = validateExperimentSources(SOFTWARE_FIXTURE);
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
  assert.equal(result.contract_version, "vlab.authoring/0.13");
  assert.equal(result.compiled.configuration, "vlab.config/0.2");
  assert.equal(result.compiled.initializer, "vlab.initializer-state/0.4");
  assert.equal(result.compiled.controller_language, "python-vlab/0.1");
  assert.equal(result.compiled.controller_ir_schema, "vlab.controller-ir/0.1");
  assert.equal(result.compiled.metrics_language, "python-vlab-metrics/0.1");
  assert.equal(result.compiled.metrics_ir_schema, "vlab.metrics-ir/0.1");
  assert.equal(result.compiled.metric_count, 0);
  assert.equal(result.compiled.runtime_contract, "vlab.runtime/0.2");
});

test("issue #63 missing generic runtime configuration is rejected before persistence", () => {
  const result = validateExperimentSources({ ...SOFTWARE_FIXTURE, config_source: SOFTWARE_FIXTURE.config_source.replace("INTERACTION_RADIUS = 2.0\n", "") });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].artifact, "configuration");
  assert.equal(result.diagnostics[0].category, "runtime-parameter");
  assert.equal(result.diagnostics[0].parameter, "INTERACTION_RADIUS");
  assert.match(result.diagnostics[0].message, /INTERACTION_RADIUS must be numeric/);
});

test("issue #63 initializer state must fit the same runtime arena used by production", () => {
  const result = validateExperimentSources({ ...SOFTWARE_FIXTURE, config_source: SOFTWARE_FIXTURE.config_source.replace("ARENA_SIZE = 10.0", "ARENA_SIZE = 1.0") });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].artifact, "initializer");
  assert.equal(result.diagnostics[0].category, "runtime-parameter");
  assert.equal(result.diagnostics[0].parameter, "ARENA_SIZE");
  assert.match(result.diagnostics[0].message, /does not fit inside ARENA_SIZE/);
});

test("issue #55 unsupported controller observation is an explicit capability diagnostic", () => {
  const result = validateExperimentSources({ ...SOFTWARE_FIXTURE, controller_source: `class Probe(Agent):\n    def step(self, obs):\n        x = obs.global_positions\n        return Motion(0.0, 0.0)\n` });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].artifact, "controller");
  assert.equal(result.diagnostics[0].category, "invalid-observation-field");
  assert.equal(result.diagnostics[0].diagnostic_class, "semantic_capability");
  assert.equal(result.diagnostics[0].request_class, "semantic_capability");
  assert.equal(result.diagnostics[0].compiler_category, "invalid-observation-field");
  assert.ok(Number.isInteger(result.diagnostics[0].line));
});

test("issue #55 forbidden controller host access remains forbidden", () => {
  const result = validateExperimentSources({ ...SOFTWARE_FIXTURE, controller_source: `class Probe(Agent):\n    def step(self, obs):\n        x = network\n        return Motion(0.0, 0.0)\n` });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].category, "forbidden-capability");
});

test("issue #55/#196 contract is capability-inventory free and exposes no AI execution path", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(AUTHORING_CONTRACT, "canonical_capability_bindings"), false);
  assert.equal(AUTHORING_CONTRACT.capability_resolution.authority, "capability_registry");
  assert.equal(AUTHORING_CONTRACT.capability_resolution.unregistered_surface_policy, "reject");
  assert.equal(AUTHORING_CONTRACT.capability_resolution.candidate_surface_policy, "not_authorable");
  assert.equal(AUTHORING_CONTRACT.execution_boundary.validator_runs_simulation, false);
  assert.equal(AUTHORING_CONTRACT.execution_boundary.ai_can_run_simulation, false);
  assert.equal(AUTHORING_CONTRACT.execution_boundary.ai_can_observe_results, false);
  assert.equal(AUTHORING_CONTRACT.execution_boundary.ai_can_modify_simulator, false);
});
