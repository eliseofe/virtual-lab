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
    group("lead", count=2, dimension="rank", placement="explicit")
    rest_of_group("other", dimension="rank", placement="explicit")
    set_trait("lead", "role", 1.0)
    for i in range(config.N):
        if i < 2:
            place(i, i * 1.0, 0.0, 0.0, group="lead")
        else:
            place(i, i * 1.0, 0.0, 0.0, group="other")
`;

const controllerSource = `class HeterogeneousAgent(Agent):
    role = trait(0.0)

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
const informedSplit = `    group("informed", fraction=config.RHO, dimension="information")\n    rest_of_group("uninformed", dimension="information")\n`;

test("#577 explicit groups give each group's trait to its members", () => {
  const initializer = both(initializerSource);
  assert.equal(initializer.version, "vlab.initializer-state/0.4");
  assert.deepEqual(initializer.state, [
    { x: 0, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 1, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 2, y: 0, heading: 0 },
  ]);
  assert.deepEqual(initializer.groups, [
    { name: "lead", dimension: "rank", count: 2, placement: "explicit" },
    { name: "other", dimension: "rank", count: 1, placement: "explicit" },
  ]);
  const controller = compileBrowserController(controllerSource, { parameters: {} });
  assert.deepEqual(compileEdgeController(controllerSource, { parameters: {} }), controller);
  validateBrowserPrivateState(initializer, controller);
  validateEdgePrivateState(initializer, controller);
});

test("#577 a fraction gives an exact count in every run; only which robots vary with the seed", () => {
  const source = `def initialize(config, rng, place):\n${informedSplit}    set_trait("informed", "informed", True)\n${scatter}`;
  const informed = (seed) => both(source, { values: { ...bigConfig.values, SEED: seed } }).state.filter((agent) => agent.private_state?.informed === true).length;
  assert.deepEqual([1, 2, 3, 4, 5].map(informed), [10, 10, 10, 10, 10]);
  const members = (seed) => both(source, { values: { ...bigConfig.values, SEED: seed } }).state.map((agent) => (agent.private_state?.informed ? 1 : 0)).join("");
  assert.notEqual(members(1), members(2), "the deal depends on the seed");
  assert.equal(members(3), members(3), "and is reproducible");
});

test("#577 dealing groups does not shift placement draws", () => {
  const withGroups = both(`def initialize(config, rng, place):\n${informedSplit}    set_trait("informed", "a", 1.0)\n${scatter}`, bigConfig);
  const without = both(`def initialize(config, rng, place):\n${scatter}`, bigConfig);
  assert.deepEqual(withGroups.state.map(({ x, y }) => [x, y]), without.state.map(({ x, y }) => [x, y]));
});

test("#577 independent dimensions are exact per dimension; their overlap follows the seed", () => {
  const source = `def initialize(config, rng, place):
    define_reference("nest", 0.0, 0.0)
${informedSplit}    group("equipped", fraction=0.5, dimension="hardware")
    rest_of_group("plain", dimension="hardware")
    set_trait("informed", "informed", True)
    equip("equipped", "nest", range=2.5)
${scatter}`;
  const compiled = both(source, bigConfig);
  const informed = new Set(compiled.state.flatMap((agent, index) => (agent.private_state?.informed ? [index] : [])));
  const equipped = new Set(compiled.world_references.sensors.map(({ agent_index }) => agent_index));
  assert.equal(informed.size, 10);
  assert.equal(equipped.size, 50);
  assert.ok(compiled.world_references.sensors.every(({ name, max_range }) => name === "nest" && max_range === 2.5));
  assert.deepEqual(compiled.groups.map(({ name, dimension, count }) => [name, dimension, count]), [
    ["informed", "information", 10], ["uninformed", "information", 90], ["equipped", "hardware", 50], ["plain", "hardware", 50],
  ]);
  // Adding a second dimension leaves the first dimension's deal unchanged.
  const single = both(`def initialize(config, rng, place):\n${informedSplit}    set_trait("informed", "informed", True)\n${scatter}`, bigConfig);
  assert.deepEqual(single.state.map((agent) => agent.private_state?.informed ?? false), compiled.state.map((agent) => agent.private_state?.informed ?? false));
});

test("#577 within= nests a split inside a group, giving exact joint counts", () => {
  const source = `def initialize(config, rng, place):
    group("informed", count=40, dimension="information")
    rest_of_group("uninformed", dimension="information")
    group("informed_malicious", count=10, dimension="behaviour", within="informed")
    rest_of_group("informed_honest", dimension="behaviour", within="informed")
    set_trait("informed", "informed", True)
    set_trait("informed_malicious", "malicious", True)
${scatter}`;
  for (const seed of [1, 2, 3]) {
    const compiled = both(source, { values: { ...bigConfig.values, SEED: seed } });
    const agents = compiled.state.map((agent) => agent.private_state ?? {});
    assert.equal(agents.filter((a) => a.informed).length, 40);
    assert.equal(agents.filter((a) => a.malicious).length, 10);
    assert.equal(agents.filter((a) => a.malicious && !a.informed).length, 0, "malicious robots are all informed");
  }
  const compiled = both(source, bigConfig);
  assert.deepEqual(compiled.groups.find(({ name }) => name === "informed_honest"), { name: "informed_honest", dimension: "behaviour", within: "informed", count: 30, placement: "random" });
  // A fraction inside a nested split is a fraction of the parent group.
  const byFraction = both(source.replace('count=10, dimension="behaviour"', 'fraction=0.25, dimension="behaviour"'), bigConfig);
  assert.equal(byFraction.groups.find(({ name }) => name === "informed_malicious").count, 10);
});

