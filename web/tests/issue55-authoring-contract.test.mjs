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
  config_source: `N = 2\nGAIN = 0.5\n`,
  initializer_source: `def initialize(config, rng, place):\n    place(0, 0.0, 0.0, 0.0)\n    place(1, 1.0, 0.0, 0.0)\n`,
  controller_source: `class Probe(Agent):\n    def step(self, obs):\n        return Motion(GAIN, 0.0)\n`,
};

test("issue #55 edge validator vendors the exact production compilers", async () => {
  for (const [production, vendored] of [
    ["web/src/config/compiler.js", "supabase/functions/experiment-mcp/vendor/config-compiler.js"],
    ["web/src/initializer/compiler.js", "supabase/functions/experiment-mcp/vendor/initializer-compiler.js"],
    ["web/src/controller/compiler.js", "supabase/functions/experiment-mcp/vendor/controller-compiler.js"],
  ]) {
    assert.equal(await text(vendored), await text(production), `${vendored} must remain byte-identical to ${production}`);
  }
});

test("issue #55 contract contains software interface only, not a scientific reference experiment", () => {
  assert.equal(AUTHORING_CONTRACT.contract_version, "vlab.authoring/0.2");
  assert.equal(AUTHORING_CONTRACT.content_policy.includes_scientific_models, false);
  assert.equal(AUTHORING_CONTRACT.content_policy.includes_reference_experiments, false);
  assert.equal(Object.prototype.hasOwnProperty.call(AUTHORING_CONTRACT, "reference_examples"), false);

  const serialized = JSON.stringify(AUTHORING_CONTRACT);
  for (const forbidden of [
    "Active Elastic",
    "ActiveElastic",
    "POTENTIAL_ALPHA",
    "POTENTIAL_EPSILON",
    "DESIRED_DISTANCE",
    "PROXIMAL_RANGE",
    "INITIAL_POSITION_NOISE",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `authoring contract leaked experiment-specific content: ${forbidden}`);
  }
});

test("issue #55 a generic experiment with arbitrary parameter names validates", () => {
  const result = validateExperimentSources(SOFTWARE_FIXTURE);
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
  assert.equal(result.contract_version, "vlab.authoring/0.2");
  assert.equal(result.compiled.configuration, "vlab.config/0.2");
  assert.equal(result.compiled.initializer, "vlab.initializer-state/0.2");
  assert.equal(result.compiled.controller_language, "python-vlab/0.1");
  assert.equal(result.compiled.controller_ir_schema, "vlab.controller-ir/0.1");
});

test("issue #55 only structural initializer requirements are enforced by validation", () => {
  const result = validateExperimentSources({
    ...SOFTWARE_FIXTURE,
    config_source: `N = 0\nGAIN = 0.5\n`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].artifact, "initializer");
  assert.match(result.diagnostics[0].message, /N must be a positive integer/);
});

test("issue #55 unsupported controller observation is an explicit capability diagnostic", () => {
  const result = validateExperimentSources({
    ...SOFTWARE_FIXTURE,
    controller_source: `class Probe(Agent):\n    def step(self, obs):\n        x = obs.global_positions\n        return Motion(0.0, 0.0)\n`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].artifact, "controller");
  assert.equal(result.diagnostics[0].category, "unsupported-capability");
  assert.equal(result.diagnostics[0].compiler_category, "invalid-observation-field");
  assert.ok(Number.isInteger(result.diagnostics[0].line));
});

test("issue #55 forbidden controller host access remains forbidden", () => {
  const result = validateExperimentSources({
    ...SOFTWARE_FIXTURE,
    controller_source: `class Probe(Agent):\n    def step(self, obs):\n        x = network\n        return Motion(0.0, 0.0)\n`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].category, "forbidden-capability");
});

test("issue #55 contract exposes extensible capability classes and no execution path", () => {
  assert.ok(AUTHORING_CONTRACT.capability_model.observations.length >= 1);
  assert.ok(AUTHORING_CONTRACT.capability_model.actions.length >= 1);
  assert.ok(AUTHORING_CONTRACT.capability_model.intrinsics.length >= 1);
  assert.equal(AUTHORING_CONTRACT.execution_boundary.validator_runs_simulation, false);
  assert.equal(AUTHORING_CONTRACT.execution_boundary.ai_can_run_simulation, false);
  assert.equal(AUTHORING_CONTRACT.execution_boundary.ai_can_observe_results, false);
  assert.equal(AUTHORING_CONTRACT.execution_boundary.ai_can_modify_simulator, false);
});
