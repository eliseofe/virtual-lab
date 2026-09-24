// Replays the behaviour-preservation references (#425) on the production
// WebAssembly kernel, the one the browser actually runs, and compares
// trajectories and metric samples bit-for-bit with recorded expectations.
//
// WebAssembly expectations are recorded separately from the native ones in
// crates/kernel/tests/reference/: transcendental math (pow, sin, cos, ...)
// differs in the last digits between the native and WebAssembly math
// libraries, so the two backends agree to ~1e-13 but not bit-for-bit. Each
// reference still detects any change on its own backend.
//
//   node web/scripts/reference-runs-wasm.mjs [--update] [path/to/vlab_kernel.js]
// Default kernel: web/public/wasm/vlab_kernel.js (built by wasm-pack in CI).

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const inputDir = path.resolve(here, "../tests/fixtures/reference");
const expectedDir = path.resolve(here, "../../crates/kernel/tests/reference/wasm");
const args = process.argv.slice(2);
const update = args.includes("--update");
const kernelArg = args.find((arg) => !arg.startsWith("--"));
const kernelJs = path.resolve(kernelArg ?? path.join(here, "../public/wasm/vlab_kernel.js"));

// Must match CHUNKINGS in crates/kernel/tests/reference_runs.rs.
const CHUNKINGS = [100, 7];

function fromBits(hex) {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(hex));
  return view.getFloat64(0);
}

function toBits(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return `0x${view.getBigUint64(0).toString(16).padStart(16, "0")}`;
}

// Same textual extraction as the Rust test, so samples compare exactly.
function drainSamples(simulation, out) {
  const batch = simulation.drain_metric_samples_json(0xffffffff);
  const start = batch.indexOf("\"samples\":[") + "\"samples\":[".length;
  const end = batch.indexOf("],\"buffer\"", start);
  const samples = batch.slice(start, end);
  if (!samples) return;
  for (const sample of samples.slice(1, -1).split("},{")) out.push(`{${sample}}`);
}

function run(wasm, reference, chunk) {
  const k = reference.kernel_input;
  const simulation = new wasm.MetricProbeSimulation(
    k.initial_state_json,
    k.world_references_json,
    k.seed,
    fromBits(k.physics_dt_bits),
    fromBits(k.control_dt_bits),
    fromBits(k.metric_dt_bits),
    fromBits(k.interaction_radius_bits),
    fromBits(k.arena_size_bits),
    fromBits(k.sensor_noise_bits),
    fromBits(k.max_forward_speed_bits),
    fromBits(k.max_angular_speed_bits),
    k.environment_ir_json,
    k.controller_ir_json,
    k.metrics_ir_json,
    k.parameters_json,
  );
  try {
    const samples = [];
    let remaining = reference.ticks;
    while (remaining > 0) {
      const step = Math.min(remaining, chunk);
      simulation.advance_ticks(step);
      drainSamples(simulation, samples);
      remaining -= step;
    }
    simulation.finalize_metrics();
    drainSamples(simulation, samples);
    // Keys in serde_json's sorted order so the text matches the Rust output.
    return {
      control_updates: simulation.control_updates(),
      final_state_bits: Array.from(simulation.snapshot_state(), toBits),
      metric_samples: samples,
      neighbour_strategy: simulation.neighbour_strategy(),
      physics_ticks: simulation.physics_ticks(),
      scientific_time_bits: toBits(simulation.scientific_time()),
    };
  } finally {
    simulation.free();
  }
}

const wasm = await import(pathToFileURL(kernelJs).href);
await wasm.default({ module_or_path: await readFile(kernelJs.replace(/\.js$/, "_bg.wasm")) });

const files = (await readdir(inputDir)).filter((name) => name.endsWith(".json")).sort();
if (!files.length) throw new Error(`no reference inputs in ${inputDir}`);
const failures = [];
for (const file of files) {
  const reference = JSON.parse(await readFile(path.join(inputDir, file), "utf8"));
  const texts = CHUNKINGS.map((chunk) => `${JSON.stringify(run(wasm, reference, chunk), null, 2)}\n`);
  if (texts.some((text) => text !== texts[0])) {
    failures.push(`${reference.id}: result depends on advance chunking`);
    continue;
  }
  const expectedPath = path.join(expectedDir, `${reference.id}.expected.json`);
  if (update) {
    await mkdir(expectedDir, { recursive: true });
    await writeFile(expectedPath, texts[0]);
    continue;
  }
  const expected = await readFile(expectedPath, "utf8").catch(() => null);
  if (expected === null) failures.push(`${reference.id}: no recorded expectation`);
  else if (expected !== texts[0]) failures.push(`${reference.id}: WebAssembly result differs from the recorded reference`);
}
if (failures.length) {
  console.error(`WebAssembly reference runs failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(update
  ? `Recorded ${files.length} WebAssembly reference expectations.`
  : `All ${files.length} reference runs are bit-identical on the WebAssembly kernel.`);
