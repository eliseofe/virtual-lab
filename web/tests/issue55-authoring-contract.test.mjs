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
const functionDir = path.join(repo, "supabase", "functions", "experiment-mcp");

async function text(relative) {
  return readFile(path.join(repo, relative), "utf8");
}

test("issue #55 edge validator vendors the exact production compilers", async () => {
  for (const [production, vendored] of [
    ["web/src/config/compiler.js", "supabase/functions/experiment-mcp/vendor/config-compiler.js"],
    ["web/src/initializer/compiler.js", "supabase/functions/experiment-mcp/vendor/initializer-compiler.js"],
    ["web/src/controller/compiler.js", "supabase/functions/experiment-mcp/vendor/controller-compiler.js"],
  ]) {
    assert.equal(await text(vendored), await text(production), `${vendored} must remain byte-identical to ${production}`);
  }
});

test("issue #55 contract reference example is mechanically identical to production built-in sources", async () => {
  const main = await readFile(path.join(web, "src", "main.js"), "utf8");
  const extract = (name) => {
    const match = main.match(new RegExp(`const ${name} = \\`([\\s\\S]*?)\\`;`));
    assert.ok(match, `could not extract ${name} from production main.js`);
    return match[1];
  };

  const reference = AUTHORING_CONTRACT.reference_examples.active_elastic_current;
  assert.equal(reference.config_source, extract("defaultConfigSource"));
  assert.equal(reference.initializer_source, extract("defaultInitializerSource"));
  assert.equal(reference.controller_source, extract("referenceSource"));
});

test("issue #55 production reference validates without running a simulation", () => {
  const reference = AUTHORING_CONTRACT.reference_examples.active_elastic_current;
  const result = validateExperimentSources(reference);
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
  assert.equal(result.contract_version, "vlab.authoring/0.1");
  assert.equal(result.compiled.configuration, "vlab.config/0.2");
  assert.equal(result.compiled.initializer, "vlab.initializer-state/0.2");
  assert.equal(result.compiled.controller_language, "python-vlab/0.1");
  assert.equal(result.compiled.controller_ir_schema, "vlab.controller-ir/0.1");
});

test("issue #55 invalid runtime configuration is rejected with structured diagnostics", () => {
  const reference = AUTHORING_CONTRACT.reference_examples.active_elastic_current;
  const result = validateExperimentSources({
    ...reference,
    config_source: reference.config_source.replace("N = 91", "N = 0"),
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].artifact, "configuration");
  assert.equal(result.diagnostics[0].category, "runtime-parameter");
  assert.match(result.diagnostics[0].message, /N must be positive/);
});

test("issue #55 unsupported controller observation is an explicit capability diagnostic", () => {
  const reference = AUTHORING_CONTRACT.reference_examples.active_elastic_current;
  const result = validateExperimentSources({
    ...reference,
    controller_source: `class Probe(Agent):\n    def step(self, obs):\n        x = obs.global_positions\n        return Motion(0.0, 0.0)\n`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].artifact, "controller");
  assert.equal(result.diagnostics[0].category, "unsupported-capability");
  assert.equal(result.diagnostics[0].compiler_category, "invalid-observation-field");
  assert.ok(Number.isInteger(result.diagnostics[0].line));
});

test("issue #55 forbidden controller host access remains forbidden", () => {
  const reference = AUTHORING_CONTRACT.reference_examples.active_elastic_current;
  const result = validateExperimentSources({
    ...reference,
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
