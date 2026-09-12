import { compileController } from "./controller/compiler.js";
import { compileConfig, numericParameters } from "./config/compiler.js";
import { compileInitializer } from "./initializer/compiler.js";
import {
  RUNTIME_CONTRACT,
  simulationSetupFromRuntime,
  validateInitialStateForRuntime,
  validateRuntimeValues,
} from "./runtime/contract.js";

// Simulator-owned implementation settings. These are deliberately not part of
// the student experiment parameter namespace.
const INTERNAL_SEED = 2026;
const INTERNAL_PHYSICS_DT = RUNTIME_CONTRACT.simulator_constants.PHYSICS_DT;
const RUNTIME_INTERVAL_MS = 50;

const defaultConfigSource = `# EXPERIMENT SETUP
# Number of agents.
N = 91
# Side length of the square arena in model distance units. Boundaries are periodic.
ARENA_SIZE = 10.0
# Initialization method: "hexagon_perturbed" or "random".
INITIALIZATION_METHOD = "hexagon_perturbed"
# Maximum independent x/y displacement added to each hex-lattice position.
# 0.0 gives a perfect lattice.
INITIAL_POSITION_NOISE = 0.0
# Controller update period (s). Ferrante et al. (2012) use 0.1 s.
CONTROL_DT = 0.1
# Bearing-noise parameter from Ferrante et al. (2012).
# The simulator applies a uniform bearing perturbation in [-2*pi*sigma, +2*pi*sigma].
SENSOR_NOISE = 0.1
# Experiment duration (s).
EXPERIMENT_DURATION = 25000.0

# CONTROLLER PARAMETERS — Ferrante et al. (2012), MDMC + proximal control
# Maximum forward speed (distance units/s); the 2012 numeric default corresponds to m/s.
U = 0.005
# Maximum angular speed (rad/s).
OMEGA_MAX = 1.5707963267948966
# MDMC gains.
K1 = 0.005
K2 = 0.06
# Generalized Lennard-Jones proximal-control parameters.
POTENTIAL_ALPHA = 2.0
POTENTIAL_EPSILON = 1.5
# Desired inter-agent distance. Hex-lattice spacing is derived from this value.
DESIRED_DISTANCE = 0.45
# Maximum range of proximal interaction.
PROXIMAL_RANGE = 0.81
`;

const defaultInitializerSource = `def hexagon_perturbed(config, rng, place):
    # Hexagonal-lattice radius derived from N.
    radius = ceil((sqrt(12.0 * config.N - 3.0) - 3.0) / 6.0)
    i = 0
    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            s = -q - r
            if max(abs(q), abs(r), abs(s)) <= radius:
                if i < config.N:
                    x = config.DESIRED_DISTANCE * (q + 0.5 * r)
                    y = config.DESIRED_DISTANCE * SQRT3_OVER_2 * r
                    x += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    y += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    theta = rng.uniform(0.0, TAU)
                    place(i, x, y, theta)
                    i += 1

def random_uniform(config, rng, place):
    half = config.ARENA_SIZE / 2.0
    for i in range(config.N):
        x = rng.uniform(-half, half)
        y = rng.uniform(-half, half)
        theta = rng.uniform(0.0, TAU)
        place(i, x, y, theta)

def initialize(config, rng, place):
    if config.INITIALIZATION_METHOD == "hexagon_perturbed":
        hexagon_perturbed(config, rng, place)
    elif config.INITIALIZATION_METHOD == "random":
        random_uniform(config, rng, place)
`;

