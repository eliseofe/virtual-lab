import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateExperimentSources } from "../../supabase/functions/experiment-mcp/authoring.js";
import { validateRuntimeValues } from "../src/runtime/contract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");

const SIMPLE_RANDOM_WALK_FROM_OWNER_TEST = {
  config_source: `N = 50\nARENA_SIZE = 10.0\nCONTROL_DT = 0.1\nSENSOR_NOISE = 0.0\nEXPERIMENT_DURATION = 200.0\nSPEED = 0.05\n`,
  initializer_source: `def random_uniform(config, rng, place):\n    half = config.ARENA_SIZE / 2.0\n    for i in range(config.N):\n        x = rng.uniform(-half, half)\n        y = rng.uniform(-half, half)\n        theta = rng.uniform(0.0, TAU)\n        place(i, x, y, theta)\n\ndef initialize(config, rng, place):\n    random_uniform(config, rng, place)\n`,
  controller_source: `class RandomWalkAgent(Agent):\n    def step(self, obs):\n        return Motion(SPEED, 0.0)\n`,
};

test("issue #63 the genuine Grok fixture is no longer a false-positive valid experiment", () => {
  const result = validateExperimentSources(SIMPLE_RANDOM_WALK_FROM_OWNER_TEST);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].category, "runtime-parameter");
  assert.equal(result.diagnostics[0].parameter, "INTERACTION_RADIUS");
});

test("issue #63 generic runtime requirements are independent of Active Elastic parameter names", () => {
  const runtime = validateRuntimeValues({
    N: 3,
    ARENA_SIZE: 4.0,
    CONTROL_DT: 0.1,
    SENSOR_NOISE: 0.0,
    EXPERIMENT_DURATION: 5.0,
    INTERACTION_RADIUS: 1.0,
    MAX_FORWARD_SPEED: 1.0,
    MAX_ANGULAR_SPEED: 1.0,
  });

  assert.equal(runtime.version, "vlab.runtime/0.1");
  assert.equal(runtime.agentCount, 3);
  assert.equal(runtime.arenaSize, 4.0);
  assert.equal(runtime.interactionRadius, 1.0);
  assert.equal(runtime.maxForwardSpeed, 1.0);
  assert.equal(runtime.maxAngularSpeed, 1.0);
});

test("issue #63 production compileSetup consumes the shared generic runtime contract", async () => {
  const main = await readFile(path.join(web, "src", "main.js"), "utf8");
  const start = main.indexOf("function compileSetup(");
  const end = main.indexOf("function compileControllerFor", start);
  assert.ok(start >= 0 && end > start, "compileSetup must exist");
  const compileSetup = main.slice(start, end);

  assert.match(compileSetup, /validateRuntimeValues/);
  assert.match(compileSetup, /validateInitialStateForRuntime/);
  assert.match(compileSetup, /simulationSetupFromRuntime/);

  for (const forbidden of [
    "K1",
    "K2",
    "POTENTIAL_ALPHA",
    "POTENTIAL_EPSILON",
    "DESIRED_DISTANCE",
    "PROXIMAL_RANGE",
    "INITIAL_POSITION_NOISE",
  ]) {
    assert.equal(compileSetup.includes(forbidden), false, `generic compileSetup still requires experiment-specific key ${forbidden}`);
  }
});

test("issue #63 legacy Active Elastic compatibility stays browser-local and outside MCP contract", async () => {
  const main = await readFile(path.join(web, "src", "main.js"), "utf8");
  const authoring = await readFile(path.join(web, "..", "supabase", "functions", "experiment-mcp", "authoring.js"), "utf8");
  const runtimeVendor = await readFile(path.join(web, "..", "supabase", "functions", "experiment-mcp", "vendor", "runtime-contract.js"), "utf8");

  assert.match(main, /runtimeValuesForCurrentBuiltIn/);
  assert.equal(authoring.includes("PROXIMAL_RANGE"), false);
  assert.equal(authoring.includes("POTENTIAL_ALPHA"), false);
  assert.equal(runtimeVendor.includes("PROXIMAL_RANGE"), false);
  assert.equal(runtimeVendor.includes("POTENTIAL_ALPHA"), false);
});