test("#577 \"all\" equips every robot, and an explicit group can sit in a dimension with random groups", () => {
  const compiled = both(`def initialize(config, rng, place):
    define_reference("nest", 0.0, 0.0)
    group("leader", count=1, dimension="rank", placement="explicit")
    rest_of_group("followers", dimension="rank")
    set_trait("leader", "leader", 1.0)
    equip("all", "nest")
    place(0, 0.0, 0.0, 0.0, group="leader")
    place(1, 1.0, 0.0, 0.0)
    place(2, 2.0, 0.0, 0.0)
`, { values: { N: 3, SEED: 1, ARENA_SIZE: 10.0 } });
  assert.deepEqual(compiled.state.map((agent) => agent.private_state?.leader ?? 0), [1, 0, 0]);
  assert.deepEqual(compiled.world_references.sensors, [0, 1, 2].map((agent_index) => ({ agent_index, name: "nest", max_range: null })));
});

test("#577 compositions that do not add up, misplaced groups and conflicting traits are rejected", () => {
  const head = "def initialize(config, rng, place):\n";
  rejectedBoth(`${head}    group("a", count=2, dimension="d")\n${scatter}`, /dimension "d" accounts for 2 robots but has 3; add a rest_of_group/);
  rejectedBoth(`${head}    group("a", count=5, dimension="d")\n    rest_of_group("b", dimension="d")\n${scatter}`, /dimension "d" asks for 5 robots but has 3/);
  rejectedBoth(`${head}    group("a", count=1)\n${scatter}`, /group 'a' needs dimension="\.\.\."/);
  rejectedBoth(`${head}    group("a", count=3, dimension="d")\n    group("b", count=1, dimension="e", within="a")\n${scatter}`, /dimension "e" within "a" accounts for 1 robots but has 3/);
  rejectedBoth(`${head}    group("b", count=1, dimension="e", within="a")\n${scatter}`, /within= must name a group declared before it/);
  rejectedBoth(`${head}    group("a", count=1, dimension="d", placement="explicit")\n    rest_of_group("b", dimension="d")\n${scatter}`, /group 'a' has 1 members but 0 were placed with group="a"/);
  rejectedBoth(`${head}    group("a", count=1, dimension="d")\n    rest_of_group("b", dimension="d")\n    place(0, 0.0, 0.0, 0.0, group="a")\n    place(1, 0.0, 0.0, 0.0)\n    place(2, 0.0, 0.0, 0.0)\n`, /group 'a' is dealt at random/);
  rejectedBoth(`${head}${scatter}    rest_of_group("late", dimension="d")\n`, /declare every group before the first place/);
  rejectedBoth(`${head}    group("a", fraction=1.5, dimension="d")\n${scatter}`, /fraction must be between 0 and 1/);
  rejectedBoth(`${head}    rest_of_group("a", dimension="d")\n    rest_of_group("b", dimension="d")\n${scatter}`, /dimension "d" already has a rest_of_group/);
  rejectedBoth(`${head}    group("a", count=1, fraction=0.5, dimension="d")\n${scatter}`, /needs exactly one of fraction= or count=/);
  rejectedBoth(`${head}    rest_of_group("all", dimension="d")\n${scatter}`, /'all' already names every robot/);
  rejectedBoth(`${head}    rest_of_group("a", dimension="d")\n    set_trait("b", "x", 1.0)\n${scatter}`, /set_trait names undeclared group "b"/);
  rejectedBoth(`${head}    group("a", count=1, dimension="d")\n    rest_of_group("b", dimension="d")\n    rest_of_group("h", dimension="e")\n    set_trait("a", "x", 1.0)\n    set_trait("h", "x", 2.0)\n${scatter}`, /trait 'x' is set by groups 'a' and 'h', and a robot can belong to both/);
  rejectedBoth(`${head}    group("a", count=2, dimension="d")\n    rest_of_group("b", dimension="d")\n    group("a1", count=1, dimension="e", within="a")\n    rest_of_group("a2", dimension="e", within="a")\n    set_trait("a", "x", 1.0)\n    set_trait("a1", "x", 2.0)\n${scatter}`, /trait 'x' is set by groups 'a' and 'a1'/);
  rejectedBoth(`${head}    define_reference("n", 0.0, 0.0)\n    rest_of_group("a", dimension="d")\n    equip("all", "n")\n    equip("a", "n", range=1.0)\n${scatter}`, /sensor 'n' is given by groups 'all' and 'a'/);
  // Distinct groups of one split, or their nested groups, never overlap.
  both(`${head}    group("a", count=2, dimension="d")\n    rest_of_group("b", dimension="d")\n    group("a1", count=1, dimension="e", within="a")\n    rest_of_group("a2", dimension="e", within="a")\n    set_trait("a1", "x", 1.0)\n    set_trait("b", "x", 2.0)\n${scatter}`);
});

