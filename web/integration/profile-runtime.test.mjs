import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as wasm from "../public/wasm/vlab_kernel.js";
import { swarmExperiment } from "../src/experiments/swarm-vs-swarm.js";
import { compileProductionExperiment } from "../src/experiment-validation.js";
import { compileController } from "../src/controller/compiler.js";
import { compileMetrics } from "../src/metrics/compiler.js";
import { simulationSetupFromRuntime } from "../src/runtime/contract.js";
import { ProfileSimulation } from "../src/runtime/profile-simulation.js";
import { FlightControl } from "../src/runtime/backends/flight-control.js";
await wasm.default({
  module_or_path: await readFile(
    new URL("../public/wasm/vlab_kernel_bg.wasm", import.meta.url),
  ),
});
const require = createRequire(import.meta.url);
const Ammo = await require("ammojs3/builds/ammo.wasm.js")({
  wasmBinary: await readFile(
    new URL("../node_modules/ammojs3/builds/ammo.wasm.wasm", import.meta.url),
  ),
});
const zero = compileController(
  "class Idle(Agent):\n    def step(self, obs):\n        return Motion(0.0, 0.0)",
);
function create(options = {}, change = () => {}) {
  const c = compileProductionExperiment(swarmExperiment(options), { seed: 12 });
  const setup = simulationSetupFromRuntime(c.runtime, 12, c.initializer.state);
  Object.assign(setup, setup.simulation);
  change(setup, c);
  return new ProfileSimulation(
    wasm,
    setup,
    c.controller,
    c.metrics,
    c.parameters,
    Ammo,
  );
}
test("capture threshold, terminal condition, removal and replay are exact", () => {
  for (const distance of [0.499, 0.5, 0.501]) {
    const sim = create({ attackers: 1, defenders: 1 }, (s, c) => {
      s.profile.motionNoise = 0;
      c.controller = { ...zero, parameters: c.controller.parameters };
      s.initialState = [
        { x: 0, y: 0, heading: 0 },
        { x: distance, y: 0, heading: 1 },
      ];
    });
    sim.advance_ticks(1);
    const captured = distance <= 0.5;
    assert.equal(sim.agents[1].active, !captured);
    assert.equal(sim.events.length, Number(captured));
    assert.equal(sim.stopReason, captured ? "group_resolved" : null);
    if (captured) {
      assert.equal(sim.observations().length, 1);
      assert.equal(sim.observations()[0].observation.neighbours.length, 0);
      const p = sim.snapshot_state();
      sim.advance_ticks(10);
      assert.deepEqual(sim.snapshot_state(), p);
    }
    sim.reset();
    assert.equal(sim.agents[1].active, true);
    assert.equal(sim.events.length, 0);
    sim.free();
  }
});
test("simultaneous capture uses stable IDs once, and capture overrides target success", () => {
  const sim = create({ attackers: 2, defenders: 1 }, (s, c) => {
    s.profile.motionNoise = 0;
    c.controller = { ...zero, parameters: c.controller.parameters };
    s.initialState = [
      { x: 0, y: 0, heading: 0 },
      { x: 0, y: 0.1, heading: 0 },
      { x: 0.1, y: 0, heading: 0 },
    ];
    s.profile.rules.unshift({
      type: "region",
      center: [0.1, 0],
      targetGroup: 1,
      distance: 1,
      status: 2,
    });
  });
  sim.advance_ticks(1);
  assert.deepEqual(sim.events, [{ id: 2, status: -1, time: 0.05 }]);
  sim.free();
});
test("pursuit gate holds attackers and blocks cross-group observations until the line is reached", () => {
  const sim = create({ caseNumber: 3 });
  assert.equal(sim.pursuitOnset, null);
  for (const input of sim.observations())
    assert.ok(
      input.observation.neighbours.every(
        (n) => n.kind !== 0 || n.group === input.observation.group,
      ),
    );
  sim.control();
  assert.ok(
    sim.actions.slice(0, 20).every((a) => a.forward === 0 && a.turning === 0),
  );
  sim.agents[20].position = [-2, 0, 0];
  sim.control();
  assert.equal(sim.pursuitOnset, 0);
  sim.free();
});
test("recording/metric edits never change the controller, physics or RNG state", () => {
  const a = create(),
    b = create();
  a.advance_ticks(30);
  b.advance_ticks(30);
  a.set_metrics(
    JSON.stringify(compileMetrics("")),
    JSON.stringify(a.parameters),
  );
  assert.equal(a.physics_ticks(), 30);
  a.advance_ticks(30);
  b.advance_ticks(30);
  assert.deepEqual(a.snapshot_metadata(), b.snapshot_metadata());
  const end = a.snapshot_state();
  a.reset();
  a.advance_ticks(60);
  assert.deepEqual(a.snapshot_state(), end);
  a.free();
  b.free();
});
test("2D and Bullet experiments move, capture and remain finite for 120 seconds", () => {
  for (const dimension of [2, 3]) {
    const sim = create({ dimension });
    const initial = sim.snapshot_state();
    sim.advance_ticks(dimension === 2 ? 2400 : 28800);
    assert.notDeepEqual(sim.snapshot_state(), initial);
    assert.ok(sim.events.some((e) => e.status === -1));
    assert.ok(sim.snapshot_state().every(Number.isFinite));
    if (dimension === 3)
      for (const a of sim.agents.filter((a) => a.active))
        assert.ok(
          Math.abs(a.position[2] - a.profile.altitude) < 0.05,
          JSON.stringify(a.position),
        );
    sim.free();
  }
});
test("Bullet gravity and physical floor/wall collisions are real", () => {
  const sim = create({ dimension: 3, attackers: 1, defenders: 1 });
  const backend = sim.backend,
    drone = backend.drones[0];
  for (let i = 0; i < 24; i++) backend.world.stepSimulation(1 / 240, 0);
  backend.read(sim.agents[0], drone);
  assert.ok(sim.agents[0].velocity[2] < -0.8);
  for (let i = 0; i < 480; i++) backend.world.stepSimulation(1 / 240, 0);
  backend.read(sim.agents[0], drone);
  assert.ok(sim.agents[0].position[2] >= 0 && sim.agents[0].position[2] < 0.1);
  const t = drone.body.getWorldTransform(),
    v = new Ammo.btVector3(4, 3, 1.2),
    q = new Ammo.btQuaternion(0, 0, 0, 1);
  t.setOrigin(v);
  t.setRotation(q);
  drone.body.setWorldTransform(t);
  v.setValue(2, 0, 0);
  drone.body.setLinearVelocity(v);
  v.setValue(0, 0, 0);
  drone.body.setAngularVelocity(v);
  for (let i = 0; i < 60; i++) backend.world.stepSimulation(1 / 240, 0);
  backend.read(sim.agents[0], drone);
  assert.ok(sim.agents[0].position[0] < 4.4);
  Ammo.destroy(q);
  Ammo.destroy(v);
  sim.free();
});
test("CF2X flight controller matches independent Python PID reference including yaw rate", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("../tests/fixtures/cf2x-flight.json", import.meta.url),
    ),
  );
  const pid = new FlightControl();
  for (const s of fixture.samples) {
    const actual = pid.compute(
      s.dt,
      s.position,
      s.quaternion,
      s.velocity,
      s.targetPosition,
      s.targetVelocity,
      s.targetYaw,
      s.targetYawRate,
    );
    actual.forEach((rpm, i) => assert.ok(Math.abs(rpm - s.rpm[i]) < 1e-7));
  }
});
test("compiled DM commands match independent NumPy force and boundary reference", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("../tests/fixtures/swarm-dm-reference.json", import.meta.url),
    ),
  );
  for (const sample of fixture.samples) {
    const sim = create(
      { dimension: sample.physical ? 3 : 2, attackers: 3, defenders: 3 },
      (s, c) => {
        c.parameters.DEFENDER_RESPONSE = sample.response;
        s.initialState = sample.positions.map((p, i) => ({
          x: p[0],
          y: p[1],
          heading: sample.headings[i],
        }));
      },
    );
    const actual = sim.core.commands(JSON.stringify(sim.observations()));
    sample.commands
      .flat()
      .forEach((expected, i) =>
        assert.ok(
          Math.abs(actual[i] - expected) <
            1e-8 * Math.max(1, Math.abs(expected)),
          `${sample.physical}/${sample.response} command ${i}: ${actual[i]} versus ${expected}`,
        ),
      );
    sim.free();
  }
});

test("both target cases progress through pursuit onset and lifecycle outcomes", () => {
  for (const caseNumber of [2, 3]) {
    const sim = create({ caseNumber });
    sim.advance_ticks(6000);
    assert.ok(
      sim.pursuitOnset !== null && sim.pursuitOnset > 0,
      `Case ${caseNumber} must cross the pursuit plane`,
    );
    assert.ok(
      sim.events.length > 0,
      `Case ${caseNumber} must resolve capture or target events`,
    );
    assert.equal(
      sim.agents.filter((a) => a.group === 1 && a.active).length +
        sim.events.length,
      30,
    );
    sim.free();
  }
});

test("invalid controller or metrics edit preserves the running physical state", () => {
  const a = create(),
    b = create();
  a.advance_ticks(10);
  b.advance_ticks(10);
  assert.throws(() => a.set_controller("{}", JSON.stringify(a.parameters)));
  assert.throws(() => a.set_metrics("{}", JSON.stringify(a.parameters)));
  a.advance_ticks(10);
  b.advance_ticks(10);
  assert.deepEqual(a.snapshot_metadata(), b.snapshot_metadata());
  a.free();
  b.free();
});
