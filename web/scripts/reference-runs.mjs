// Behaviour-preservation reference for compilation (#425).
//
// Compiles every reference Experiment through the same steps the browser uses
// (main.js compileSetup/compileControllerFor and metrics-runtime-bridge.js) and
// records the compiled artifacts plus the exact simulator input. The Rust test
// crates/kernel/tests/reference_runs.rs replays that input and compares the
// trajectory and metric samples bit-for-bit.
//
//   node web/scripts/reference-runs.mjs           check recorded references
//   node web/scripts/reference-runs.mjs --update  rewrite recorded references

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { REFERENCE_EXPERIMENTS } from "../tests/fixtures/reference-experiments.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REFERENCE_DIR = path.resolve(here, "../tests/fixtures/reference");

const COMPILER_ROOTS = {
  browser: {
    config: "../src/config/compiler.js",
    initializer: "../src/initializer/compiler.js",
    environment: "../src/environment/compiler.js",
    controller: "../src/controller/compiler.js",
    metrics: "../src/metrics/compiler.js",
    runtime: "../src/runtime/contract.js",
  },
  edge: {
    config: "../../supabase/functions/experiment-mcp/vendor/config-compiler.js",
    initializer: "../../supabase/functions/experiment-mcp/vendor/initializer-compiler.js",
    environment: "../../supabase/functions/experiment-mcp/vendor/environment-compiler.js",
    controller: "../../supabase/functions/experiment-mcp/vendor/controller-compiler.js",
    metrics: "../../supabase/functions/experiment-mcp/vendor/metrics-compiler.js",
    runtime: "../../supabase/functions/experiment-mcp/vendor/runtime-contract.js",
  },
};

export async function loadCompilers(kind = "browser") {
  const roots = COMPILER_ROOTS[kind];
  const load = (relative) => import(pathToFileURL(path.resolve(here, relative)).href);
  const [config, initializer, environment, controller, metrics, runtime] = await Promise.all([
    load(roots.config), load(roots.initializer), load(roots.environment),
    load(roots.controller), load(roots.metrics), load(roots.runtime),
  ]);
  return {
    compileConfig: config.compileConfig,
    numericParameters: config.numericParameters,
    compileInitializer: initializer.compileInitializer,
    compileEnvironmentScalar: environment.compileEnvironmentScalar,
    validateEnvironmentControllerPair: environment.validateEnvironmentControllerPair,
    compileController: controller.compileController,
    compileMetrics: metrics.compileMetrics,
    validateRuntimeValues: runtime.validateRuntimeValues,
    validateInitialStateForRuntime: runtime.validateInitialStateForRuntime,
    simulationSetupFromRuntime: runtime.simulationSetupFromRuntime,
  };
}

// Mirrors the browser path. Keep in step with main.js and
// metrics-runtime-bridge.js until that wiring is extracted into one module.
export function compileReferenceExperiment(experiment, c) {
  const { configuration, initialization, controller, metrics } = experiment.artifacts;
  const seed = experiment.seed >>> 0;

  const config = c.compileConfig(configuration);
  const runtime = c.validateRuntimeValues(config.values);
  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
  const initializer = c.compileInitializer(initialization, initializerConfig);
  c.validateInitialStateForRuntime(initializer.state, runtime);
  const environment = c.compileEnvironmentScalar(initialization, initializerConfig);
  const references = initializer.world_references?.references?.map(({ name }) => name) ?? [];
  const setup = c.simulationSetupFromRuntime(runtime, seed, initializer.state, environment, initializer.world_references);

  const parameters = c.numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const controllerIr = c.compileController(controller, { parameters: parameterTypes, references });
  c.validateEnvironmentControllerPair(environment, controllerIr);

  const agentState = Array.isArray(controllerIr.state)
    ? Object.fromEntries(controllerIr.state.map(({ name, type }) => [name, type]))
    : {};
  const metricsIr = c.compileMetrics(metrics, {
    parameters: parameterTypes,
    references,
    agentState,
    runtimeCapabilities: environment ? ["environment_scalar"] : [],
  });

  // Arguments of MetricProbeSimulation::new, in order, exactly as worker.js
  // builds them. JSON-valued arguments are passed as strings; f64 arguments
  // as exact bit patterns.
  const simulation = setup.simulation;
  const kernelInput = {
    initial_state_json: JSON.stringify(setup.initialState),
    world_references_json: JSON.stringify(setup.worldReferences),
    seed: simulation.seed,
    physics_dt_bits: f64Bits(simulation.physicsDt),
    control_dt_bits: f64Bits(simulation.controlDt),
    metric_dt_bits: f64Bits(simulation.metricDt),
    interaction_radius_bits: f64Bits(simulation.interactionRadius),
    arena_size_bits: f64Bits(simulation.arenaSize),
    sensor_noise_bits: f64Bits(simulation.sensorNoise),
    max_forward_speed_bits: f64Bits(simulation.maxForwardSpeed),
    max_angular_speed_bits: f64Bits(simulation.maxAngularSpeed),
    environment_ir_json: JSON.stringify(setup.environment),
    controller_ir_json: JSON.stringify(controllerIr),
    metrics_ir_json: JSON.stringify(metricsIr),
    parameters_json: JSON.stringify(parameters),
  };

  return {
    id: experiment.id,
    purpose: experiment.purpose,
    ticks: experiment.ticks,
    compiled: { config, initializer, environment, controller: controllerIr, metrics: metricsIr },
    kernel_input: kernelInput,
  };
}

// Numbers reach the kernel as exact f64 values through wasm-bindgen, not as
// decimal text, so record their exact bit patterns.
export function f64Bits(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return `0x${view.getBigUint64(0).toString(16).padStart(16, "0")}`;
}

export function referencePath(id) {
  return path.join(REFERENCE_DIR, `${id}.json`);
}

export function serializeReference(reference) {
  return `${JSON.stringify(reference, null, 2)}\n`;
}

async function main() {
  const update = process.argv.includes("--update");
  const compilers = await loadCompilers("browser");
  await mkdir(REFERENCE_DIR, { recursive: true });
  const mismatches = [];
  for (const experiment of REFERENCE_EXPERIMENTS) {
    const text = serializeReference(compileReferenceExperiment(experiment, compilers));
    const file = referencePath(experiment.id);
    if (update) {
      await writeFile(file, text);
      console.log(`recorded ${path.relative(process.cwd(), file)}`);
      continue;
    }
    const recorded = await readFile(file, "utf8").catch(() => null);
    if (recorded !== text) mismatches.push(experiment.id);
  }
  if (mismatches.length) {
    console.error(`Compiled reference differs for: ${mismatches.join(", ")}`);
    process.exit(1);
  }
  if (!update) console.log(`All ${REFERENCE_EXPERIMENTS.length} compiled references match.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
