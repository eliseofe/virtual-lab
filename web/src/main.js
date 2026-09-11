import { compileController } from "./controller/compiler.js";
import { compileConfig, numericParameters } from "./config/compiler.js";
import { compileInitializer } from "./initializer/compiler.js";

const defaultConfigSource = `# Simulator / run parameters
SEED = 2026
N = 91
PHYSICS_DT = 0.01
CONTROL_DT = 0.05
METRIC_DT = 0.10
NEIGHBOUR_RADIUS = 1.5

# Initialization parameters
INITIALIZATION_METHOD = "hexagon_perturbed"
HEX_RADIUS = 5
HEX_SPACING = 0.65
HEX_POSITION_JITTER = 0.0
RANDOM_EXTENT = 2.0

# Adaptive Behavior (2012), Table 1
# N tested in the paper: 10, 50, 100, 500, 1000
# RHO_INFORMED tested in the paper: 0.01, 0.05, 0.10, 0.15, 0.20
RHO_INFORMED = 0.0
U = 0.005
OMEGA_MAX = 1.5707963267948966
K1 = 0.5
K2 = 0.06
K3 = 0.25
WHEEL_BASE = 0.14
POTENTIAL_ALPHA = 2.0
POTENTIAL_EPSILON = 1.5
DESIRED_DISTANCE = 0.45
PROXIMAL_RANGE = 0.81
ALIGNMENT_RANGE = 2.0
SENSOR_NOISE = 0.1
EXPERIMENT_DURATION = 2500.0
RUN_COUNT = 100

# PRL/NJP motion-control aliases for the same roles
V0 = U
ALPHA = K1
BETA = K2

# Parameters still used by the current controller stub
# (kept explicit rather than hidden in the simulator)
SPRING_K = 5.0
SPRING_L = 0.65
DR = 0.158
DTHETA = 0.0
`;

const defaultInitializerSource = `def hexagon_perturbed(config, rng, place):
    radius = config.HEX_RADIUS
    i = 0
    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            s = -q - r
            if max(abs(q), abs(r), abs(s)) <= radius:
                if i < config.N:
                    x = config.HEX_SPACING * (q + 0.5 * r)
                    y = config.HEX_SPACING * SQRT3_OVER_2 * r
                    x += rng.uniform(-config.HEX_POSITION_JITTER, config.HEX_POSITION_JITTER)
                    y += rng.uniform(-config.HEX_POSITION_JITTER, config.HEX_POSITION_JITTER)
                    theta = rng.uniform(0.0, TAU)
                    place(i, x, y, theta)
                    i += 1

def random_uniform(config, rng, place):
    for i in range(config.N):
        x = rng.uniform(-config.RANDOM_EXTENT, config.RANDOM_EXTENT)
        y = rng.uniform(-config.RANDOM_EXTENT, config.RANDOM_EXTENT)
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
        force = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            force += SPRING_K * (distance - SPRING_L) * displacement / distance
        forward = V0 + ALPHA * dot(force, obs.heading)
        turning = BETA * dot(force, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

const ui = {
  status: document.querySelector("#worker-status"),
  runState: document.querySelector("#run-state"),
  time: document.querySelector("#scientific-time"),
  physicsTicks: document.querySelector("#physics-ticks"),
  controlUpdates: document.querySelector("#control-updates"),
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
let latestXY = [];
let appliedConfig = null;
let runTimer = null;

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

function setFeedback(element, message, state = "idle") {
  element.textContent = message;
  element.dataset.state = state;
}

function requireNumber(values, name, { integer = false, positive = false, nonnegative = false } = {}) {
  const value = values[name];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be numeric.`);
  if (integer && !Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  if (positive && value <= 0) throw new Error(`${name} must be positive.`);
  if (nonnegative && value < 0) throw new Error(`${name} must be non-negative.`);
  return value;
}