const referenceSource = `class ActiveElasticAgent(Agent):
    def step(self, obs):
        proximal = Vec2(0.0, 0.0)
        sigma_lj = DESIRED_DISTANCE / pow(2.0, 1.0 / POTENTIAL_ALPHA)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            ratio = sigma_lj / distance
            magnitude = -(4.0 * POTENTIAL_ALPHA * POTENTIAL_EPSILON / distance) * (2.0 * pow(ratio, 2.0 * POTENTIAL_ALPHA) - pow(ratio, POTENTIAL_ALPHA))
            proximal += magnitude * displacement / distance
        forward = K1 * dot(proximal, obs.heading) + U
        turning = K2 * dot(proximal, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

const ui = {
  status: document.querySelector("#worker-status"),
  runState: document.querySelector("#run-state"),
  time: document.querySelector("#scientific-time"),
  physicsTicks: document.querySelector("#physics-ticks"),
  controlUpdates: document.querySelector("#control-updates"),
  speed: document.querySelector("#simulation-speed"),
  speedValue: document.querySelector("#simulation-speed-value"),
  runSeed: document.querySelector("#run-seed"),
  config: document.querySelector("#experiment-config"),
  initializerSource: document.querySelector("#initializer-source"),
  initializerIr: document.querySelector("#initializer-ir"),
  setupError: document.querySelector("#setup-error"),
  setupFeedback: document.querySelector("#setup-feedback"),
  applySetup: document.querySelector("#apply-setup"),
  source: document.querySelector("#controller-source"),
  ir: document.querySelector("#controller-ir"),
  error: document.querySelector("#compile-error"),
  feedback: document.querySelector("#compile-feedback"),
  run: document.querySelector("#run"),
  pause: document.querySelector("#pause"),
  restart: document.querySelector("#restart"),
  restartNewSeed: document.querySelector("#restart-new-seed"),
  compile: document.querySelector("#compile"),
  canvas: document.querySelector("#simulation-canvas"),
  canvasEmpty: document.querySelector("#canvas-empty"),
};

for (const [name, element] of Object.entries(ui)) {
  if (!element) throw new Error(`Virtual Lab UI mismatch: missing element '${name}'`);
}

ui.config.value = defaultConfigSource;
ui.initializerSource.value = defaultInitializerSource;
ui.source.value = referenceSource;

let wasmReady = false;
let initialized = false;
let running = false;
let advancePending = false;
let latestState = [];
let activeArenaSize = 10.0;
let activeSeed = INTERNAL_SEED;
let appliedConfig = null;
let appliedConfigSource = defaultConfigSource;
let appliedInitializerSource = defaultInitializerSource;
let appliedController = null;
let pendingSetup = null;
let pendingController = null;
let runTimer = null;

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

function setFeedback(element, message, state = "idle") {
  element.textContent = message;
  element.dataset.state = state;
}

// Temporary compatibility adapter for the pre-#63 built-in Active Elastic
// configuration. These aliases stay in the production browser only; they are
// intentionally absent from the science-free MCP authoring contract. Registry
// experiments must use the generic runtime names directly.
function runtimeValuesForCurrentBuiltIn(values) {
  return {
    ...values,
    INTERACTION_RADIUS: values.INTERACTION_RADIUS ?? values.PROXIMAL_RANGE,
    MAX_FORWARD_SPEED: values.MAX_FORWARD_SPEED ?? values.U,
    MAX_ANGULAR_SPEED: values.MAX_ANGULAR_SPEED ?? values.OMEGA_MAX,
  };
}

function compileSetup({ seed = activeSeed, configSource = ui.config.value, initializerSource = ui.initializerSource.value } = {}) {
  const config = compileConfig(configSource);
  const runtime = validateRuntimeValues(runtimeValuesForCurrentBuiltIn(config.values));

  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
  const initializer = compileInitializer(initializerSource, initializerConfig);
  validateInitialStateForRuntime(initializer.state, runtime);

  ui.initializerIr.textContent = JSON.stringify({
    version: initializer.version,
    runtimeContract: runtime.version,
    method: initializer.method,
    seed,
    agentCount: initializer.state.length,
    arenaSize: runtime.arenaSize,
    firstAgents: initializer.state.slice(0, 5),
  }, null, 2);

  return {
    config,
    setup: simulationSetupFromRuntime(runtime, seed, initializer.state),
  };
}

function compileControllerFor(config) {
  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const compiled = compileController(ui.source.value, { parameters: parameterTypes });
  ui.ir.textContent = JSON.stringify(compiled, null, 2);
  return { compiled, parameters };
}

function setControlsEnabled(enabled) {
  ui.run.disabled = !enabled || running;
  ui.pause.disabled = !enabled || !running;
  ui.restart.disabled = !enabled;
  ui.restartNewSeed.disabled = !enabled;
  ui.compile.disabled = !enabled;
  ui.applySetup.disabled = !enabled;
  ui.speed.disabled = !enabled;
}

function runtimeSpeed() {
  const speed = Number(ui.speed.value);
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function ticksPerAdvance() {
  const wallSecondsPerRequest = RUNTIME_INTERVAL_MS / 1000;
  return Math.max(1, Math.round((wallSecondsPerRequest * runtimeSpeed()) / INTERNAL_PHYSICS_DT));
}

function updateSpeedLabel() {
  ui.speedValue.textContent = `${runtimeSpeed()}×`;
}

function updateSeedLabel() {
  ui.runSeed.textContent = String(activeSeed >>> 0);
}

function randomSeedDifferentFromCurrent() {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  let next = value[0] >>> 0;
  if (next === (activeSeed >>> 0)) next = (next + 1) >>> 0;
  return next;
}

function setRunning(next) {
  running = next;
  ui.runState.textContent = running ? "Running" : "Paused";
  setControlsEnabled(initialized);
  if (runTimer) { clearInterval(runTimer); runTimer = null; }
  if (running) {
    runTimer = setInterval(() => {
      if (!advancePending) {
        advancePending = true;
        worker.postMessage({ type: "advance", ticks: ticksPerAdvance() });
      }
    }, RUNTIME_INTERVAL_MS);
  }
}

function initializeIfReady() {
  if (!wasmReady || initialized) return;
  try {
    const { config, setup } = compileSetup({ seed: activeSeed });
    const controller = compileControllerFor(config);
    appliedConfig = config;
    appliedConfigSource = ui.config.value;
    appliedInitializerSource = ui.initializerSource.value;
    appliedController = controller;
    activeArenaSize = setup.simulation.arenaSize;
    ui.setupError.textContent = "";
    ui.error.textContent = "";
    updateSeedLabel();
    setFeedback(ui.setupFeedback, "Configuration and initializer valid.", "success");
    setFeedback(ui.feedback, "Controller valid.", "success");
    ui.status.textContent = "Starting simulation…";
    worker.postMessage({ type: "initialize", setup, ir: controller.compiled, parameters: controller.parameters });
    initialized = true;
  } catch (error) {
    initialized = false;
    ui.setupError.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.setupFeedback, "Configuration or initializer is invalid.", "error");
    ui.status.textContent = "Experiment setup error";
    ui.status.dataset.state = "error";
  }
}

function updateSnapshot(message) {
  if (Array.isArray(message.state) || ArrayBuffer.isView(message.state)) {
    latestState = Array.from(message.state);
    ui.canvasEmpty.hidden = latestState.length > 0;
  }
  if (Number.isFinite(message.arenaSize)) activeArenaSize = Number(message.arenaSize);
  if (Number.isInteger(message.seed)) {
    activeSeed = Number(message.seed) >>> 0;
    updateSeedLabel();
  }
  const scientificTime = Number(message.scientificTime ?? 0);
  ui.time.textContent = scientificTime.toFixed(3);
  ui.physicsTicks.textContent = String(message.physicsTicks ?? 0);
  ui.controlUpdates.textContent = String(message.controlUpdates ?? 0);
  advancePending = false;
  const duration = appliedConfig?.values?.EXPERIMENT_DURATION;
  if (running && Number.isFinite(duration) && scientificTime >= duration) {
    setRunning(false);
    ui.status.textContent = `Run complete (${duration} s)`;
  }
}

function drawSnapshot() {
  const canvas = ui.canvas;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f7f9fa";
  context.fillRect(0, 0, width, height);

  const pad = 30 * ratio;
  const side = Math.max(1, Math.min(width, height) - 2 * pad);
  const left = (width - side) / 2;
  const top = (height - side) / 2;
  context.fillStyle = "#ffffff";
  context.fillRect(left, top, side, side);

  const arena = Math.max(activeArenaSize, 1e-9);
  const toCanvasX = (x) => left + ((x + arena / 2) / arena) * side;
  const toCanvasY = (y) => top + ((arena / 2 - y) / arena) * side;

  // Scientific scale reference only: this visual grid is unrelated to the
  // simulator's internal neighbour-search index. At ordinary zoom, one square
  // is exactly one model distance unit. Very large arenas coarsen the visual
  // grid only to avoid drawing sub-pixel lines.
  const pixelsPerUnit = side / arena;
  const visualGridStep = Math.max(1, Math.ceil((3 * ratio) / Math.max(pixelsPerUnit, 1e-9)));
  const halfArena = arena / 2;
  const firstGrid = Math.ceil(-halfArena / visualGridStep) * visualGridStep;
  context.beginPath();
  for (let value = firstGrid; value <= halfArena + 1e-9; value += visualGridStep) {
    const x = toCanvasX(value);
    const y = toCanvasY(value);
    context.moveTo(x, top);
    context.lineTo(x, top + side);
    context.moveTo(left, y);
    context.lineTo(left + side, y);
  }
  context.strokeStyle = "#e4e9ec";
  context.lineWidth = 1 * ratio;
  context.stroke();

  context.strokeStyle = "#b8c3c8";
  context.lineWidth = 1.5 * ratio;
  context.strokeRect(left, top, side, side);
  context.fillStyle = "#65747b";
  context.font = `${11 * ratio}px system-ui, sans-serif`;
  context.textBaseline = "top";
  context.fillText(
    visualGridStep === 1 ? "Grid: 1 unit" : `Grid: ${visualGridStep} units`,
    left + 7 * ratio,
    top + 7 * ratio,
  );

  context.strokeStyle = "#1c4e63";
  context.fillStyle = "#1c4e63";
  context.lineWidth = 1.6 * ratio;
  const bodyRadius = 4.2 * ratio;
  const headingLength = 11 * ratio;
  for (let i = 0; i + 2 < latestState.length; i += 3) {
    const x = toCanvasX(latestState[i]);
    const y = toCanvasY(latestState[i + 1]);
    const heading = latestState[i + 2];
    context.beginPath();
    context.arc(x, y, bodyRadius, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(heading) * headingLength, y - Math.sin(heading) * headingLength);
    context.stroke();
  }
  requestAnimationFrame(drawSnapshot);
}

worker.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "wasm-ready") {
    wasmReady = true;
    ui.status.textContent = "Preparing experiment…";
    initializeIfReady();
    return;
  }
  if (message.type === "ready") {
    ui.status.textContent = "Simulator ready";
    ui.status.dataset.state = "ready";
    ui.runState.textContent = "Paused";
    setControlsEnabled(true);
    return;
  }
  if (["snapshot", "advanced", "reset", "controller-applied", "setup-applied"].includes(message.type)) {
    updateSnapshot(message);
    if (message.type === "controller-applied") {
      if (pendingController) appliedController = pendingController;
      pendingController = null;
      setFeedback(ui.feedback, "Controller applied. Run restarted.", "success");
      ui.status.textContent = "Controller applied";
      setRunning(false);
    } else if (message.type === "setup-applied") {
      if (pendingSetup) {
        appliedConfig = pendingSetup.config;
        appliedConfigSource = pendingSetup.configSource;
        appliedInitializerSource = pendingSetup.initializerSource;
        appliedController = pendingSetup.controller;
      }
      pendingSetup = null;
      setFeedback(ui.setupFeedback, "Configuration applied. Run restarted.", "success");
      ui.status.textContent = "Configuration applied";
      setRunning(false);
    } else if (message.type === "reset") {
      ui.status.textContent = `Run restarted · seed ${activeSeed}`;
      setRunning(false);
    }
    return;
  }
  if (message.type === "setup-error") {
    advancePending = false;
    pendingSetup = null;
    ui.setupError.textContent = message.message;
    setFeedback(ui.setupFeedback, "Could not apply configuration.", "error");
    ui.status.textContent = "Configuration error";
    ui.status.dataset.state = "error";
    setRunning(false);
    return;
  }
  if (message.type === "controller-runtime-error") {
    advancePending = false;
    pendingController = null;
    ui.error.textContent = `Controller initialization: ${message.message}`;
    setFeedback(ui.feedback, "Could not apply controller. Previous controller remains active.", "error");
    ui.status.textContent = "Controller error";
    ui.status.dataset.state = "error";
    setRunning(false);
    return;
  }
  if (message.type === "error") {
    advancePending = false;
    ui.status.textContent = `Simulation error: ${message.message}`;
    ui.status.dataset.state = "error";
    setRunning(false);
  }
});

worker.addEventListener("error", (event) => {
  ui.status.textContent = `Simulator error: ${event.message || "failed to start"}`;
  ui.status.dataset.state = "error";
  ui.setupError.textContent = event.message || "Simulator failed to start.";
  setFeedback(ui.setupFeedback, "Simulator failed to start.", "error");
});

function markSetupDirty() {
  ui.setupError.textContent = "";
  setFeedback(ui.setupFeedback, "Changes pending. Apply & restart to use them.", "dirty");
}
ui.config.addEventListener("input", markSetupDirty);
ui.initializerSource.addEventListener("input", markSetupDirty);

ui.applySetup.addEventListener("click", () => {
  try {
    const configSource = ui.config.value;
    const initializerSource = ui.initializerSource.value;
    const { config, setup } = compileSetup({ seed: activeSeed, configSource, initializerSource });
    const controller = compileControllerFor(config);
    pendingSetup = { config, configSource, initializerSource, controller };
    activeArenaSize = setup.simulation.arenaSize;
    ui.setupError.textContent = "";
    ui.error.textContent = "";
    setFeedback(ui.setupFeedback, "Applying changes…", "working");
    setRunning(false);
    worker.postMessage({ type: "apply-setup", setup, ir: controller.compiled, parameters: controller.parameters });
  } catch (error) {
    pendingSetup = null;
    ui.setupError.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.setupFeedback, "Could not apply changes. Previous configuration remains active.", "error");
  }
});

ui.compile.addEventListener("click", () => {
  try {
    if (!appliedConfig) throw new Error("No valid experiment configuration is active.");
    const controller = compileControllerFor(appliedConfig);
    pendingController = controller;
    ui.error.textContent = "";
    setFeedback(ui.feedback, "Applying controller…", "working");
    worker.postMessage({ type: "apply-controller", ir: controller.compiled, parameters: controller.parameters });
  } catch (error) {
    pendingController = null;
    ui.error.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.feedback, "Could not apply controller. Previous controller remains active.", "error");
  }
});

ui.source.addEventListener("input", () => {
  ui.error.textContent = "";
  setFeedback(ui.feedback, "Changes pending. Apply & restart to use them.", "dirty");
});

ui.speed.addEventListener("input", updateSpeedLabel);
updateSpeedLabel();
updateSeedLabel();
ui.run.addEventListener("click", () => setRunning(true));
ui.pause.addEventListener("click", () => setRunning(false));
ui.restart.addEventListener("click", () => {
  setRunning(false);
  worker.postMessage({ type: "reset" });
});
ui.restartNewSeed.addEventListener("click", () => {
  try {
    if (!appliedConfig || !appliedController) throw new Error("No valid experiment is active.");
    const seed = randomSeedDifferentFromCurrent();
    const { config, setup } = compileSetup({ seed, configSource: appliedConfigSource, initializerSource: appliedInitializerSource });
    pendingSetup = {
      config,
      configSource: appliedConfigSource,
      initializerSource: appliedInitializerSource,
      controller: appliedController,
    };
    ui.setupError.textContent = "";
    setFeedback(ui.setupFeedback, `Restarting with seed ${seed}…`, "working");
    setRunning(false);
    worker.postMessage({ type: "apply-setup", setup, ir: appliedController.compiled, parameters: appliedController.parameters });
  } catch (error) {
    pendingSetup = null;
    ui.setupError.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.setupFeedback, "Could not restart with a new seed.", "error");
  }
});

requestAnimationFrame(drawSnapshot);