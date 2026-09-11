import test from "node:test";
import assert from "node:assert/strict";
import { compileConfig, numericParameters } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";

const initializerSource = `def hexagon_perturbed(config, rng, place):
    radius = config.HEX_RADIUS
    i = 0
    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            s = -q - r
            if max(abs(q), abs(r), abs(s)) <= radius:
                if i < config.N:
                    x = config.HEX_SPACING * (q + 0.5 * r)
                    y = config.HEX_SPACING * SQRT3_OVER_2 * r
                    x += rng.uniform(-config.HEX_POSITION_JITTER, config.HEX_POSITION_JITTER)
                    y += rng.uniform(-config.HEX_POSITION_JITTER, config.HEX_POSITION_JITTER)
                    theta = rng.uniform(0.0, TAU)
                    place(i, x, y, theta)
                    i += 1

def random_uniform(config, rng, place):
    for i in range(config.N):
        x = rng.uniform(-config.RANDOM_EXTENT, config.RANDOM_EXTENT)
        y = rng.uniform(-config.RANDOM_EXTENT, config.RANDOM_EXTENT)
        theta = rng.uniform(0.0, TAU)
        place(i, x, y, theta)

def initialize(config, rng, place):
    if config.INITIALIZATION_METHOD == "hexagon_perturbed":
        hexagon_perturbed(config, rng, place)
    elif config.INITIALIZATION_METHOD == "random":
        random_uniform(config, rng, place)
`;

function baseConfig(method = "hexagon_perturbed") {
  return compileConfig(`
SEED = 2026
N = 91
INITIALIZATION_METHOD = "${method}"
HEX_RADIUS = 5
HEX_SPACING = 0.65
HEX_POSITION_JITTER = 0.0
RANDOM_EXTENT = 2.0
U = 0.005
V0 = U
`);
}

test("config parser accepts arbitrary Python-style scalar assignments and aliases", () => {
  const config = compileConfig(`
# arbitrary namespace
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

test("hexagonal initializer source calculates and places every configured agent", () => {
  const first = compileInitializer(initializerSource, baseConfig("hexagon_perturbed"));
  const second = compileInitializer(initializerSource, baseConfig("hexagon_perturbed"));
  assert.equal(first.method, "hexagon_perturbed");
  assert.equal(first.state.length, 91);
  assert.deepEqual(first.state, second.state);
  assert.equal(first.state[0].x, -3.25);
  assert.equal(first.state[0].y, 0);
  assert.ok(first.state.every((agent) => Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.heading)));
});

test("random initializer source calculates deterministic seeded positions inside the configured extent", () => {
  const config = baseConfig("random");
  const first = compileInitializer(initializerSource, config);
  const second = compileInitializer(initializerSource, config);
  assert.equal(first.method, "random");
  assert.equal(first.state.length, 91);
  assert.deepEqual(first.state, second.state);
  assert.ok(first.state.every((agent) => Math.abs(agent.x) <= 2.0 && Math.abs(agent.y) <= 2.0 && agent.heading >= 0 && agent.heading < Math.PI * 2));
});

test("initializer fails loudly when the source does not place all N agents", () => {
  const source = `def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
`;
  assert.throws(() => compileInitializer(source, baseConfig("random")), /did not place agent 1/);
});
