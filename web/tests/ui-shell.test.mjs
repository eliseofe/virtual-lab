import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");

async function text(relative) {
  return readFile(path.join(web, relative), "utf8");
}

function editableConfig(main) {
  const match = main.match(/const defaultConfigSource = `([\s\S]*?)`;\n/);
  assert.ok(match, "defaultConfigSource must be present");
  return match[1];
}

test("Round 1 UI exposes experiment config, initializer source, controller source, simulation stage, controls, runtime speed, and run seed", async () => {
  const html = await text("src/index.html");
  for (const required of [
    'id="experiment-select"', 'id="experiment-config"', 'id="initializer-source"', 'id="apply-setup"',
    'id="simulation-canvas"', 'id="controller-source"', 'id="run"', 'id="pause"', 'id="restart"', 'id="restart-new-seed"', 'id="compile"',
    'id="simulation-speed"', 'id="simulation-speed-value"', 'id="actual-simulation-speed"', 'id="run-seed"',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Restart same seed/);
  assert.match(html, /New seed &amp; restart/);
  assert.match(html, /value="20"/);
  assert.match(html, /Actual speed is measured from model time versus wall time and does not affect the simulation/);
  assert.doesNotMatch(html, /id="initialization-seed"/);
  assert.doesNotMatch(html, /id="initialization-agent-count"/);
});

test("student config exposes only active experiment and controller parameters", async () => {
  const main = await text("src/main.js");
  const config = editableConfig(main);
  for (const parameter of [
    "N", "ARENA_SIZE", "INITIAL_POSITION_NOISE", "CONTROL_DT", "SENSOR_NOISE", "EXPERIMENT_DURATION",
    "U", "OMEGA_MAX", "K1", "K2", "POTENTIAL_ALPHA", "POTENTIAL_EPSILON", "DESIRED_DISTANCE", "PROXIMAL_RANGE",
  ]) assert.match(config, new RegExp(`(?:^|\\n)${parameter} = `));

  for (const hiddenOrRemoved of [
    "PHYSICS_DT", "METRIC_DT", "NEIGHBOUR_RADIUS", "HEX_RADIUS", "HEX_SPACING", "HEX_POSITION_JITTER", "RANDOM_EXTENT",
    "RHO_INFORMED", "K3", "WHEEL_BASE", "ALIGNMENT_RANGE", "RUN_COUNT", "V0 = U", "ALPHA = K1", "BETA = K2",
    "SPRING_K", "SPRING_L", "DR =", "DTHETA", "SEED =",
  ]) assert.doesNotMatch(config, new RegExp(hiddenOrRemoved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(main, /def hexagon_perturbed\(config, rng, place\):/);
  assert.match(main, /def random_uniform\(config, rng, place\):/);
  assert.match(main, /config\.DESIRED_DISTANCE/);
  assert.match(main, /config\.ARENA_SIZE/);
  assert.match(main, /place\(i, x, y, theta\)/);
});

test("2012 controller source contains proximal potential and MDMC parameters without legacy aliases", async () => {
  const main = await text("src/main.js");
  assert.match(main, /sigma_lj = DESIRED_DISTANCE \/ pow\(2\.0, 1\.0 \/ POTENTIAL_ALPHA\)/);
  assert.match(main, /magnitude = -\(4\.0 \* POTENTIAL_ALPHA \* POTENTIAL_EPSILON \/ distance\)/);
  assert.match(main, /forward = K1 \* dot\(proximal, obs\.heading\) \+ U/);
  assert.match(main, /turning = K2 \* dot\(proximal, perpendicular\(obs\.heading\)\)/);
});

test("renderer uses fixed arena coordinates and renders agent orientation", async () => {
  const main = await text("src/main.js");
  assert.match(main, /activeArenaSize/);
  assert.match(main, /latestState\[i \+ 2\]/);
  assert.match(main, /Math\.cos\(heading\)/);
  assert.match(main, /Math\.sin\(heading\)/);
  assert.doesNotMatch(main, /Math\.min\(\.\.\.xs\)/);
  assert.doesNotMatch(main, /Math\.max\(\.\.\.xs\)/);
  assert.match(main, /requestAnimationFrame\(drawSnapshot\)/);
});

test("runtime speed changes execution throughput without becoming a scientific parameter", async () => {
  const main = await text("src/main.js");
  const config = editableConfig(main);
  assert.match(main, /const RUNTIME_INTERVAL_MS = 50/);
  assert.match(main, /function runtimeSpeed\(\)/);
  assert.match(main, /function ticksPerAdvance\(\)/);
  assert.match(main, /worker\.postMessage\(\{ type: "advance", ticks: ticksPerAdvance\(\) \}\)/);
  assert.match(main, /ui\.speed\.addEventListener\("input", updateSpeedLabel\)/);
  assert.doesNotMatch(config, /RUNTIME_INTERVAL_MS|runtimeSpeed|simulation-speed/);
});

test("run seed is simulator provenance with explicit reproducible and randomized restart paths", async () => {
  const main = await text("src/main.js");
  const worker = await text("src/worker.js");
  const config = editableConfig(main);
  assert.match(main, /let activeSeed = INTERNAL_SEED/);
  assert.match(main, /globalThis\.crypto\.getRandomValues/);
  assert.match(main, /ui\.restartNewSeed\.addEventListener/);
  assert.match(main, /configSource: appliedConfigSource/);
  assert.match(main, /initializerSource: appliedInitializerSource/);
  assert.match(worker, /seed: activeSeed/);
  assert.doesNotMatch(config, /SEED\s*=/);
});

test("hidden simulator settings stay outside the editable config namespace", async () => {
  const main = await text("src/main.js");
  const config = editableConfig(main);
  assert.match(main, /const INTERNAL_SEED = 2026/);
  assert.match(main, /const INTERNAL_PHYSICS_DT = 0\.01/);
  assert.match(main, /const INTERNAL_METRIC_DT = 0\.10/);
  assert.doesNotMatch(config, /INTERNAL_SEED|INTERNAL_PHYSICS_DT|INTERNAL_METRIC_DT/);
});

test("setup and controller application use separate worker paths", async () => {
  const main = await text("src/main.js");
  const worker = await text("src/worker.js");
  assert.match(main, /type: "apply-setup"/);
  assert.match(main, /type: "apply-controller"/);
  assert.match(worker, /simulation\.set_setup/);
  assert.match(worker, /simulation\.set_controller/);
  assert.match(worker, /simulation\.snapshot_state/);
});

test("worker startup failures are surfaced instead of leaving a loading status forever", async () => {
  const main = await text("src/main.js");
  assert.match(main, /worker\.addEventListener\("error"/);
  assert.match(main, /Worker load error/);
});

test("invalid source path preserves the current valid controller", async () => {
  const main = await text("src/main.js");
  assert.match(main, /Compilation failed\. Current valid controller was not replaced\./);
  assert.match(main, /compileController\(ui\.source\.value/);
});
