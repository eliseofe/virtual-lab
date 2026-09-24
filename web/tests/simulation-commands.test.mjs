// Behaviour tests for the simulation controller's command surface (#562).

import assert from "node:assert/strict";
import test from "node:test";

import { provideSimulationCommands, simulationCommands } from "../src/runtime/simulation-commands.js";

const NAMES = ["run", "pause", "restart", "restartWithNewSeed", "fitArena", "setSpeed", "setGlyph"];

test("before the simulator provides its commands, calling one does nothing", () => {
  for (const name of NAMES) assert.doesNotThrow(() => simulationCommands[name]());
});

test("every view reaches the one controller the simulator provides", () => {
  const calls = [];
  provideSimulationCommands(Object.fromEntries(NAMES.map((name) => [name, (...args) => calls.push([name, ...args])])));
  simulationCommands.run();
  simulationCommands.setSpeed(40);
  simulationCommands.setGlyph("dot");
  simulationCommands.restartWithNewSeed();
  assert.deepEqual(calls, [["run"], ["setSpeed", 40], ["setGlyph", "dot"], ["restartWithNewSeed"]]);
  assert.ok(Object.isFrozen(simulationCommands), "views cannot replace a command");
});
