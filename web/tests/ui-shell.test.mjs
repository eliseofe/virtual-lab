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

test("Round 1 UI exposes open-ended config, initializer source, controller source, simulation stage, and controls", async () => {
  const html = await text("src/index.html");
  for (const required of [
    'id="experiment-select"',
    'id="experiment-config"',
    'id="initializer-source"',
    'id="apply-setup"',
    'id="simulation-canvas"',
    'id="controller-source"',
    'id="run"',
    'id="pause"',
    'id="restart"',
    'id="compile"',
  ]) {
    assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(html, /id="initialization-seed"/);
  assert.doesNotMatch(html, /id="initialization-agent-count"/);
});

test("startup source pre-populates the experiment and both initialization methods", async () => {
  const main = await text("src/main.js");
  assert.match(main, /const defaultConfigSource = `/);
  assert.match(main, /Adaptive Behavior \(2012\), Table 1/);
  for (const parameter of ["U", "OMEGA_MAX", "K1", "K2", "K3", "WHEEL_BASE", "POTENTIAL_ALPHA", "POTENTIAL_EPSILON", "DESIRED_DISTANCE", "PROXIMAL_RANGE", "ALIGNMENT_RANGE", "SENSOR_NOISE", "EXPERIMENT_DURATION", "RUN_COUNT"]) {
    assert.match(main, new RegExp(`\\n${parameter} = `));
  }
  assert.match(main, /def hexagon_perturbed\(config, rng, place\):/);
  assert.match(main, /def random_uniform\(config, rng, place\):/);
  assert.match(main, /place\(i, x, y, theta\)/);
  assert.match(main, /ui\.config\.value = defaultConfigSource/);
  assert.match(main, /ui\.initializerSource\.value = defaultInitializerSource/);
});

test("renderer consumes snapshots and scientific advancement stays in worker messages", async () => {
  const main = await text("src/main.js");
  assert.match(main, /requestAnimationFrame\(drawSnapshot\)/);
  assert.match(main, /postMessage\(\{ type: "advance", ticks: 5 \}\)/);
  assert.doesNotMatch(main, /scientificTime\s*\+=/);
});

test("setup and controller application use separate worker paths", async () => {
  const main = await text("src/main.js");
  const worker = await text("src/worker.js");
  assert.match(main, /type: "apply-setup"/);
  assert.match(main, /type: "apply-controller"/);
  assert.match(worker, /simulation\.set_setup/);
  assert.match(worker, /simulation\.set_controller/);
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
