// Heterogeneous private state at initialization (#304), now declared as groups
// (#577, D-022, D-023): an exact composition declared by the experimenter;
// robot properties (starting state, sensors) attach to groups, and no one
// addresses an individual robot. Browser and MCP compilers must agree.

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
const bigConfig = { values: { N: 100, SEED: 42, RHO: 0.1, ARENA_SIZE: 10.0 } };

// Explicit placement reproduces a fixed assignment exactly.
const initializerSource = `def initialize(config, rng, place):
    group("lead", count=2, placement="explicit")
    group("other", rest=True, placement="explicit")
    set_state("lead", role=1.0)
    for i in range(config.N):
        if i < 2:
            place(i, i * 1.0, 0.0, 0.0, group="lead")
        else:
            place(i, i * 1.0, 0.0, 0.0, group="other")
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

test("#577 explicit groups give each group's starting state to its members", () => {
  const initializer = both(initializerSource);
  assert.equal(initializer.version, "vlab.initializer-state/0.4");
  assert.deepEqual(initializer.state, [
    { x: 0, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 1, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 2, y: 0, heading: 0 },
  ]);
  assert.deepEqual(initializer.groups, [
    { name: "lead", partition: "default", count: 2, placement: "explicit" },
    { name: "other", partition: "default", count: 1, placement: "explicit" },
  ]);
  const controller = compileBrowserController(controllerSource, { parameters: {} });
  assert.deepEqual(compileEdgeController(controllerSource, { parameters: {} }), controller);
  validateBrowserPrivateState(initializer, controller);
  validateEdgePrivateState(initializer, controller);
});

test("#577 a fraction gives an exact count in every run; only which robots vary with the seed", () => {
  const source = `def initialize(config, rng, place):\n    group("informed", fraction=config.RHO)\n    group("uninformed", rest=True)\n    set_state("informed", informed=1.0)\n    set_state("uninformed", informed=0.0)\n${scatter}`;
  const informed = (seed) => both(source, { values: { ...bigConfig.values, SEED: seed } }).state.filter((agent) => agent.private_state.informed === 1).length;
  assert.deepEqual([1, 2, 3, 4, 5].map(informed), [10, 10, 10, 10, 10]);
  const members = (seed) => both(source, { values: { ...bigConfig.values, SEED: seed } }).state.map((agent) => agent.private_state.informed).join("");
  assert.notEqual(members(1), members(2), "the deal depends on the seed");
  assert.equal(members(3), members(3), "and is reproducible");
});

test("#577 dealing groups does not shift placement draws", () => {
  const withGroups = both(`def initialize(config, rng, place):\n    group("a", fraction=0.5)\n    group("b", rest=True)\n    set_state("a", a=1.0)\n${scatter}`, bigConfig);
  const without = both(`def initialize(config, rng, place):\n${scatter}`, bigConfig);
  assert.deepEqual(withGroups.state.map(({ x, y }) => [x, y]), without.state.map(({ x, y }) => [x, y]));
});

test("#577 D-023 partitions are independent, crossed factors with exact counts", () => {
  const source = `def initialize(config, rng, place):
    define_reference("nest", 0.0, 0.0)
    group("informed", fraction=0.2)
    group("uninformed", rest=True)
    group("equipped", fraction=0.5, partition="hardware")
    group("plain", rest=True, partition="hardware")
    set_state("informed", informed=1.0)
    equip("equipped", "nest", range=2.5)
${scatter}`;
  const compiled = both(source, bigConfig);
  const informed = new Set(compiled.state.flatMap((agent, index) => (agent.private_state?.informed === 1 ? [index] : [])));
  const equipped = new Set(compiled.world_references.sensors.map(({ agent_index }) => agent_index));
  assert.equal(informed.size, 20);
  assert.equal(equipped.size, 50);
  assert.ok(compiled.world_references.sensors.every(({ name, max_range }) => name === "nest" && max_range === 2.5));
  const overlap = [...informed].filter((index) => equipped.has(index)).length;
  assert.ok(overlap > 0 && overlap < 20, `independent deals overlap partially, got ${overlap}`);
  assert.deepEqual(compiled.groups.map(({ name, partition, count }) => [name, partition, count]), [
    ["informed", "default", 20], ["uninformed", "default", 80], ["equipped", "hardware", 50], ["plain", "hardware", 50],
  ]);
  // Adding a second partition leaves the first partition's deal unchanged.
  const single = both(`def initialize(config, rng, place):\n    group("informed", fraction=0.2)\n    group("uninformed", rest=True)\n    set_state("informed", informed=1.0)\n${scatter}`, bigConfig);
  assert.deepEqual(single.state.map((agent) => agent.private_state?.informed ?? 0), compiled.state.map((agent) => agent.private_state?.informed ?? 0));
});

test("#577 D-023 \"all\" equips every robot, and an explicit group can sit inside a random partition", () => {
  const compiled = both(`def initialize(config, rng, place):
    define_reference("nest", 0.0, 0.0)
    group("leader", count=1, placement="explicit")
    group("followers", rest=True)
    set_state("leader", leader=1.0)
    equip("all", "nest")
    place(0, 0.0, 0.0, 0.0, group="leader")
    place(1, 1.0, 0.0, 0.0)
    place(2, 2.0, 0.0, 0.0)