function compileSetup() {
  const config = compileConfig(ui.config.value);
  const values = config.values;
  requireNumber(values, "SEED", { integer: true, nonnegative: true });
  const agentCount = requireNumber(values, "N", { integer: true, positive: true });
  const physicsDt = requireNumber(values, "PHYSICS_DT", { positive: true });
  const controlDt = requireNumber(values, "CONTROL_DT", { positive: true });
  const metricDt = requireNumber(values, "METRIC_DT", { positive: true });
  const neighbourRadius = requireNumber(values, "NEIGHBOUR_RADIUS", { positive: true });
  const initializer = compileInitializer(ui.initializerSource.value, config);
  if (initializer.state.length !== agentCount) throw new Error(`Initializer produced ${initializer.state.length} agents, expected N=${agentCount}.`);
  ui.initializerIr.textContent = JSON.stringify({
    version: initializer.version,
    method: initializer.method,
    agentCount: initializer.state.length,
    firstAgents: initializer.state.slice(0, 5),
  }, null, 2);
  return {
    config,
    setup: {
      initialState: initializer.state,
      simulation: { physicsDt, controlDt, metricDt, neighbourRadius },
    },
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
  ui.compile.disabled = !enabled;
  ui.applySetup.disabled = !enabled;
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
        worker.postMessage({ type: "advance", ticks: 5 });
      }
    }, 50);
  }
}

function initializeIfReady() {
  if (!wasmReady || initialized) return;
  try {
    const { config, setup } = compileSetup();
    const controller = compileControllerFor(config);
    appliedConfig = config;
    ui.setupError.textContent = "";
    ui.error.textContent = "";
    setFeedback(ui.setupFeedback, "Configuration and initializer compiled successfully.", "success");
    setFeedback(ui.feedback, "Reference controller compiled successfully.", "success");
    ui.status.textContent = "Experiment compiled · starting kernel simulation…";
    worker.postMessage({ type: "initialize", setup, ir: controller.compiled, parameters: controller.parameters });
    initialized = true;
  } catch (error) {
    initialized = false;
    ui.setupError.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.setupFeedback, "Setup compilation failed.", "error");
    ui.status.textContent = "Setup error — see experiment parameters / initialization source";
    ui.status.dataset.state = "error";
  }
}

function updateSnapshot(message) {
  if (Array.isArray(message.xy) || ArrayBuffer.isView(message.xy)) {
    latestXY = Array.from(message.xy);
    ui.canvasEmpty.hidden = latestXY.length > 0;
  }
  ui.time.textContent = Number(message.scientificTime ?? 0).toFixed(3);
  ui.physicsTicks.textContent = String(message.physicsTicks ?? 0);
  ui.controlUpdates.textContent = String(message.controlUpdates ?? 0);
  advancePending = false;
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
  context.fillStyle = "#f7f9fa"; context.fillRect(0, 0, width, height);
  context.strokeStyle = "#e1e6e9"; context.lineWidth = ratio;
  const step = 48 * ratio;
  for (let x = step; x < width; x += step) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  for (let y = step; y < height; y += step) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  if (latestXY.length >= 2) {
    const xs = [], ys = [];
    for (let i = 0; i < latestXY.length; i += 2) { xs.push(latestXY[i]); ys.push(latestXY[i + 1]); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
    const pad = 54 * ratio;
    const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    context.fillStyle = "#1c4e63";
    for (let i = 0; i < latestXY.length; i += 2) {
      const x = width / 2 + (latestXY[i] - centerX) * scale;
      const y = height / 2 - (latestXY[i + 1] - centerY) * scale;
      context.beginPath(); context.arc(x, y, 4.2 * ratio, 0, Math.PI * 2); context.fill();
    }
  }
  requestAnimationFrame(drawSnapshot);
}

worker.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "wasm-ready") {
    wasmReady = true;
    ui.status.textContent = `Kernel ${message.kernelVersion} loaded · compiling experiment…`;
    initializeIfReady();
    return;
  }
  if (message.type === "ready") {
    ui.status.textContent = `Kernel ${message.kernelVersion} ready`;
    ui.status.dataset.state = "ready";
    ui.runState.textContent = "Paused";
    setControlsEnabled(true);
    return;
  }
  if (["snapshot", "advanced", "reset", "controller-applied", "setup-applied"].includes(message.type)) {
    updateSnapshot(message);
    if (message.type === "controller-applied") {
      setFeedback(ui.feedback, "Controller compiled and applied. Run restarted cleanly.", "success");
      ui.status.textContent = "Controller active · run restarted";
      setRunning(false);
    } else if (message.type === "setup-applied") {
      setFeedback(ui.setupFeedback, "Configuration and initializer applied. Run restarted cleanly.", "success");
      ui.status.textContent = "Setup active · run restarted";
      setRunning(false);
    } else if (message.type === "reset") setRunning(false);
    return;
  }
  if (message.type === "setup-error") {
    advancePending = false;
    ui.setupError.textContent = message.message;
    setFeedback(ui.setupFeedback, "Setup runtime application failed.", "error");
    ui.status.textContent = "Setup runtime error";
    ui.status.dataset.state = "error";
    setRunning(false);
    return;
  }
  if (message.type === "controller-runtime-error") {
    advancePending = false;
    ui.error.textContent = `runtime-initialization: ${message.message}`;
    setFeedback(ui.feedback, "Controller runtime initialization failed; previous valid controller remains recoverable.", "error");
    ui.status.textContent = "Controller runtime error";
    ui.status.dataset.state = "error";
    setRunning(false);
    return;
  }
  if (message.type === "error") {
    advancePending = false;
    ui.status.textContent = `Worker error: ${message.message}`;
    ui.status.dataset.state = "error";
    setRunning(false);
  }
});

