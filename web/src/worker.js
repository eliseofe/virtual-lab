import { RuntimePacer } from "./runtime/scheduler.js";

let simulation = null;
let wasm = null;
let wasmReady = false;
let activeArenaSize = 1.0;
let activeSeed = 0;
let activePhysicsDt = 0.01;
let pacer = null;
let running = false;
let targetSpeed = 1;
let stopAtScientificTime = null;
let loopTimer = null;
let lastSnapshotWallMs = -Infinity;

const SNAPSHOT_INTERVAL_MS = 1000 / 60;

function emitSnapshot(type) {
  if (!simulation) return;
  const state = simulation.snapshot_state();
  self.postMessage({
    type,
    physicsTicks: simulation.physics_ticks(),
    controlUpdates: simulation.control_updates(),
    scientificTime: simulation.scientific_time(),
    agentCount: state.length / 3,
    arenaSize: activeArenaSize,
    seed: activeSeed,
    state,
  });
}

function simulationValues(setup = {}) {
  const simulationSetup = setup.simulation ?? {};
  return {
    initialState: Array.isArray(setup.initialState) ? setup.initialState : [],
    seed: Number(simulationSetup.seed),
    physicsDt: Number(simulationSetup.physicsDt),
    controlDt: Number(simulationSetup.controlDt),
    metricDt: Number(simulationSetup.metricDt),
    interactionRadius: Number(simulationSetup.interactionRadius),
    arenaSize: Number(simulationSetup.arenaSize),
    sensorNoise: Number(simulationSetup.sensorNoise),
    maxForwardSpeed: Number(simulationSetup.maxForwardSpeed),
    maxAngularSpeed: Number(simulationSetup.maxAngularSpeed),
  };
}

function clearLoopTimer() {
  if (loopTimer !== null) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

function stopLoop() {
  running = false;
  clearLoopTimer();
  pacer?.pause();
}

function scheduleLoop(delayMs = 0) {
  if (!running || loopTimer !== null) return;
  loopTimer = setTimeout(() => {
    loopTimer = null;
    runLoop();
  }, Math.max(0, Math.ceil(delayMs)));
}

function ticksUntilStop() {
  if (!simulation || !(stopAtScientificTime > 0)) return Infinity;
  const remaining = stopAtScientificTime - simulation.scientific_time();
  if (remaining <= 1e-12) return 0;
  return Math.max(1, Math.ceil((remaining / activePhysicsDt) - 1e-12));
}

function finishRunIfNeeded() {
  if (ticksUntilStop() > 0) return false;
  stopLoop();
  emitSnapshot("completed");
  return true;
}

function runLoop() {
  if (!running || !simulation || !pacer) return;
  if (finishRunIfNeeded()) return;

  const plan = pacer.plan(performance.now());
  if (plan.ticks < 1) {
    scheduleLoop(plan.delayMs ?? 0);
    return;
  }

  const ticks = Math.min(plan.ticks, ticksUntilStop());
  if (ticks < 1) {
    finishRunIfNeeded();
    return;
  }

  const started = performance.now();
  try {
    simulation.advance_ticks(ticks);
  } catch (error) {
    stopLoop();
    self.postMessage({
      type: "controller-runtime-error",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const finished = performance.now();
  pacer.recordWork(ticks, finished - started);

  if (finishRunIfNeeded()) return;

  if (finished - lastSnapshotWallMs >= SNAPSHOT_INTERVAL_MS) {
    lastSnapshotWallMs = finished;
    emitSnapshot("snapshot");
  }

  // Yield to the worker event loop between bounded chunks so pause, speed,
  // reset and edit messages remain responsive even above compute capacity.
  scheduleLoop(0);
}

function startLoop(speed, stopAt) {
  if (!simulation || !pacer) return;
  targetSpeed = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 1;
  stopAtScientificTime = Number.isFinite(Number(stopAt)) && Number(stopAt) > 0
    ? Number(stopAt)
    : null;
  clearLoopTimer();
  running = true;
  const now = performance.now();
  pacer.start(now, targetSpeed);
  lastSnapshotWallMs = now - SNAPSHOT_INTERVAL_MS;
  scheduleLoop(0);
}

function setTargetSpeed(speed) {
  targetSpeed = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 1;
  if (!pacer) return;
  pacer.setSpeed(performance.now(), targetSpeed);
  if (running) {
    clearLoopTimer();
    scheduleLoop(0);
  }
}

async function loadWasm() {
  const moduleUrl = new URL("./wasm/vlab_kernel.js", import.meta.url).href;
  wasm = await import(moduleUrl);
  await wasm.default();
  wasmReady = true;
  self.postMessage({ type: "wasm-ready", kernelVersion: wasm.kernel_version() });
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (!wasmReady) {
    self.postMessage({ type: "error", message: "WASM kernel is still loading" });
    return;
  }
  try {
    if (message.type === "initialize") {
      stopLoop();
      const setup = simulationValues(message.setup);
      activeArenaSize = setup.arenaSize;
      activeSeed = setup.seed >>> 0;
      activePhysicsDt = setup.physicsDt;
      simulation = new wasm.ProbeSimulation(
        JSON.stringify(setup.initialState),
        setup.seed,
        setup.physicsDt,
        setup.controlDt,
        setup.metricDt,
        setup.interactionRadius,
        setup.arenaSize,
        setup.sensorNoise,
        setup.maxForwardSpeed,
        setup.maxAngularSpeed,
        JSON.stringify(message.ir),
        JSON.stringify(message.parameters ?? {}),
      );
      pacer = new RuntimePacer(activePhysicsDt);
      self.postMessage({ type: "ready", kernelVersion: wasm.kernel_version() });
      emitSnapshot("snapshot");
      return;
    }
    if (!simulation) {
      self.postMessage({ type: "error", message: "simulation has not been initialized" });
      return;
    }
    if (message.type === "run") {
      startLoop(message.speed, message.stopAtScientificTime);
      return;
    }
    if (message.type === "pause") {
      stopLoop();
      return;
    }
    if (message.type === "set-speed") {
      setTargetSpeed(message.speed);
      return;
    }
    if (message.type === "apply-setup") {
      stopLoop();
      const setup = simulationValues(message.setup);
      activeArenaSize = setup.arenaSize;
      activePhysicsDt = setup.physicsDt;
      simulation.set_setup(
        JSON.stringify(setup.initialState),
        setup.seed,
        setup.physicsDt,
        setup.controlDt,
        setup.metricDt,
        setup.interactionRadius,
        setup.arenaSize,
        setup.sensorNoise,
        setup.maxForwardSpeed,
        setup.maxAngularSpeed,
      );
      simulation.set_controller(JSON.stringify(message.ir), JSON.stringify(message.parameters ?? {}));
      activeSeed = setup.seed >>> 0;
      pacer = new RuntimePacer(activePhysicsDt);
      emitSnapshot("setup-applied");
      return;
    }
    if (message.type === "apply-controller") {
      stopLoop();
      simulation.set_controller(JSON.stringify(message.ir), JSON.stringify(message.parameters ?? {}));
      emitSnapshot("controller-applied");
      return;
    }
    if (message.type === "reset") {
      stopLoop();
      simulation.reset();
      emitSnapshot("reset");
      return;
    }
    self.postMessage({ type: "error", message: `unknown worker message '${message.type}'` });
  } catch (error) {
    stopLoop();
    self.postMessage({
      type: message.type === "apply-setup" ? "setup-error" : "controller-runtime-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

loadWasm().catch((error) => {
  stopLoop();
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
});
