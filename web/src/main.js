import "./catalog-workspace.js";
import { compileController } from "./controller/compiler.js";
import { compileConfig, numericParameters } from "./config/compiler.js";
import { compileEnvironmentScalar, validateEnvironmentControllerPair } from "./environment/compiler.js";
import { compileInitializer } from "./initializer/compiler.js";
import {
  RUNTIME_CONTRACT,
  simulationSetupFromRuntime,
  validateInitialStateForRuntime,
  validateRuntimeValues,
} from "./runtime/contract.js";
import { ArenaCamera } from "./visualization/camera.js";
import { runtimeModel } from "./runtime/runtime-model.js";
import { provideSimulationCommands } from "./runtime/simulation-commands.js";
import { formatCount, formatRunState, formatScientificTime, formatSeed, formatTargetSpeed } from "./runtime/runtime-format.js";

const INTERNAL_SEED = 2026;


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
  cameraStatus: document.querySelector("#camera-status"),
  fitArena: document.querySelector("#fit-arena"),
  agentGlyph: document.querySelector("#agent-glyph"),
};

for (const [name, element] of Object.entries(ui)) {
  if (!element) throw new Error(`Virtual Lab UI mismatch: missing element '${name}'`);
}


let wasmReady = false;
let initialized = false;
let running = false;
let latestState = [];
let activeArenaSize = 10.0;
let activeSeed = INTERNAL_SEED;
let appliedConfig = null;
let appliedConfigSource = ui.config.value;
let appliedInitializerSource = ui.initializerSource.value;
let appliedEnvironment = null;
let appliedReferences = [];
let appliedController = null;
let pendingSetup = null;
let pendingController = null;
let environmentGrid = null;
let environmentGridImage = null;

const camera = new ArenaCamera();
const activePointers = new Map();
let pinchGesture = null;

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

// Setup and controller apply outcomes are reported in the runtime model
// (#567); the feedback lines on the page show them.
function setFeedback(element, message, state = "idle") {
  const key = element === ui.setupFeedback ? "setup" : element === ui.feedback ? "controller" : null;
  if (key) {
    const current = runtimeModel.get().sourceStatus;
    runtimeModel.set({ sourceStatus: Object.freeze({ ...current, [key]: Object.freeze({ state, text: message }) }) });
    element.textContent = runtimeModel.get().sourceStatus[key].text;
    element.dataset.state = runtimeModel.get().sourceStatus[key].state;
    return;
  }
  element.textContent = message;
  element.dataset.state = state;
}

function updateCameraUi() {
  const fit = camera.isFit();
  runtimeModel.set({
    camera: Object.freeze({ label: camera.label(), fit }),
    controls: Object.freeze({ ...runtimeModel.get().controls, fit: !fit }),
  });
  ui.cameraStatus.textContent = runtimeModel.get().camera.label;
  ui.cameraStatus.dataset.fit = String(runtimeModel.get().camera.fit);
  ui.fitArena.disabled = !runtimeModel.get().controls.fit;
}

function resetCamera() {
  camera.reset();
  updateCameraUi();
}

function setActiveArenaSize(next, { resetView = false } = {}) {
  if (!Number.isFinite(next) || next <= 0) return;
  const changed = Math.abs(Number(next) - activeArenaSize) > 1e-9;
  activeArenaSize = Number(next);
  if (resetView || changed) resetCamera();
}

function canvasInteractionFrame() {
  const ratio = window.devicePixelRatio || 1;
  const rect = ui.canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width * ratio);
  const height = Math.max(1, rect.height * ratio);
  const padding = 30 * ratio;
  return {
    ratio,
    rect,
    frame: camera.frame({ width, height, arenaSize: activeArenaSize, padding }),
  };
}

function pointerPoint(event, metrics = canvasInteractionFrame()) {
  return {
    x: (event.clientX - metrics.rect.left) * metrics.ratio,
    y: (event.clientY - metrics.rect.top) * metrics.ratio,
  };
}

