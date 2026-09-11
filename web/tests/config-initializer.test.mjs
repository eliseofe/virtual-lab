import test from "node:test";
import assert from "node:assert/strict";
import { compileConfig, numericParameters } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";

const initializerSource = `def hexagon_perturbed(config, rng, place):
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

function baseConfig(method = "hexagon_perturbed", desiredDistance = 0.45, arenaSize = 10.0) {
  return compileConfig(`
SEED = 2026
N = 91
ARENA_SIZE = ${arenaSize}
INITIALIZATION_METHOD = "${method}"
INITIAL_POSITION_NOISE = 0.0
DESIRED_DISTANCE = ${desiredDistance}
U = 0.005
`);
}

test("config parser accepts arbitrary Python-style scalar assignments and aliases", () => {
  const config = compileConfig(`
N = 91
INITIALIZATION_METHOD = "random"
CUSTOM_GAIN = 0.125
ENABLED = True
U = 0.005
V0 = U
`);
  assert.equal(config.values.N, 91);
  assert.equal(config.values.INITIALIZATION_METHOD, "random");
  assert.equal(config.values.CUSTOM_GAIN, 0.125);
  assert.equal(config.values.ENABLED, true);
  assert.equal(config.values.V0, 0.005);
  assert.deepEqual(numericParameters(config), { N: 91, CUSTOM_GAIN: 0.125, U: 0.005, V0: 0.005 });
});

test("hexagonal initializer derives lattice radius and spacing from student parameters", () => {
  const first = compileInitializer(initializerSource, baseConfig("hexagon_perturbed", 0.45));
  const second = compileInitializer(initializerSource, baseConfig("hexagon_perturbed", 0.45));
  assert.equal(first.method, "hexagon_perturbed");
  assert.equal(first.state.length, 91);
  assert.deepEqual(first.state, second.state);
  assert.equal(first.state[0].x, -2.25);
  assert.equal(first.state[0].y, 0);
  assert.ok(first.state.every((agent) => Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.heading)));

  const wider = compileInitializer(initializerSource, baseConfig("hexagon_perturbed", 0.60));
  assert.notEqual(wider.state[0].x, first.state[0].x);
  assert.equal(wider.state[0].x, -3.0);
});

test("position-noise parameter perturbs the hexagonal initial condition", () => {
  const config = compileConfig(`
SEED = 2026
N = 91
ARENA_SIZE = 10.0
INITIALIZATION_METHOD = "hexagon_perturbed"
INITIAL_POSITION_NOISE = 0.05
DESIRED_DISTANCE = 0.45
`);
  const perturbed = compileInitializer(initializerSource, config);
  const perfect = compileInitializer(initializerSource, baseConfig());
  assert.notDeepEqual(perturbed.state.map(({ x, y }) => [x, y]), perfect.state.map(({ x, y }) => [x, y]));
});

test("random initializer uses arena size directly and remains seeded", () => {
  const config = baseConfig("random", 0.45, 8.0);
  const first = compileInitializer(initializerSource, config);
  const second = compileInitializer(initializerSource, config);
  assert.equal(first.method, "random");
  assert.equal(first.state.length, 91);
  assert.deepEqual(first.state, second.state);
  assert.ok(first.state.every((agent) => Math.abs(agent.x) <= 4.0 && Math.abs(agent.y) <= 4.0 && agent.heading >= 0 && agent.heading < Math.PI * 2));
});

test("initializer fails loudly when the source does not place all N agents", () => {
  const source = `def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
`;
  assert.throws(() => compileInitializer(source, baseConfig("random")), /did not place agent 1/);
});