`, { values: { N: 3, SEED: 1, ARENA_SIZE: 10.0 } });
  assert.deepEqual(compiled.state.map((agent) => agent.private_state?.leader ?? 0), [1, 0, 0]);
  assert.deepEqual(compiled.world_references.sensors, [0, 1, 2].map((agent_index) => ({ agent_index, name: "nest", max_range: null })));
});

test("#577 compositions that do not add up, misplaced groups and conflicting properties are rejected", () => {
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", count=2)\n${scatter}`, /groups account for 2 robots but N is 3; mark one group rest=True/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", count=5)\n    group("b", rest=True)\n${scatter}`, /groups ask for 5 robots but N is 3/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", rest=True)\n    group("h", count=1, partition="hw")\n${scatter}`, /groups in partition "hw" account for 1 robots but N is 3/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", count=1, placement="explicit")\n    group("b", rest=True)\n${scatter}`, /group 'a' has 1 members but 0 were placed with group="a"/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", count=1)\n    group("b", rest=True)\n    place(0, 0.0, 0.0, 0.0, group="a")\n    place(1, 0.0, 0.0, 0.0)\n    place(2, 0.0, 0.0, 0.0)\n`, /group 'a' is dealt at random/);
  rejectedBoth(`def initialize(config, rng, place):\n${scatter}    group("late", rest=True)\n`, /declare every group before the first place/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", fraction=1.5)\n${scatter}`, /fraction must be between 0 and 1/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", rest=True)\n    group("b", rest=True)\n${scatter}`, /only one group may be rest=True/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", count=1, fraction=0.5)\n${scatter}`, /needs exactly one of fraction=, count= or rest=True/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("all", rest=True)\n${scatter}`, /'all' already names every robot/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", rest=True)\n    set_state("b", x=1.0)\n${scatter}`, /set_state names undeclared group "b"/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", count=1)\n    group("b", rest=True)\n    group("h", rest=True, partition="hw")\n    set_state("a", x=1.0)\n    set_state("h", x=2.0)\n${scatter}`, /state 'x' is set by groups 'a' and 'h', and a robot can belong to both/);
  rejectedBoth(`def initialize(config, rng, place):\n    define_reference("n", 0.0, 0.0)\n    group("a", rest=True)\n    equip("all", "n")\n    equip("a", "n", range=1.0)\n${scatter}`, /sensor 'n' is given by groups 'all' and 'a'/);
});

test("#577 retired calls point to the replacement, and group properties are type-checked", () => {
  rejectedBoth(`def initialize(config, rng, place):\n${scatter}    set_agent_state(0, "role", 1.0)\n`, /set_agent_state was retired/);
  rejectedBoth(`def initialize(config, rng, place):\n    role("a", rest=True, informed=1.0)\n${scatter}`, /role\(\.\.\.\) was replaced \(#577, D-023\): declare group/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", rest=True, informed=1.0)\n${scatter}`, /group does not take keyword argument 'informed'/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", rest=True)\n    set_state("a", informed="yes")\n${scatter}`, /set_state keyword 'informed' must be scalar, got string/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", rest=True)\n    for i in range(config.N):\n        place(i, 0.0, 0.0, 0.0, heading=1.0)\n`, /place does not take keyword argument 'heading'/);
  rejectedBoth(`def initialize(config, rng, place):\n    group("a", rest=True)\n    equip("a", "n", reach=1.0)\n${scatter}`, /equip does not take keyword argument 'reach'/);
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