function currentPinch() {
  if (activePointers.size < 2) return null;
  const [a, b] = [...activePointers.values()].slice(0, 2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    distance: Math.max(1e-9, Math.hypot(dx, dy)),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

// The resolved role composition of the latest compiled setup (#577), shown in
// the setup feedback so authors see the exact counts.
let latestGroups = [];
function withGroups(text) {
  if (!latestGroups.length) return text;
  const partitions = new Map();
  for (const { name, partition, count } of latestGroups) partitions.set(partition, [...(partitions.get(partition) ?? []), `${name} ${count}`]);
  const parts = [...partitions].map(([partition, groups]) => (partition === "default" ? "" : `${partition}: `) + groups.join(", "));
  return `${text} Groups: ${parts.join("; ")}.`;
}

function compileSetup({ seed = activeSeed, configSource = ui.config.value, initializerSource = ui.initializerSource.value } = {}) {
  const config = compileConfig(configSource);
  const runtime = validateRuntimeValues(config.values);

  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
  const initializer = compileInitializer(initializerSource, initializerConfig);
  latestGroups = initializer.groups ?? [];
  validateInitialStateForRuntime(initializer.state, runtime);
  const environment = compileEnvironmentScalar(initializerSource, initializerConfig);
  const references = initializer.world_references?.references?.map(({ name }) => name) ?? [];

  ui.initializerIr.textContent = JSON.stringify({
    version: initializer.version,
    runtimeContract: runtime.version,
    method: initializer.method,
    seed,
    agentCount: initializer.state.length,
    arenaSize: runtime.arenaSize,
    environment: environment ? { schema: environment.schema, entry: environment.entry } : null,
    referenceCount: initializer.world_references?.references?.length ?? 0,
    referenceSensorCount: initializer.world_references?.sensors?.length ?? 0,
    firstAgents: initializer.state.slice(0, 5),
  }, null, 2);

  return {
    config,
    environment,
    references,
    setup: simulationSetupFromRuntime(runtime, seed, initializer.state, environment, initializer.world_references),
  };
}

function compileControllerFor(config, environment = appliedEnvironment, references = appliedReferences) {
  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const compiled = compileController(ui.source.value, { parameters: parameterTypes, references });
  validateEnvironmentControllerPair(environment, compiled);
  ui.ir.textContent = JSON.stringify(compiled, null, 2);
  return { compiled, parameters };
}

// `sources` alone keeps source applying open while the run controls stay off:
// the state after startup sources failed to compile, so the user (or opening
// an Experiment) can still supply valid ones.
function setControlsEnabled(enabled, { sources = enabled } = {}) {
  runtimeModel.set({
    controls: Object.freeze({
      ...runtimeModel.get().controls,
      run: enabled && !running,
      pause: enabled && running,
      restart: enabled,
      newSeed: enabled,
      speed: enabled,
      applySources: sources,
    }),
  });
  const controls = runtimeModel.get().controls;
  ui.run.disabled = !controls.run;
  ui.pause.disabled = !controls.pause;
  ui.restart.disabled = !controls.restart;
  ui.restartNewSeed.disabled = !controls.newSeed;
  ui.compile.disabled = !controls.applySources;
  ui.applySetup.disabled = !controls.applySources;
  ui.speed.disabled = !controls.speed;
}

function runtimeSpeed() {
  const speed = Number(runtimeModel.get().requestedSpeed);
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function updateSpeedLabel() {
  ui.speedValue.textContent = formatTargetSpeed(runtimeModel.get().requestedSpeed);
}

function updateSeedLabel() {
  runtimeModel.set({ seed: activeSeed });
  const text = formatSeed(runtimeModel.get().seed);
  // Every snapshot carries the seed; redraw only when it changes (#569).
  if (ui.runSeed.textContent !== text) ui.runSeed.textContent = text;
}

// The legacy stage labels are the fallback view: hidden while the React
// simulation panel is mounted (#569), so the per-frame counters are drawn only
// while they are visible, and redrawn when they become visible again.
function legacyRuntimeVisible() {
  return !document.body.classList.contains("vlab-react-simulation-mounted");
}

function drawLegacyCounters() {
  if (!legacyRuntimeVisible()) return;
  const runtime = runtimeModel.get();
  ui.time.textContent = formatScientificTime(runtime.scientificTime);
  ui.physicsTicks.textContent = formatCount(runtime.physicsTicks);
  ui.controlUpdates.textContent = formatCount(runtime.controlUpdates);
}

new MutationObserver(drawLegacyCounters).observe(document.body, { attributes: true, attributeFilter: ["class"] });

// The simulator status lives in the runtime model (#569); the page line is
// drawn from it. A message without a state keeps the previous state.
function showSimulatorStatus(text, state = runtimeModel.get().simulatorStatus.state) {
  runtimeModel.set({ simulatorStatus: Object.freeze({ state, text }) });
  ui.status.textContent = text;
  if (ui.status.dataset.state !== state) ui.status.dataset.state = state;
}

// The run state lives in the runtime model; the page label is drawn from it.
function showRunState(runState) {
  runtimeModel.set({ runState });
  ui.runState.textContent = formatRunState(runtimeModel.get().runState);
}

function randomSeedDifferentFromCurrent() {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  let next = value[0] >>> 0;
  if (next === (activeSeed >>> 0)) next = (next + 1) >>> 0;
  return next;
}

function setRunning(next, { notifyWorker = true } = {}) {
  running = Boolean(next);
  showRunState(running ? "running" : "paused");
  setControlsEnabled(initialized);
  if (!initialized || !notifyWorker) return;

  if (running) {
    worker.postMessage({
      type: "run",
      speed: runtimeSpeed(),
      stopAtScientificTime: appliedConfig?.values?.EXPERIMENT_DURATION ?? null,
    });
  } else {
    worker.postMessage({ type: "pause" });
  }
}

function initializeIfReady() {
  if (!wasmReady || initialized) return;
  try {
    const { config, environment, references, setup } = compileSetup({ seed: activeSeed });
    const controller = compileControllerFor(config, environment, references);
    appliedConfig = config;
    appliedConfigSource = ui.config.value;
    appliedInitializerSource = ui.initializerSource.value;
    appliedEnvironment = environment;
    appliedReferences = references;
    appliedController = controller;
    setActiveArenaSize(setup.simulation.arenaSize, { resetView: true });
    ui.setupError.textContent = "";
    ui.error.textContent = "";
    updateSeedLabel();
    setFeedback(ui.setupFeedback, withGroups("Configuration and initializer valid."), "success");
    setFeedback(ui.feedback, "Controller valid.", "success");
    showSimulatorStatus("Starting simulation…");
    worker.postMessage({ type: "initialize", setup, ir: controller.compiled, parameters: controller.parameters });
    initialized = true;
  } catch (error) {
    initialized = false;
    ui.setupError.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.setupFeedback, "Configuration or initializer is invalid.", "error");
    showSimulatorStatus("Experiment setup error", "error");
    setControlsEnabled(false, { sources: true });
  }
}

function updateSnapshot(message) {
  if (Array.isArray(message.state) || ArrayBuffer.isView(message.state)) {
    latestState = Array.from(message.state);
    const hasData = latestState.length > 0;
    if (ui.canvasEmpty.hidden !== hasData) ui.canvasEmpty.hidden = hasData;
  }
  if (Number.isFinite(message.arenaSize)) setActiveArenaSize(Number(message.arenaSize));
  if (Number.isInteger(message.seed)) {
    activeSeed = Number(message.seed) >>> 0;
    updateSeedLabel();
  }
  runtimeModel.set({ scientificTime: Number(message.scientificTime ?? 0) });
  runtimeModel.set({ physicsTicks: message.physicsTicks ?? 0 });
  runtimeModel.set({ controlUpdates: message.controlUpdates ?? 0 });
  drawLegacyCounters();
}

function rebuildEnvironmentGridImage() {
  environmentGridImage = null;
  if (!environmentGrid?.resolution || !environmentGrid.values.length) return;
  const finite = environmentGrid.values.filter(Number.isFinite);
  if (!finite.length) return;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const canvas = document.createElement("canvas");
  canvas.width = environmentGrid.resolution;
  canvas.height = environmentGrid.resolution;
  const context = canvas.getContext("2d");
  const image = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < environmentGrid.values.length; i += 1) {
    const value = environmentGrid.values[i];
    const normalized = Number.isFinite(value) && span > 0 ? (value - min) / span : 0.5;
    const shade = Math.round(255 * (1 - normalized));
    image.data[i * 4] = shade;
    image.data[i * 4 + 1] = shade;
    image.data[i * 4 + 2] = shade;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  environmentGridImage = canvas;
}

function drawAgent(context, glyph, x, y, heading, ratio) {
  if (glyph === "dot") {
    context.beginPath();
    context.arc(x, y, 2.8 * ratio, 0, Math.PI * 2);
    context.fill();
    return;
  }

  if (glyph === "arrow") {
    const forwardX = Math.cos(heading);
    const forwardY = -Math.sin(heading);
    const sideX = -forwardY;
    const sideY = forwardX;
    const tip = 7.5 * ratio;
    const back = 4.0 * ratio;
    const halfWidth = 4.1 * ratio;
    const backX = x - forwardX * back;
    const backY = y - forwardY * back;
    context.beginPath();
    context.moveTo(x + forwardX * tip, y + forwardY * tip);
    context.lineTo(backX + sideX * halfWidth, backY + sideY * halfWidth);
    context.lineTo(backX - sideX * halfWidth, backY - sideY * halfWidth);
    context.closePath();
    context.fill();
    return;
  }

  const bodyRadius = 4.2 * ratio;
  const headingLength = 11 * ratio;
  context.beginPath();
  context.arc(x, y, bodyRadius, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + Math.cos(heading) * headingLength, y - Math.sin(heading) * headingLength);
  context.stroke();
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
  context.fillStyle = "#edf2f3";
  context.fillRect(0, 0, width, height);

  const pad = 30 * ratio;
  const frame = camera.frame({ width, height, arenaSize: activeArenaSize, padding: pad });
  const halfArena = frame.arena / 2;
  const arenaLeft = frame.toCanvasX(-halfArena);
  const arenaRight = frame.toCanvasX(halfArena);
  const arenaTop = frame.toCanvasY(halfArena);
  const arenaBottom = frame.toCanvasY(-halfArena);

  context.fillStyle = "#ffffff";
  context.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop);

  context.save();
  context.beginPath();
  context.rect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop);
  context.clip();

  if (environmentGridImage) {
    context.save();
    context.imageSmoothingEnabled = true;
    context.globalAlpha = 1.0;
    context.drawImage(environmentGridImage, arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop);
    context.restore();
  }

  const pixelsPerUnit = frame.pixelsPerUnit;
  const visualGridStep = Math.max(1, Math.ceil((3 * ratio) / Math.max(pixelsPerUnit, 1e-9)));
  const visibleMinX = Math.max(-halfArena, frame.toWorldX(0));
  const visibleMaxX = Math.min(halfArena, frame.toWorldX(width));
  const visibleMinY = Math.max(-halfArena, frame.toWorldY(height));
  const visibleMaxY = Math.min(halfArena, frame.toWorldY(0));
  const firstGridX = Math.ceil(visibleMinX / visualGridStep) * visualGridStep;
  const firstGridY = Math.ceil(visibleMinY / visualGridStep) * visualGridStep;

  context.beginPath();
  for (let value = firstGridX; value <= visibleMaxX + 1e-9; value += visualGridStep) {
    const x = frame.toCanvasX(value);
    context.moveTo(x, arenaTop);
    context.lineTo(x, arenaBottom);
  }
  for (let value = firstGridY; value <= visibleMaxY + 1e-9; value += visualGridStep) {
    const y = frame.toCanvasY(value);
    context.moveTo(arenaLeft, y);
    context.lineTo(arenaRight, y);
  }
  context.strokeStyle = "#e4e9ec";
  context.lineWidth = 1 * ratio;
  context.stroke();

  context.strokeStyle = "#1c4e63";
  context.fillStyle = "#1c4e63";
  context.lineWidth = 1.6 * ratio;
  const glyph = runtimeModel.get().glyph;
  const margin = 16 * ratio;
  for (let i = 0; i + 2 < latestState.length; i += 3) {
    const x = frame.toCanvasX(latestState[i]);
    const y = frame.toCanvasY(latestState[i + 1]);
    if (x < -margin || x > width + margin || y < -margin || y > height + margin) continue;
    drawAgent(context, glyph, x, y, latestState[i + 2], ratio);
  }
  context.restore();

  context.strokeStyle = camera.isFit() ? "#8da1aa" : "#5b7783";
  context.lineWidth = (camera.isFit() ? 1.6 : 2.2) * ratio;
  context.strokeRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop);

  context.fillStyle = "#65747b";
  context.font = `${11 * ratio}px system-ui, sans-serif`;
  context.textBaseline = "top";
  const labelX = Math.max(8 * ratio, Math.min(width - 90 * ratio, arenaLeft + 7 * ratio));
  const labelY = Math.max(8 * ratio, Math.min(height - 24 * ratio, arenaTop + 7 * ratio));
  context.fillText(
    visualGridStep === 1 ? "Grid: 1 unit" : `Grid: ${visualGridStep} units`,
    labelX,
    labelY,
  );

  requestAnimationFrame(drawSnapshot);
}

