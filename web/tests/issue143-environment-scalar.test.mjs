import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileConfig } from "../src/config/compiler.js";
import { compileController } from "../src/controller/compiler.js";
import {
  compileEnvironmentScalar,
  validateEnvironmentControllerPair,
} from "../src/environment/compiler.js";
import { registryExperimentRunnability } from "../src/experiment-validation.js";
import { RUNTIME_CONTRACT } from "../src/runtime/contract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const repo = path.resolve(web, "..");

const configSource = `N = 1
ARENA_SIZE = 10.0
CONTROL_DT = 0.1
SENSOR_NOISE = 0.0
EXPERIMENT_DURATION = 10.0
INTERACTION_RADIUS = 1.0
MAX_FORWARD_SPEED = 10.0
MAX_ANGULAR_SPEED = 2.0
FIELD_OFFSET = 0.25
`;

const initializerWithField = `def environmental_scalar(x, y, config):
    return x + 2.0 * y + config.FIELD_OFFSET

def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
`;

const initializerWithoutField = `def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
`;

const controllerWithField = `class ScalarAgent(Agent):
    def step(self, obs):
        return Motion(obs.environmental_scalar, 0.0)
`;

function experiment(initializerSource = initializerWithField) {
  return {
    config_source: configSource,
    initializer_source: initializerSource,
    controller_source: controllerWithField,
  };
}

test("Initialization can define one generic static scalar Environment field", () => {
  const config = compileConfig(configSource);
  const environment = compileEnvironmentScalar(initializerWithField, config);
  assert.equal(environment.schema, "vlab.environment-scalar-ir/0.1");
  assert.equal(environment.entry, "environmental_scalar(x, y, config)");
  assert.deepEqual(environment.expression, {
    kind: "binary",
    op: "+",
    left: {
      kind: "binary",
      op: "+",
      left: { kind: "x" },
      right: { kind: "binary", op: "*", left: { kind: "const", value: 2 }, right: { kind: "y" } },
    },
    right: { kind: "const", value: 0.25 },
  });
  assert.equal(compileEnvironmentScalar(initializerWithoutField, config), null);
});

test("controller accepts only the published local scalar observation field", () => {
  const controller = compileController(controllerWithField);
  assert.doesNotThrow(() => validateEnvironmentControllerPair({ schema: "vlab.environment-scalar-ir/0.1" }, controller));
  assert.throws(() => validateEnvironmentControllerPair(null, controller), /controller reads obs\.environmental_scalar but Initialization does not define environmental_scalar/);
  assert.throws(() => compileController(`class Bad(Agent):\n    def step(self, obs):\n        return Motion(obs.position, 0.0)\n`), /unknown observation field 'obs.position'/);
});

test("registry validation accepts a scalar field experiment and rejects the missing-field pair", () => {
  assert.equal(registryExperimentRunnability(experiment()).runnable, true);
  const missing = registryExperimentRunnability(experiment(initializerWithoutField));
  assert.equal(missing.runnable, false);
  assert.match(missing.error, /environmental_scalar/);
});

test("Environment remains a capability of Initialization; Metrics is the independent fourth core artifact", () => {
  assert.deepEqual(
    RUNTIME_CONTRACT.artifact_capabilities.required_core.map(({ id }) => id),
    ["configuration", "initialization", "controller", "metrics"],
  );
  assert.equal(RUNTIME_CONTRACT.environment_capabilities.static_scalar_field.definition_location, "initialization");
  assert.equal(RUNTIME_CONTRACT.environment_capabilities.static_scalar_field.observation, "obs.environmental_scalar");
  const metrics = RUNTIME_CONTRACT.artifact_capabilities.required_core.find(({ id }) => id === "metrics");
  assert.equal(metrics.execution_hook, "measure");
});

test("browser rendering samples the same WASM Environment runtime rather than a second field evaluator", async () => {
  const worker = await readFile(path.join(web, "src/worker.js"), "utf8");
  const main = await readFile(path.join(web, "src/main.js"), "utf8");
  assert.match(worker, /simulation\.sample_environment_grid\(ENVIRONMENT_GRID_RESOLUTION\)/);
  assert.match(worker, /type: "environment"/);
  assert.match(main, /message\.type === "environment"/);
  assert.match(main, /context\.drawImage\(environmentGridImage/);
});

test("MCP uses the exact browser capability compiler/runtime sources", async () => {
  const pairs = [
    ["web/src/environment/compiler.js", "supabase/functions/experiment-mcp/vendor/environment-compiler.js"],
    ["web/src/controller/compiler.js", "supabase/functions/experiment-mcp/vendor/controller-compiler.js"],
    ["web/src/runtime/contract.js", "supabase/functions/experiment-mcp/vendor/runtime-contract.js"],
  ];
  for (const [browserPath, mcpPath] of pairs) {
    const [browser, mcp] = await Promise.all([
      readFile(path.join(repo, browserPath), "utf8"),
      readFile(path.join(repo, mcpPath), "utf8"),
    ]);
    assert.equal(mcp, browser, `${mcpPath} drifted from ${browserPath}`);
  }
});
