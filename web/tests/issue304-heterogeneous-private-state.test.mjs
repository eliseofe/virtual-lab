// Heterogeneous private state at initialization (#304), now declared as roles
// (#577, D-022): an exact composition declared by the experimenter; no one sets
// state on an individual robot. Browser and MCP compilers must agree.

import assert from "node:assert/strict";
import test from "node:test";

import {
  compileInitializer as compileBrowserInitializer,
  validateInitializerControllerPrivateState as validateBrowserPrivateState,
} from "../src/initializer/compiler.js";
import { compileController as compileBrowserController } from "../src/controller/compiler.js";
import {
  compileInitializer as compileEdgeInitializer,
  validateInitializerControllerPrivateState as validateEdgePrivateState,
} from "../../supabase/functions/experiment-mcp/vendor/initializer-compiler.js";
import { compileController as compileEdgeController } from "../../supabase/functions/experiment-mcp/vendor/controller-compiler.js";
import { validateExperimentSources } from "../../supabase/functions/experiment-mcp/authoring.js";

const config = { values: { N: 3, SEED: 42, RHO: 2 / 3 } };
const bigConfig = { values: { N: 100, SEED: 42, RHO: 0.1 } };

// Explicit placement reproduces a fixed assignment exactly.
const initializerSource = `def initialize(config, rng, place):
    role("lead", count=2, placement="explicit", role=1.0)
    role("other", rest=True, placement="explicit")
    for i in range(config.N):
        if i < 2:
            place(i, i * 1.0, 0.0, 0.0, role="lead")
        else:
            place(i, i * 1.0, 0.0, 0.0, role="other")
`;

const controllerSource = `class HeterogeneousAgent(Agent):
    role = 0.0

    def step(self, obs):
        return Motion(self.role, 0.0)
`;

const both = (source, cfg = config) => {
  const browser = compileBrowserInitializer(source, cfg);
  assert.deepEqual(compileEdgeInitializer(source, cfg), browser);
  return browser;
};
const rejectedBoth = (source, pattern, cfg = config) => {
  assert.throws(() => compileBrowserInitializer(source, cfg), pattern);
  assert.throws(() => compileEdgeInitializer(source, cfg), pattern);
};
const scatter = "    for i in range(config.N):\n        place(i, rng.uniform(-1.0, 1.0), rng.uniform(-1.0, 1.0), 0.0)\n";

test("#577 explicit roles assign each role's starting state to its members", () => {
  const initializer = both(initializerSource);
  assert.equal(initializer.version, "vlab.initializer-state/0.4");
  assert.deepEqual(initializer.state, [
    { x: 0, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 1, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 2, y: 0, heading: 0 },
  ]);
  assert.deepEqual(initializer.roles, [
    { name: "lead", count: 2, placement: "explicit" },
    { name: "other", count: 1, placement: "explicit" },
  ]);
  const controller = compileBrowserController(controllerSource, { parameters: {} });
  assert.deepEqual(compileEdgeController(controllerSource, { parameters: {} }), controller);
  validateBrowserPrivateState(initializer, controller);
  validateEdgePrivateState(initializer, controller);
});

test("#577 a fraction gives an exact count in every run; only which robots vary with the seed", () => {
  const source = `def initialize(config, rng, place):\n    role("informed", fraction=config.RHO, informed=1.0)\n    role("uninformed", rest=True, informed=0.0)\n${scatter}`;
  const informed = (seed) => both(source, { values: { ...bigConfig.values, SEED: seed } }).state.filter((agent) => agent.private_state.informed === 1).length;
  assert.deepEqual([1, 2, 3, 4, 5].map(informed), [10, 10, 10, 10, 10]);
  const members = (seed) => both(source, { values: { ...bigConfig.values, SEED: seed } }).state.map((agent) => agent.private_state.informed).join("");
  assert.notEqual(members(1), members(2), "the deal depends on the seed");
  assert.equal(members(3), members(3), "and is reproducible");
});

test("#577 dealing roles does not shift placement draws", () => {
  const withRoles = both(`def initialize(config, rng, place):\n    role("a", fraction=0.5, a=1.0)\n    role("b", rest=True)\n${scatter}`, bigConfig);
  const without = both(`def initialize(config, rng, place):\n${scatter}`, bigConfig);
  assert.deepEqual(withRoles.state.map(({ x, y }) => [x, y]), without.state.map(({ x, y }) => [x, y]));
});