worker.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "wasm-ready") {
    wasmReady = true;
    showSimulatorStatus("Preparing experiment…");
    initializeIfReady();
    return;
  }
  if (message.type === "environment") {
    if (Number.isFinite(message.arenaSize)) setActiveArenaSize(Number(message.arenaSize));
    environmentGrid = {
      resolution: Number(message.resolution) || 0,
      values: Array.from(message.values ?? []),
    };
    rebuildEnvironmentGridImage();
    return;
  }
  if (message.type === "ready") {
    showSimulatorStatus("Simulator ready", "ready");
    running = false;
    showRunState("paused");
    setControlsEnabled(true);
    return;
  }
  if (["snapshot", "completed", "reset", "controller-applied", "setup-applied"].includes(message.type)) {
    updateSnapshot(message);
    if (message.type === "completed") {
      setRunning(false, { notifyWorker: false });
      const duration = appliedConfig?.values?.EXPERIMENT_DURATION;
      showSimulatorStatus(Number.isFinite(duration) ? `Run complete (${duration} s)` : "Run complete");
    } else if (message.type === "controller-applied") {
      if (pendingController) appliedController = pendingController;
      pendingController = null;
      setFeedback(ui.feedback, "Controller applied. Run restarted.", "success");
      showSimulatorStatus("Controller applied");
      setRunning(false, { notifyWorker: false });
    } else if (message.type === "setup-applied") {
      if (pendingSetup) {
        appliedConfig = pendingSetup.config;
        appliedConfigSource = pendingSetup.configSource;
        appliedInitializerSource = pendingSetup.initializerSource;
        appliedEnvironment = pendingSetup.environment;
        appliedReferences = pendingSetup.references;
        appliedController = pendingSetup.controller;
      }
      pendingSetup = null;
      setFeedback(ui.setupFeedback, withGroups("Configuration applied. Run restarted."), "success");
      showSimulatorStatus("Configuration applied");
      setRunning(false, { notifyWorker: false });
    } else if (message.type === "reset") {
      showSimulatorStatus(`Run restarted · seed ${activeSeed}`);
      setRunning(false, { notifyWorker: false });
    }
    return;
  }
  if (message.type === "setup-error") {
    pendingSetup = null;
    ui.setupError.textContent = message.message;
    setFeedback(ui.setupFeedback, "Could not apply configuration.", "error");
    showSimulatorStatus("Configuration error", "error");
    setRunning(false, { notifyWorker: false });
    return;
  }
  if (message.type === "controller-runtime-error") {
    pendingController = null;
    ui.error.textContent = `Controller initialization: ${message.message}`;
    setFeedback(ui.feedback, "Could not apply controller. Previous controller remains active.", "error");
    showSimulatorStatus("Controller error", "error");
    setRunning(false, { notifyWorker: false });
    return;
  }
  if (message.type === "error") {
    showSimulatorStatus(`Simulation error: ${message.message}`, "error");
    setRunning(false, { notifyWorker: false });
  }
});

