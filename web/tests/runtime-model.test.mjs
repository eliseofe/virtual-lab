// Behaviour tests for the runtime model and its display formatting (#560): the
// model holds what the simulator is doing; every view draws from it.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatRuntimeFactor } from "../src/runtime/rate-meter.js";
import {
  formatActualSpeed,
  formatCount,
  formatRunState,
  formatScientificTime,
  formatSeed,
} from "../src/runtime/runtime-format.js";
import { RUNTIME_INITIAL_STATE, createRuntimeModel, runtimeModel } from "../src/runtime/runtime-model.js";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("the initial model shows exactly what the page shows before the simulator reports", async () => {
  const index = await source("index.html");
  const initialText = (id) => index.match(new RegExp(`id="${id}">([^<]*)<`))[1];
  assert.equal(formatRunState(RUNTIME_INITIAL_STATE.runState), initialText("run-state"));
  assert.equal(formatSeed(RUNTIME_INITIAL_STATE.seed), initialText("run-seed"));
  assert.equal(formatScientificTime(RUNTIME_INITIAL_STATE.scientificTime), initialText("scientific-time"));
  assert.equal(formatCount(RUNTIME_INITIAL_STATE.physicsTicks), initialText("physics-ticks"));
  assert.equal(formatCount(RUNTIME_INITIAL_STATE.controlUpdates), initialText("control-updates"));
  assert.equal(formatActualSpeed(RUNTIME_INITIAL_STATE.actualSpeed), initialText("actual-simulation-speed"));
  assert.deepEqual(runtimeModel.get(), RUNTIME_INITIAL_STATE);
});

test("values are displayed exactly as the page always displayed them", () => {
  assert.deepEqual(["initializing", "running", "paused"].map(formatRunState), ["Initializing", "Running", "Paused"]);
  for (let i = 0; i < 2000; i += 1) {
    const seed = Math.floor((Math.random() - 0.3) * 2 ** 33);
    const time = Math.random() * 10 ** Math.floor(Math.random() * 6);
    const count = Math.floor(Math.random() * 1e9);
    assert.equal(formatSeed(seed), String(seed >>> 0));
    assert.equal(formatScientificTime(time), time.toFixed(3));
    assert.equal(formatCount(count), String(count));
    const factor = Math.random() * 40;
    assert.equal(formatActualSpeed(factor), formatRuntimeFactor(factor));
  }
  assert.equal(formatScientificTime(Number.NaN), "NaN", "a malformed time shows as before");
  assert.equal(formatActualSpeed(null), "—");
});

test("the speed meter reads scientific time at the displayed millisecond precision", () => {
  for (const time of [0, 1.23456, 99.9995, 1234.5678]) {
    assert.equal(Number(formatScientificTime(time)), Number(time.toFixed(3)));
  }
});

test("listeners hear every write, with the fields written, including unchanged rewrites", () => {
  const model = createRuntimeModel();
  const heard = [];
  const unsubscribe = model.subscribe((state, written) => heard.push([state.runState, written]));
  model.set({ runState: "paused" });
  model.set({ runState: "paused" });
  model.set({ scientificTime: 1.5, physicsTicks: 30 });
  model.set({});
  unsubscribe();
  model.set({ runState: "running" });
  assert.deepEqual(heard, [
    ["paused", ["runState"]],
    ["paused", ["runState"]],
    ["paused", ["scientificTime", "physicsTicks"]],
  ]);
  assert.equal(model.get().runState, "running");
  assert.ok(Object.isFrozen(model.get()), "views cannot change the model behind the writer's back");
});

test("one model: the simulator, the speed meter and the React panel share the same module", async () => {
  const main = await source("main.js");
  const meter = await source("runtime-speed.js");
  const adapter = await source("simulation-react-adapter.ts");
  const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(main, /import \{ runtimeModel \} from "\.\/runtime\/runtime-model\.js"/);
  assert.match(meter, /import \{ runtimeModel \} from "\.\/runtime\/runtime-model\.js"/);
  assert.match(adapter, /import \{ runtimeModel \} from '\.\/runtime\/runtime-model\.js'/);
  assert.match(vite, /runtime-model\|simulation-commands\|results-model\|results-commands/, "the React bundle must not inline its own copies");
  assert.match(vite, /external: \[SHARED_MODULE\]/);
});

test("views no longer read runtime values back from page text", async () => {
  const meter = await source("runtime-speed.js");
  const adapter = await source("simulation-react-adapter.ts");
  assert.doesNotMatch(meter, /scientificTime\.textContent|runState\.textContent/);
  assert.doesNotMatch(adapter, /(runState|seed|actualSpeed|scientificTime|physicsTicks|controlUpdates)\.textContent/);
  assert.doesNotMatch(adapter, /MutationObserver|addEventListener/, "the panel watches the model, not the page");
  assert.match(adapter, /runtimeModel\.subscribe\(/);
});
