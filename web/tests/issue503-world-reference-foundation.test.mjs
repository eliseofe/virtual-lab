import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileInitializer as compileBrowserInitializer } from "../src/initializer/compiler.js";
import { simulationSetupFromRuntime } from "../src/runtime/contract.js";
import { compileInitializer as compileEdgeInitializer } from "../../supabase/functions/experiment-mcp/vendor/initializer-compiler.js";
import { IMPLEMENTED_CAPABILITY_BINDINGS } from "../src/capability-bindings.js";

const config = {
  values: {
    N: 3,
    SEED: 17,
    ARENA_SIZE: 10.0,
  },
};

// #577 (D-023): sensors are equipment attached to groups; explicit groups
// reproduce the former per-index assignment exactly.
const source = `def initialize(config, rng, place):
    group("a", count=1, dimension="sensing", placement="explicit")
    group("b", count=1, dimension="sensing", placement="explicit")
    group("c", count=1, dimension="sensing", placement="explicit")
    place(0, 0.0, 0.0, 0.0, group="a")
    place(1, 1.0, 0.0, 0.0, group="b")
    place(2, 2.0, 0.0, 0.0, group="c")
    define_reference("goal", 4.5, 0.0)
    define_reference("nest", -2.0, 1.0)
    equip("a", "goal")
    equip("b", "goal", range=3.0)
    equip("c", "nest", range=1.5)
`;

test("#503 Initialization compiles static named references and per-agent sensor assignments deterministically", () => {
  const browser = compileBrowserInitializer(source, config);
  const edge = compileEdgeInitializer(source, config);
  assert.deepEqual(edge, browser);
  assert.equal(browser.version, "vlab.initializer-state/0.4");
  assert.deepEqual(browser.world_references, {
    schema: "vlab.world-references/0.1",
    references: [
      { name: "goal", x: 4.5, y: 0 },
      { name: "nest", x: -2, y: 1 },
    ],
    sensors: [
      { agent_index: 0, name: "goal", max_range: null },
      { agent_index: 1, name: "goal", max_range: 3 },
      { agent_index: 2, name: "nest", max_range: 1.5 },
    ],
  });
});

test("#503 runtime setup carries reference state without advertising the capability", () => {
  const initializer = compileBrowserInitializer(source, config);
  const runtime = {
    physicsDt: 0.01,
    controlDt: 0.05,
    metricDt: 0.1,
    interactionRadius: 2.0,
    arenaSize: 10.0,
    sensorNoise: 0.0,
    maxForwardSpeed: 2.0,
    maxAngularSpeed: 2.0,
  };
  const setup = simulationSetupFromRuntime(runtime, 17, initializer.state, null, initializer.world_references);
  assert.deepEqual(setup.worldReferences, initializer.world_references);
  assert.equal(
    IMPLEMENTED_CAPABILITY_BINDINGS.some(({ capability_key }) =>
      capability_key === "observation.named_reference_relative_position"),
    true,
  );
});

test("#503 Initialization rejects malformed or inconsistent world references", () => {
  const prefix = `def initialize(config, rng, place):
    for i in range(config.N):
        place(i, i * 1.0, 0.0, 0.0)
`;
  assert.throws(
    () => compileBrowserInitializer(prefix + `    define_reference("goal", 0.0, 0.0)\n    define_reference("goal", 1.0, 0.0)\n`, config),
    /defined more than once/,
  );
  assert.throws(
    () => compileBrowserInitializer(prefix + `    equip("all", "missing")\n`, config),
    /undefined reference/,
  );
  assert.throws(
    () => compileBrowserInitializer(prefix + `    define_reference("goal", 0.0, 0.0)\n    equip("all", "goal", range=0.0)\n`, config),
    /finite positive number/,
  );
  assert.throws(
    () => compileBrowserInitializer(prefix + `    define_reference("goal", 6.0, 0.0)\n`, config),
    /fit inside ARENA_SIZE/,
  );
  assert.throws(
    () => compileBrowserInitializer(prefix + `    define_reference("goal", 0.0, 0.0)\n    set_agent_reference_sensor(0, "goal", None)\n`, config),
    /set_agent_reference_sensor was retired \(#577, D-023\): give a group the sensor with equip/,
  );
});

test("#503 production worker and Rust runtime keep initial/current reference state separate", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.resolve(here, "..", "..");
  const worker = await readFile(path.join(repo, "web/src/worker.js"), "utf8");
  const kernel = await readFile(path.join(repo, "crates/kernel/src/lib.rs"), "utf8");
  assert.match(worker, /JSON\.stringify\(setup\.worldReferences\)/);
  assert.match(kernel, /reference_initialization: WorldReferenceState/);
  assert.match(kernel, /reference_state: WorldReferenceState/);
  assert.match(kernel, /self\.reference_state = self\.reference_initialization\.clone\(\)/);
  assert.match(kernel, /minimum_image\(position - origin, arena_size\)/);
});