worker.addEventListener("error", (event) => {
  running = false;
  setControlsEnabled(false);
  showRunState("paused");
  showSimulatorStatus(`Simulator error: ${event.message || "failed to start"}`, "error");
  ui.setupError.textContent = event.message || "Simulator failed to start.";
  setFeedback(ui.setupFeedback, "Simulator failed to start.", "error");
});

function markSetupDirty() {
  ui.setupError.textContent = "";
  setFeedback(ui.setupFeedback, "Changes pending. Apply & restart to use them.", "dirty");
}
ui.config.addEventListener("input", markSetupDirty);
ui.initializerSource.addEventListener("input", markSetupDirty);

// Applying edited sources (#567). Like the buttons they replace, these do
// nothing while the simulator cannot take sources; each reports the request.
function applySetup() {
  if (!runtimeModel.get().controls.applySources) return;
  if (!initialized) {
    // Nothing is running yet (the startup sources were invalid): start with
    // the sources now in the editors.
    initializeIfReady();
    runtimeModel.set({ sourceApplyRequest: Object.freeze({ kind: "setup" }) });
    return;
  }
  try {
    const configSource = ui.config.value;
    const initializerSource = ui.initializerSource.value;
    const { config, environment, references, setup } = compileSetup({ seed: activeSeed, configSource, initializerSource });
    const controller = compileControllerFor(config, environment, references);
    pendingSetup = { config, configSource, initializerSource, environment, references, controller };
    setActiveArenaSize(setup.simulation.arenaSize, { resetView: true });
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
  runtimeModel.set({ sourceApplyRequest: Object.freeze({ kind: "setup" }) });
}

function applyController() {
  if (!runtimeModel.get().controls.applySources) return;
  if (!initialized) {
    initializeIfReady();
    runtimeModel.set({ sourceApplyRequest: Object.freeze({ kind: "controller" }) });
    return;
  }
  try {
    if (!appliedConfig) throw new Error("No valid experiment configuration is active.");
    const controller = compileControllerFor(appliedConfig, appliedEnvironment, appliedReferences);
    pendingController = controller;
    ui.error.textContent = "";
    setFeedback(ui.feedback, "Applying controller…", "working");
    setRunning(false);
    worker.postMessage({ type: "apply-controller", ir: controller.compiled, parameters: controller.parameters });
  } catch (error) {
    pendingController = null;
    ui.error.textContent = error instanceof Error ? error.message : String(error);
    setFeedback(ui.feedback, "Could not apply controller. Previous controller remains active.", "error");
  }
  runtimeModel.set({ sourceApplyRequest: Object.freeze({ kind: "controller" }) });
}

ui.applySetup.addEventListener("click", applySetup);
ui.compile.addEventListener("click", applyController);

ui.source.addEventListener("input", () => {
  ui.error.textContent = "";
  setFeedback(ui.feedback, "Changes pending. Apply & restart to use them.", "dirty");
});

// The legacy range input is kept as the value's sanitiser (min, max, step), as
// it always has been: the requested speed is whatever it accepts.
function setSpeed(value) {
  ui.speed.value = String(value);
  runtimeModel.set({ requestedSpeed: Number(ui.speed.value) });
  updateSpeedLabel();
  if (initialized) worker.postMessage({ type: "set-speed", speed: runtimeSpeed() });
}

function setGlyph(value) {
  ui.agentGlyph.value = value;
  runtimeModel.set({ glyph: ui.agentGlyph.value });
}

function fitArena() {
  if (!runtimeModel.get().controls.fit) return;
  resetCamera();
}

ui.speed.addEventListener("input", () => setSpeed(ui.speed.value));
ui.agentGlyph.addEventListener("change", () => setGlyph(ui.agentGlyph.value));
ui.fitArena.addEventListener("click", fitArena);

ui.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const metrics = canvasInteractionFrame();
  const point = pointerPoint(event, metrics);
  camera.zoomAt(Math.exp(-event.deltaY * 0.0015), point.x, point.y, metrics.frame);
  updateCameraUi();
}, { passive: false });