worker.addEventListener("error", (event) => {
  ui.status.textContent = `Worker load error: ${event.message || "worker failed to start"}`;
  ui.status.dataset.state = "error";
  ui.setupError.textContent = event.message || "Worker failed to start.";
  setFeedback(ui.setupFeedback, "Worker failed before the experiment could start.", "error");
});

function markSetupDirty() {
  ui.setupError.textContent = "";
  setFeedback(ui.setupFeedback, "Setup source modified. Apply setup to compile and restart.", "dirty");
}
ui.config.addEventListener("input", markSetupDirty);
ui.initializerSource.addEventListener("input", markSetupDirty);

ui.applySetup.addEventListener("click", () => {
  try {
    const { config, setup } = compileSetup();
    const controller = compileControllerFor(config);
    appliedConfig = config;
    ui.setupError.textContent = "";
    ui.error.textContent = "";
    setFeedback(ui.setupFeedback, "Setup compiled. Applying configuration and initialization…", "working");
    setRunning(false);
    worker.postMessage({ type: "apply-setup", setup, ir: controller.compiled, parameters: controller.parameters });
  } catch (error) {
    ui.setupError.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.setupFeedback, "Setup compilation failed. Current valid setup was not replaced.", "error");
  }
});

ui.compile.addEventListener("click", () => {
  try {
    if (!appliedConfig) throw new Error("No valid applied experiment configuration.");
    const controller = compileControllerFor(appliedConfig);
    ui.error.textContent = "";
    setFeedback(ui.feedback, "Compilation passed. Applying controller…", "working");
    worker.postMessage({ type: "apply-controller", ir: controller.compiled, parameters: controller.parameters });
  } catch (error) {
    ui.error.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.feedback, "Compilation failed. Current valid controller was not replaced.", "error");
  }
});

ui.source.addEventListener("input", () => {
  ui.error.textContent = "";
  setFeedback(ui.feedback, "Controller source modified. Apply controller to compile and restart.", "dirty");
});

ui.run.addEventListener("click", () => setRunning(true));
ui.pause.addEventListener("click", () => setRunning(false));
ui.restart.addEventListener("click", () => { setRunning(false); worker.postMessage({ type: "reset" }); });

requestAnimationFrame(drawSnapshot);
