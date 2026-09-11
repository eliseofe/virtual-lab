import test from "node:test";
import assert from "node:assert/strict";
import { compileConfig, numericParameters } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";

test("config parser accepts arbitrary Python-style scalar assignments", () => {
  const config = compileConfig(`
# arbitrary namespace
N = 91
INITIALIZATION_METHOD = "random"
CUSTOM_GAIN = 0.125
ENABLED = True
`);
  assert.equal(config.values.N, 91);
  assert.equal(config.values.INITIALIZATION_METHOD, "random");
  assert.equal(config.values.CUSTOM_GAIN, 0.125);
  assert.equal(config.values.ENABLED, true);
  assert.deepEqual(numericParameters(config), { N: 91, CUSTOM_GAIN: 0.125 });
});

test("initializer selection is driven by config rather than hard-coded UI fields", () => {
  const source = `def initialize(config):
    if config.INITIALIZATION_METHOD == "hexagon_perturbed":
        return HexagonPerturbed(config.HEX_SPACING, config.HEX_POSITION_JITTER)
    if config.INITIALIZATION_METHOD == "random":
        return RandomUniform(config.RANDOM_EXTENT)
`;
  const hex = compileInitializer(source, compileConfig(`
INITIALIZATION_METHOD = "hexagon_perturbed"
HEX_SPACING = 0.65
HEX_POSITION_JITTER = 0.03
RANDOM_EXTENT = 2.0
`));
  assert.deepEqual(hex, {
    version: "vlab.initializer-ir/0.1",
    method: "hexagon_perturbed",
    spacing: 0.65,
    jitter: 0.03,
  });

  const random = compileInitializer(source, compileConfig(`
INITIALIZATION_METHOD = "random"
HEX_SPACING = 0.65
HEX_POSITION_JITTER = 0.03
RANDOM_EXTENT = 3.0
`));
  assert.deepEqual(random, {
    version: "vlab.initializer-ir/0.1",
    method: "random_uniform",
    extent: 3.0,
  });
});

test("initializer compiler rejects a config method without a source branch", () => {
  assert.throws(() => compileInitializer(`def initialize(config):
    if config.INITIALIZATION_METHOD == "random":
        return RandomUniform(config.RANDOM_EXTENT)
`, compileConfig(`
INITIALIZATION_METHOD = "other"
RANDOM_EXTENT = 2.0
`)), /no initializer branch matches/);
});