ui.canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const metrics = canvasInteractionFrame();
  activePointers.set(event.pointerId, pointerPoint(event, metrics));
  ui.canvas.setPointerCapture(event.pointerId);
  ui.canvas.dataset.dragging = "true";
  pinchGesture = currentPinch();
  event.preventDefault();
});

ui.canvas.addEventListener("pointermove", (event) => {
  const previous = activePointers.get(event.pointerId);
  if (!previous) return;
  const metrics = canvasInteractionFrame();
  const current = pointerPoint(event, metrics);

  if (activePointers.size === 1) {
    activePointers.set(event.pointerId, current);
    camera.panScreen(current.x - previous.x, current.y - previous.y, metrics.frame);
    updateCameraUi();
    event.preventDefault();
    return;
  }

  activePointers.set(event.pointerId, current);
  const nextPinch = currentPinch();
  if (pinchGesture && nextPinch) {
    camera.zoomAt(nextPinch.distance / pinchGesture.distance, pinchGesture.x, pinchGesture.y, metrics.frame);
    const afterZoom = canvasInteractionFrame().frame;
    camera.panScreen(nextPinch.x - pinchGesture.x, nextPinch.y - pinchGesture.y, afterZoom);
    updateCameraUi();
  }
  pinchGesture = nextPinch;
  event.preventDefault();
});

