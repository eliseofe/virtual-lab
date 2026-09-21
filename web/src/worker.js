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
let lastMetricTransportWallMs = -Infinity;
let lastReportedDroppedSamples = 0;

const SNAPSHOT_INTERVAL_MS = 1000 / 60;
const METRIC_TRANSPORT_INTERVAL_MS = 100;
const METRIC_TRANSPORT_BATCH_SIZE = 4096;
const ENVIRONMENT_GRID_RESOLUTION = 64;
const EMPTY_METRICS_IR = Object.freeze({
  schema: "vlab.metrics-ir/0.1",
  language: "python-vlab-metrics/0.1",
  measurement_phase: "post-physics-wrapped-state/1",
  observation_contract: {
    mode: "read-only-global-snapshot",
    fields: [
      "snapshot.scientific_time",
      "snapshot.agent_count",
      "snapshot.agents[].position",
      "snapshot.agents[].heading",
      "snapshot.agents[].heading_angle",
    ],
  },
  metrics: [],
});

function metricsIr(message = {}) {
  return message.metricsIr ?? EMPTY_METRICS_IR;
}

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
    neighbourStrategy: simulation.neighbour_strategy(),
    state,
  });
}

function emitEnvironment() {
  if (!simulation) return;
  const values = simulation.has_environmental_scalar()
    ? simulation.sample_environment_grid(ENVIRONMENT_GRID_RESOLUTION)
    : [];
  self.postMessage({
    type: "environment",
    arenaSize: activeArenaSize,
    resolution: values.length ? ENVIRONMENT_GRID_RESOLUTION : 0,
    values,
  });
}

function resetMetricTransportClock() {
  lastMetricTransportWallMs = -Infinity;
  lastReportedDroppedSamples = 0;
  self.postMessage({ type: "metric-reset" });
}

function readMetricBatch(maxSamples = METRIC_TRANSPORT_BATCH_SIZE) {
  if (!simulation) return null;
  return JSON.parse(simulation.drain_metric_samples_json(maxSamples));
}

function shouldPostMetricBatch(batch) {
  const dropped = Number(batch?.buffer?.dropped_samples ?? 0);
  return Boolean(batch?.samples?.length) || dropped !== lastReportedDroppedSamples;
}

function postMetricBatch(batch) {
  if (!batch || !shouldPostMetricBatch(batch)) return;
  lastReportedDroppedSamples = Number(batch.buffer?.dropped_samples ?? lastReportedDroppedSamples);
  self.postMessage({ type: "metric-batch", batch });
}

function emitMetricBatch(force = false) {
  if (!simulation) return;
  const now = performance.now();
  if (!force && now - lastMetricTransportWallMs < METRIC_TRANSPORT_INTERVAL_MS) return;
  const batch = readMetricBatch();
  lastMetricTransportWallMs = now;
  postMetricBatch(batch);
}

function flushMetricBatches() {
  if (!simulation) return;
  for (;;) {
    const batch = readMetricBatch();
    postMetricBatch(batch);
    if (!batch?.buffer?.remaining_samples) break;
  }
  lastMetricTransportWallMs = performance.now();
}