test("#577 retired forms point to the replacement, and traits are type-checked", () => {
  const head = "def initialize(config, rng, place):\n";
  rejectedBoth(`${head}${scatter}    set_agent_state(0, "role", 1.0)\n`, /set_agent_state was retired/);
  rejectedBoth(`${head}    role("a", rest=True, informed=1.0)\n${scatter}`, /role\(\.\.\.\) was replaced \(#577, D-023\): declare group/);
  rejectedBoth(`${head}    group("a", rest=True, dimension="d")\n${scatter}`, /rest=True was replaced by rest_of_group/);
  rejectedBoth(`${head}    group("a", count=3, partition="d")\n${scatter}`, /partition= was renamed dimension=/);
  rejectedBoth(`${head}    rest_of_group("a", dimension="d")\n    set_state("a", x=1.0)\n${scatter}`, /set_state was replaced by set_trait/);
  rejectedBoth(`${head}    group("a", count=3, dimension="d", informed=1.0)\n${scatter}`, /group does not take keyword argument 'informed'; give the group a trait with set_trait/);
  rejectedBoth(`${head}    rest_of_group("a", dimension="d")\n    set_trait("a", "informed", "yes")\n${scatter}`, /set_trait expects a group, a trait name and a number or True\/False/);
  rejectedBoth(`${head}    rest_of_group("a", dimension="d")\n    for i in range(config.N):\n        place(i, 0.0, 0.0, 0.0, heading=1.0)\n`, /place does not take keyword argument 'heading'/);
  rejectedBoth(`${head}    rest_of_group("a", dimension="d")\n    equip("a", "n", reach=1.0)\n${scatter}`, /equip does not take keyword argument 'reach'/);
});

test("#577 traits are read-only for the robot, and must be declared as traits with the right type", () => {
  const initializer = both(`def initialize(config, rng, place):\n    rest_of_group("a", dimension="d")\n    set_trait("a", "informed", True)\n${scatter}`);
  const controller = (declaration, body = "        return Motion(0.0, 0.0)\n") => compileBrowserController(`class R(Agent):\n    ${declaration}\n\n    def step(self, obs):\n${body}`, { parameters: {} });
  validateBrowserPrivateState(initializer, controller("informed = trait(False)"));
  assert.throws(() => validateBrowserPrivateState(initializer, controller("informed = 0.0")), /declares it as ordinary memory; declare it as informed = trait\(default\)/);
  assert.throws(() => validateBrowserPrivateState(initializer, controller("informed = trait(0.0)")), /trait 'informed' is a number in the Controller, but set_trait gives True\/False/);
  assert.throws(() => validateBrowserPrivateState(initializer, controller("other = trait(False)")), /the Controller does not declare it; add informed = trait\(default\)/);
  for (const write of ["        self.informed = True\n        return Motion(0.0, 0.0)\n", "        if self.informed:\n            self.informed = False\n        return Motion(0.0, 0.0)\n"]) {
    assert.throws(() => controller("informed = trait(False)", write), /trait 'informed' is read-only/);
    assert.throws(() => compileEdgeController(`class R(Agent):\n    informed = trait(False)\n\n    def step(self, obs):\n${write}`, { parameters: {} }), /trait 'informed' is read-only/);
  }
  assert.deepEqual(controller("informed = trait(False)").state, [{ name: "informed", type: "bool", initial: false, trait: true }]);
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
  assert.match(invalid.diagnostics[0].message, /does not declare it; add role = trait\(default\)/);
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

test("#577 Metrics read True/False traits as booleans and numeric traits as numbers", async () => {
  const { compileMetrics } = await import("../src/metrics/compiler.js");
  const ir = compileMetrics(`@metric(id="informed.count", name="Informed", unit=None, sampling=every(1.0))
def informed_count(snapshot):
    count = 0.0
    for agent in snapshot.agents:
        if agent.private_state.informed:
            count += agent.private_state.gain
    return count
`, { parameters: {}, agentState: { informed: "bool", gain: "scalar" } });
  assert.ok(ir.observation_contract.fields.includes("snapshot.agents[].private_state.informed"));
  assert.throws(() => compileMetrics(`@metric(id="m", name="M", unit=None, sampling=every(1.0))
def m(snapshot):
    total = 0.0
    for agent in snapshot.agents:
        total += agent.private_state.informed
    return total
`, { parameters: {}, agentState: { informed: "bool" } }), /bool/);
});