function releasePointer(event) {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  pinchGesture = currentPinch();
  if (activePointers.size === 0) ui.canvas.dataset.dragging = "false";
}

ui.canvas.addEventListener("pointerup", releasePointer);
ui.canvas.addEventListener("pointercancel", releasePointer);
ui.canvas.addEventListener("lostpointercapture", releasePointer);

// Start from the form's values, which the browser may have restored on reload.
runtimeModel.set({ requestedSpeed: Number(ui.speed.value), glyph: ui.agentGlyph.value });
updateSpeedLabel();
updateSeedLabel();
updateCameraUi();
// The simulation controller (#562): each command does what its button always
// did, and only when that command is available (a disabled button does nothing).
function run() {
  if (!runtimeModel.get().controls.run) return;
  setRunning(true);
}

function pause() {
  if (!runtimeModel.get().controls.pause) return;
  setRunning(false);
}

function restart() {
  if (!runtimeModel.get().controls.restart) return;
  setRunning(false);
  worker.postMessage({ type: "reset" });
}

function restartWithNewSeed() {
  if (!runtimeModel.get().controls.newSeed) return;
  try {
    if (!appliedConfig || !appliedController) throw new Error("No valid experiment is active.");
    const seed = randomSeedDifferentFromCurrent();
    const { config, environment, references, setup } = compileSetup({ seed, configSource: appliedConfigSource, initializerSource: appliedInitializerSource });
    validateEnvironmentControllerPair(environment, appliedController.compiled);
    pendingSetup = {
      config,
      configSource: appliedConfigSource,
      initializerSource: appliedInitializerSource,
      environment,
      references,
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
}

provideSimulationCommands({ run, pause, restart, restartWithNewSeed, fitArena, setSpeed, setGlyph, applySetup, applyController });

// The legacy buttons are one more view of the same controller, and other
// modules that press them (library, results, metrics) reach it the same way.
ui.run.addEventListener("click", run);
ui.pause.addEventListener("click", pause);
ui.restart.addEventListener("click", restart);
ui.restartNewSeed.addEventListener("click", restartWithNewSeed);

requestAnimationFrame(drawSnapshot);