function simulationValues(setup = {}) {
  const simulationSetup = setup.simulation ?? {};
  return {
    initialState: Array.isArray(setup.initialState) ? setup.initialState : [],
    environment: setup.environment ?? null,
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

function metricRuntimeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  stopLoop();
  self.postMessage({ type: "metrics-runtime-error", message });
  self.postMessage({ type: "error", message: `Metrics runtime: ${message}` });
}

function finishRunIfNeeded() {
  if (ticksUntilStop() > 0) return false;
  stopLoop();
  try {
    simulation.finalize_metrics();
    flushMetricBatches();
  } catch (error) {
    metricRuntimeError(error);
    return true;
  }
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
    const message = error instanceof Error ? error.message : String(error);
    if (/metric/i.test(message)) {
      metricRuntimeError(error);
    } else {
      stopLoop();
      self.postMessage({ type: "controller-runtime-error", message });
    }
    return;
  }
  const finished = performance.now();
  pacer.recordWork(ticks, finished - started);

  emitMetricBatch(false);
  if (finishRunIfNeeded()) return;

  if (finished - lastSnapshotWallMs >= SNAPSHOT_INTERVAL_MS) {
    lastSnapshotWallMs = finished;
    emitSnapshot("snapshot");
  }

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
  lastMetricTransportWallMs = now - METRIC_TRANSPORT_INTERVAL_MS;
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
  self.postMessage({
    type: "wasm-ready",
    kernelVersion: wasm.kernel_version(),
    rngContractVersion: wasm.rng_contract_version(),
    neighbourStrategy: wasm.production_neighbour_strategy(),
  });
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
      simulation = new wasm.MetricProbeSimulation(
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
        JSON.stringify(setup.environment),
        JSON.stringify(message.ir),
        JSON.stringify(metricsIr(message)),
        JSON.stringify(message.parameters ?? {}),
      );
      pacer = new RuntimePacer(activePhysicsDt);
      resetMetricTransportClock();
      self.postMessage({
        type: "ready",
        kernelVersion: wasm.kernel_version(),
        rngContractVersion: wasm.rng_contract_version(),
        neighbourStrategy: simulation.neighbour_strategy(),
        metricCount: simulation.metric_count(),
      });
      emitEnvironment();
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
      flushMetricBatches();
      emitSnapshot("paused");
      return;
    }
    if (message.type === "set-speed") {
      setTargetSpeed(message.speed);
      return;
    }
    if (message.type === "advance") {
      stopLoop();
      const ticks = Math.max(0, Math.trunc(Number(message.ticks ?? 0)));
      simulation.advance_ticks(ticks);
      flushMetricBatches();
      emitSnapshot("advanced");
      return;
    }
    if (message.type === "profile-advance") {
      stopLoop();
      const ticks = Math.max(0, Math.trunc(Number(message.ticks ?? 0)));
      const includeState = message.includeState === true;
      const transportMetrics = message.metricTransport === true;
      const advanceStarted = performance.now();
      simulation.advance_ticks(ticks);
      const advanceFinished = performance.now();
      let state = null;
      let snapshotMs = 0;
      if (includeState) {
        const snapshotStarted = performance.now();
        state = simulation.snapshot_state();
        snapshotMs = performance.now() - snapshotStarted;
      }
      let metricTransportMs = 0;
      let metricTransportBytes = 0;
      let metricSamples = 0;
      let metricDroppedSamples = 0;
      if (transportMetrics) {
        const transportStarted = performance.now();
        for (;;) {
          const batchText = simulation.drain_metric_samples_json(METRIC_TRANSPORT_BATCH_SIZE);
          metricTransportBytes += batchText.length;
          const batch = JSON.parse(batchText);
          metricSamples += batch.samples?.length ?? 0;
          metricDroppedSamples = Number(batch.buffer?.dropped_samples ?? metricDroppedSamples);
          if (!batch.buffer?.remaining_samples) break;
        }
        metricTransportMs = performance.now() - transportStarted;
      }
      self.postMessage({
        type: "profile-advanced",
        ticks,
        advanceMs: advanceFinished - advanceStarted,
        snapshotMs,
        metricTransportMs,
        metricTransportBytes,
        metricSamples,
        metricDroppedSamples,
        scientificTime: simulation.scientific_time(),
        stateLength: state?.length ?? 0,
        neighbourStrategy: simulation.neighbour_strategy(),
        metricCount: simulation.metric_count(),
        state,
      });
      return;
    }
    if (message.type === "apply-setup") {
      stopLoop();
      const setup = simulationValues(message.setup);
      activeArenaSize = setup.arenaSize;
      activePhysicsDt = setup.physicsDt;
      simulation.set_experiment(
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
        JSON.stringify(setup.environment),
        JSON.stringify(message.ir),
        JSON.stringify(metricsIr(message)),
        JSON.stringify(message.parameters ?? {}),
      );
      activeSeed = setup.seed >>> 0;
      pacer = new RuntimePacer(activePhysicsDt);
      resetMetricTransportClock();
      emitEnvironment();
      emitSnapshot("setup-applied");
      return;
    }
    if (message.type === "apply-controller") {
      stopLoop();
      simulation.set_controller(JSON.stringify(message.ir), JSON.stringify(message.parameters ?? {}));
      simulation.set_metrics(JSON.stringify(metricsIr(message)), JSON.stringify(message.parameters ?? {}));
      resetMetricTransportClock();
      emitSnapshot("controller-applied");
      return;
    }
    if (message.type === "apply-metrics") {
      stopLoop();
      simulation.set_metrics(JSON.stringify(metricsIr(message)), JSON.stringify(message.parameters ?? {}));
      resetMetricTransportClock();
      emitSnapshot("metrics-applied-snapshot");
      self.postMessage({ type: "metrics-applied", metricCount: simulation.metric_count() });
      return;
    }
    if (message.type === "reset") {
      stopLoop();
      simulation.reset();
      resetMetricTransportClock();
      emitSnapshot("reset");
      return;
    }
    self.postMessage({ type: "error", message: `unknown worker message '${message.type}'` });
  } catch (error) {
    stopLoop();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const type = message.type === "apply-setup"
      ? "setup-error"
      : message.type === "apply-metrics"
        ? "metrics-error"
        : "controller-runtime-error";
    self.postMessage({ type, message: errorMessage });
  }
});

loadWasm().catch((error) => {
  stopLoop();
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
});