test("#577 compositions that do not add up, or misplaced roles, are rejected with the numbers", () => {
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", count=2)\n${scatter}`, /roles account for 2 robots but N is 3; mark one role rest=True/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", count=5)\n    role("b", rest=True)\n${scatter}`, /roles ask for 5 robots but N is 3/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", count=1, placement="explicit")\n    role("b", rest=True)\n${scatter}`, /role 'a' has 1 members but 0 were placed with role="a"/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", count=1)\n    role("b", rest=True)\n    place(0, 0.0, 0.0, 0.0, role="a")\n    place(1, 0.0, 0.0, 0.0)\n    place(2, 0.0, 0.0, 0.0)\n`, /role 'a' is dealt at random/);
  rejectedBoth(`def initialize(config, rng, place):\n${scatter}    role("late", rest=True)\n`, /declare every role before the first place/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", fraction=1.5)\n${scatter}`, /fraction must be between 0 and 1/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", rest=True)\n    role("b", rest=True)\n${scatter}`, /only one role may be rest=True/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", count=1, fraction=0.5)\n${scatter}`, /needs exactly one of fraction=, count= or rest=True/);
});

test("#577 set_agent_state is retired, and role state is type-checked", () => {
  rejectedBoth(`def initialize(config, rng, place):\n${scatter}    set_agent_state(0, "role", 1.0)\n`, /set_agent_state was retired/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", rest=True, informed="yes")\n${scatter}`, /role keyword 'informed' must be scalar, got string/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", rest=True)\n    for i in range(config.N):\n        place(i, 0.0, 0.0, 0.0, heading=1.0)\n`, /place does not take keyword argument 'heading'/);
});

test("#304 cross-artifact validation rejects undeclared controller private state", () => {
  const initializer = compileBrowserInitializer(initializerSource, config);
  const controller = compileBrowserController(`class WrongAgent(Agent):
    other = 0.0

    def step(self, obs):
        return Motion(self.other, 0.0)
`, { parameters: {} });
  assert.throws(() => validateBrowserPrivateState(initializer, controller), /assigns undeclared controller private state 'role'/);
  assert.throws(() => validateEdgePrivateState(initializer, controller), /assigns undeclared controller private state 'role'/);
});

test("#304 MCP authoring wall accepts valid heterogeneous profiles and rejects schema mismatch", () => {
  const configuration = `N = 3
CONTROL_DT = 0.1
EXPERIMENT_DURATION = 1.0
ARENA_SIZE = 10.0
INTERACTION_RADIUS = 2.0
MAX_FORWARD_SPEED = 2.0
MAX_ANGULAR_SPEED = 2.0
SENSOR_NOISE = 0.0
`;
  const valid = validateExperimentSources({ config_source: configuration, initializer_source: initializerSource, controller_source: controllerSource, metrics_source: "" });
  assert.equal(valid.valid, true);
  assert.equal(valid.compiled.initializer, "vlab.initializer-state/0.4");

  const invalid = validateExperimentSources({
    config_source: configuration,
    initializer_source: initializerSource,
    controller_source: `class WrongAgent(Agent):
    other = 0.0

    def step(self, obs):
        return Motion(self.other, 0.0)
`,
    metrics_source: "",
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.diagnostics[0].artifact, "initializer");
  assert.match(invalid.diagnostics[0].message, /undeclared controller private state 'role'/);
});

test("#577 robots cannot read the swarm size, the arena or the run length", () => {
  const parameters = { N: "scalar", ARENA_SIZE: "scalar", EXPERIMENT_DURATION: "scalar", GAIN: "scalar" };
  for (const name of ["N", "ARENA_SIZE", "EXPERIMENT_DURATION"]) {
    const source = `class Probe(Agent):\n    def step(self, obs):\n        return Motion(${name}, 0.0)\n`;
    assert.throws(() => compileBrowserController(source, { parameters }), new RegExp(`'${name}' is not available to robots`));
    assert.throws(() => compileEdgeController(source, { parameters }), new RegExp(`'${name}' is not available to robots`));
  }
  compileBrowserController("class Probe(Agent):\n    def step(self, obs):\n        return Motion(GAIN, 0.0)\n", { parameters });
});
