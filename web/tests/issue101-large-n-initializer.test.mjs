import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { compileConfig } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";
import { validateInitialStateForRuntime, validateRuntimeValues } from "../src/runtime/contract.js";

// Exact production Active Elastic initializer logic (same source in built-in and registry snapshot).
const activeElasticInitializer = `def hexagon_perturbed(config, rng, place):
    radius = ceil((sqrt(12.0 * config.N - 3.0) - 3.0) / 6.0)
    i = 0
    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            s = -q - r
            if max(abs(q), abs(r), abs(s)) <= radius:
                if i < config.N:
                    x = config.DESIRED_DISTANCE * (q + 0.5 * r)
                    y = config.DESIRED_DISTANCE * SQRT3_OVER_2 * r
                    x += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    y += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    theta = rng.uniform(0.0, TAU)
                    place(i, x, y, theta)
                    i += 1

def random_uniform(config, rng, place):
    half = config.ARENA_SIZE / 2.0
    for i in range(config.N):
        x = rng.uniform(-half, half)
        y = rng.uniform(-half, half)
        theta = rng.uniform(0.0, TAU)
        place(i, x, y, theta)

def initialize(config, rng, place):
    if config.INITIALIZATION_METHOD == "hexagon_perturbed":
        hexagon_perturbed(config, rng, place)
    elif config.INITIALIZATION_METHOD == "random":
        random_uniform(config, rng, place)
`;

function configFor(n, method, arenaSize = 1000) {
  return compileConfig(`
SEED = 2026
N = ${n}
ARENA_SIZE = ${arenaSize}
INITIALIZATION_METHOD = "${method}"
INITIAL_POSITION_NOISE = 0.0
DESIRED_DISTANCE = 0.45
CONTROL_DT = 0.1
SENSOR_NOISE = 0.1
EXPERIMENT_DURATION = 10.0
INTERACTION_RADIUS = 0.81
MAX_FORWARD_SPEED = 0.05
MAX_ANGULAR_SPEED = 1.5707963267948966
`);
}

function runtimeFor(config) {
  return validateRuntimeValues(config.values);
}

for (const n of [10_000, 100_000]) {
  for (const method of ["hexagon_perturbed", "random"]) {
    test(`#101 production initializer ${method} produces and validates N=${n}`, () => {
      const config = configFor(n, method);
      const t0 = performance.now();
      const compiled = compileInitializer(activeElasticInitializer, config);
      const compileMs = performance.now() - t0;
      const runtime = runtimeFor(config);
      const t1 = performance.now();
      validateInitialStateForRuntime(compiled.state, runtime);
      const validateMs = performance.now() - t1;
      const jsonBytes = Buffer.byteLength(JSON.stringify(compiled.state));
      assert.equal(compiled.state.length, n);
      assert.ok(compiled.state.every((agent) => Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.heading)));
      console.log(JSON.stringify({ issue: 101, n, method, compileMs, validateMs, jsonBytes }));
    });
  }
}

test("#101 too-small arena is a geometry validation failure, not a placement-count failure", () => {
  const config = configFor(10_000, "hexagon_perturbed", 10);
  const compiled = compileInitializer(activeElasticInitializer, config);
  assert.equal(compiled.state.length, 10_000);
  assert.throws(
    () => validateInitialStateForRuntime(compiled.state, runtimeFor(config)),
    /does not fit inside ARENA_SIZE/,
  );
});

test("#101 unsupported initialization method currently degrades to misleading missing-agent-0 diagnostic", () => {
  const config = configFor(10_000, "random_uniform");
  assert.throws(
    () => compileInitializer(activeElasticInitializer, config),
    /initializer did not place agent 0/,
  );
});
