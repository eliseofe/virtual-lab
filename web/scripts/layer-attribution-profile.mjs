import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4173/");
const manifest = await fetch(new URL("build-manifest.json", baseUrl)).then((response) => {
  if (!response.ok) throw new Error(`build manifest HTTP ${response.status}`);
  return response.json();
});
const url = new URL(`${manifest.assetDir}/performance-profile.html`, baseUrl).href;
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-layer-attribution-${process.pid}`;

const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });

let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools started (code ${child.exitCode})`);
    try {
      const text = await readFile(`${profile}/DevToolsActivePort`, "utf8");
      const port = Number(text.split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome did not publish DevToolsActivePort");
}

async function json(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await json(port, "/json/list");
    const target = targets.find((item) => item.type === "page" && item.url.startsWith("http"));
    if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error("Chrome DevTools page target did not appear");
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = async (method, params = {}) => {
    await ready;
    const id = nextId++;
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return promise;
  };
  return { socket, send };
}

async function profileInPage() {
  const AGENTS = 5000;
  const ARENA_SIZE = 40.0;
  const PROFILE_TICKS = 100;
  const SATURATION_SPEED = 240;
  const RUN_MS = 1800;

  const [controllerModule, configModule, initializerModule, runtimeModule, cameraModule] = await Promise.all([
    import("./controller/compiler.js"),
    import("./config/compiler.js"),
    import("./initializer/compiler.js"),
    import("./runtime/contract.js"),
    import("./visualization/camera.js"),
  ]);
  const { compileController } = controllerModule;
  const { compileConfig, numericParameters } = configModule;
  const { compileInitializer } = initializerModule;
  const { simulationSetupFromRuntime, validateInitialStateForRuntime, validateRuntimeValues } = runtimeModule;
  const { ArenaCamera } = cameraModule;

  const configSource = `N = ${AGENTS}\nARENA_SIZE = ${ARENA_SIZE}\nINITIALIZATION_METHOD = "hexagon_perturbed"\nINITIAL_POSITION_NOISE = 0.0\nCONTROL_DT = 0.1\nSENSOR_NOISE = 0.1\nEXPERIMENT_DURATION = 25000.0\nU = 0.005\nOMEGA_MAX = 1.5707963267948966\nK1 = 0.005\nK2 = 0.06\nPOTENTIAL_ALPHA = 2.0\nPOTENTIAL_EPSILON = 1.5\nDESIRED_DISTANCE = 0.45\nPROXIMAL_RANGE = 0.81\n`;
  const initializerSource = `def hexagon_perturbed(config, rng, place):\n    radius = ceil((sqrt(12.0 * config.N - 3.0) - 3.0) / 6.0)\n    i = 0\n    for q in range(-radius, radius + 1):\n        for r in range(-radius, radius + 1):\n            s = -q - r\n            if max(abs(q), abs(r), abs(s)) <= radius:\n                if i < config.N:\n                    x = config.DESIRED_DISTANCE * (q + 0.5 * r)\n                    y = config.DESIRED_DISTANCE * SQRT3_OVER_2 * r\n                    x += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)\n                    y += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)\n                    theta = rng.uniform(0.0, TAU)\n                    place(i, x, y, theta)\n                    i += 1\n\ndef initialize(config, rng, place):\n    hexagon_perturbed(config, rng, place)\n`;
  const controllerSource = `class ActiveElasticAgent(Agent):\n    def step(self, obs):\n        proximal = Vec2(0.0, 0.0)\n        sigma_lj = DESIRED_DISTANCE / pow(2.0, 1.0 / POTENTIAL_ALPHA)\n        for neighbour in obs.neighbours:\n            displacement = neighbour.relative_position\n            distance = norm(displacement)\n            ratio = sigma_lj / distance\n            magnitude = -(4.0 * POTENTIAL_ALPHA * POTENTIAL_EPSILON / distance) * (2.0 * pow(ratio, 2.0 * POTENTIAL_ALPHA) - pow(ratio, POTENTIAL_ALPHA))\n            proximal += magnitude * displacement / distance\n        forward = K1 * dot(proximal, obs.heading) + U\n        turning = K2 * dot(proximal, perpendicular(obs.heading))\n        return Motion(forward, turning)\n`;

  const config = compileConfig(configSource);
  const runtimeValues = {
    ...config.values,
    INTERACTION_RADIUS: config.values.PROXIMAL_RANGE,
    MAX_FORWARD_SPEED: config.values.U,
    MAX_ANGULAR_SPEED: config.values.OMEGA_MAX,
  };
  const runtime = validateRuntimeValues(runtimeValues);
  const seed = 2026;
  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
  const initializer = compileInitializer(initializerSource, initializerConfig);
  validateInitialStateForRuntime(initializer.state, runtime);
  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const ir = compileController(controllerSource, { parameters: parameterTypes });
  const setup = simulationSetupFromRuntime(runtime, seed, initializer.state);
  const PHYSICS_DT = setup.simulation.physicsDt;

  const waitMessage = (worker, predicate, timeoutMs = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("#111 worker profile timed out"));
    }, timeoutMs);
    const onMessage = (event) => {
      const message = event.data ?? {};
      if (["error", "controller-runtime-error", "setup-error"].includes(message.type)) {
        clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        reject(new Error(message.message || message.type));
        return;
      }
      if (!predicate(message)) return;
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      resolve(message);
    };
    worker.addEventListener("message", onMessage);
  });

  const createWorker = async () => {
    const worker = new Worker("./worker.js", { type: "module" });
    await waitMessage(worker, (message) => message.type === "wasm-ready");
    const initial = waitMessage(worker, (message) => message.type === "snapshot");
    worker.postMessage({ type: "initialize", setup, ir, parameters });
    const snapshot = await initial;
    return { worker, snapshot };
  };

  const reset = async (worker) => {
    const done = waitMessage(worker, (message) => message.type === "reset");
    worker.postMessage({ type: "reset" });
    return done;
  };

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  };
  const summarize = (values) => ({
    samples: values.length,
    mean_ms: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    median_ms: median(values),
    p95_ms: percentile(values, 0.95),
  });

  const { worker, snapshot: initialSnapshot } = await createWorker();

  // Warm the exact production kernel/controller path before collecting layer timings.
  let warm = waitMessage(worker, (message) => message.type === "profile-advanced");
  worker.postMessage({ type: "profile-advance", ticks: 10, includeState: false });
  await warm;
  await reset(worker);

  const layerSamples = { compute_only: [], with_snapshot: [] };
  let representativeState = initialSnapshot.state;
  for (const includeState of [false, true]) {
    const key = includeState ? "with_snapshot" : "compute_only";
    for (let repetition = 0; repetition < 5; repetition += 1) {
      await reset(worker);
      const done = waitMessage(worker, (message) => message.type === "profile-advanced");
      const started = performance.now();
      worker.postMessage({ type: "profile-advance", ticks: PROFILE_TICKS, includeState });
      const message = await done;
      const roundtripMs = performance.now() - started;
      if (includeState && message.state) representativeState = message.state;
      layerSamples[key].push({
        roundtrip_ms: roundtripMs,
        advance_ms: message.advanceMs,
        snapshot_materialize_ms: message.snapshotMs,
        residual_delivery_ms: Math.max(0, roundtripMs - message.advanceMs - message.snapshotMs),
        state_length: message.stateLength,
      });
    }
  }

  const bytesPerSnapshot = representativeState?.byteLength
    ?? ((representativeState?.length ?? 0) * Float64Array.BYTES_PER_ELEMENT);

  const stateCopySamples = [];
  for (let repetition = 0; repetition < 30; repetition += 1) {
    const started = performance.now();
    Array.from(representativeState);
    stateCopySamples.push(performance.now() - started);
  }

  function drawAgent(context, glyph, x, y, heading, ratio) {
    if (glyph === "dot") {
      context.beginPath();
      context.arc(x, y, 2.8 * ratio, 0, Math.PI * 2);
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

  function renderFrame(canvas, context, flatState, glyph, ratio) {
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#edf2f3";
    context.fillRect(0, 0, width, height);

    const camera = new ArenaCamera();
    const pad = 30 * ratio;
    const frame = camera.frame({ width, height, arenaSize: ARENA_SIZE, padding: pad });
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

    const pixelsPerUnit = frame.pixelsPerUnit;
    const visualGridStep = Math.max(1, Math.ceil((3 * ratio) / Math.max(pixelsPerUnit, 1e-9)));
    const firstGrid = Math.ceil(-halfArena / visualGridStep) * visualGridStep;
    context.beginPath();
    for (let value = firstGrid; value <= halfArena + 1e-9; value += visualGridStep) {
      const x = frame.toCanvasX(value);
      const y = frame.toCanvasY(value);
      context.moveTo(x, arenaTop);
      context.lineTo(x, arenaBottom);
      context.moveTo(arenaLeft, y);
      context.lineTo(arenaRight, y);
    }
    context.strokeStyle = "#e4e9ec";
    context.lineWidth = 1 * ratio;
    context.stroke();
    context.strokeStyle = "#1c4e63";
    context.fillStyle = "#1c4e63";
    context.lineWidth = 1.6 * ratio;
    const margin = 16 * ratio;
    for (let i = 0; i + 2 < flatState.length; i += 3) {
      const x = frame.toCanvasX(flatState[i]);
      const y = frame.toCanvasY(flatState[i + 1]);
      if (x < -margin || x > width + margin || y < -margin || y > height + margin) continue;
      drawAgent(context, glyph, x, y, flatState[i + 2], ratio);
    }
    context.restore();
    context.strokeStyle = "#8da1aa";
    context.lineWidth = 1.6 * ratio;
    context.strokeRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop);
  }

  const renderBenchmarks = [];
  for (const ratio of [1, 3]) {
    const canvas = document.createElement("canvas");
    canvas.width = 960 * ratio;
    canvas.height = 600 * ratio;
    const context = canvas.getContext("2d");
    for (const glyph of ["dot", "directional"]) {
      for (let warmup = 0; warmup < 3; warmup += 1) renderFrame(canvas, context, representativeState, glyph, ratio);
      const samples = [];
      for (let repetition = 0; repetition < 30; repetition += 1) {
        const started = performance.now();
        renderFrame(canvas, context, representativeState, glyph, ratio);
        samples.push(performance.now() - started);
      }
      renderBenchmarks.push({ pixel_ratio: ratio, glyph, ...summarize(samples) });
    }
  }

  async function runConcurrentMode(mode) {
    await reset(worker);
    let latestState = null;
    let snapshots = 0;
    let stateCopyMs = 0;
    const renderSamples = [];
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 600;
    const context = canvas.getContext("2d");
    let active = true;

    const onMessage = (event) => {
      if (event.data?.type !== "snapshot") return;
      snapshots += 1;
      if (mode === "receive-only") return;
      const copyStarted = performance.now();
      latestState = Array.from(event.data.state);
      stateCopyMs += performance.now() - copyStarted;
    };
    worker.addEventListener("message", onMessage);

    const renderLoop = () => {
      if (!active) return;
      if ((mode === "dot" || mode === "directional") && latestState) {
        const started = performance.now();
        renderFrame(canvas, context, latestState, mode, 1);
        renderSamples.push(performance.now() - started);
      }
      requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);

    const started = performance.now();
    worker.postMessage({ type: "run", speed: SATURATION_SPEED });
    await new Promise((resolve) => setTimeout(resolve, RUN_MS));
    const paused = waitMessage(worker, (message) => message.type === "paused");
    worker.postMessage({ type: "pause" });
    const final = await paused;
    const elapsedMs = performance.now() - started;
    active = false;
    worker.removeEventListener("message", onMessage);

    return {
      mode,
      elapsed_ms: elapsedMs,
      scientific_time: final.scientificTime,
      achieved_real_time_factor: final.scientificTime / (elapsedMs / 1000),
      snapshots,
      snapshot_hz: snapshots / (elapsedMs / 1000),
      main_state_copy_total_ms: stateCopyMs,
      render: renderSamples.length ? summarize(renderSamples) : null,
    };
  }

  const concurrent = [];
  for (const mode of ["receive-only", "copy-only", "dot", "directional"]) {
    concurrent.push(await runConcurrentMode(mode));
  }
  worker.terminate();

  const computeAdvance = layerSamples.compute_only.map((sample) => sample.advance_ms);
  const computeRoundtrip = layerSamples.compute_only.map((sample) => sample.roundtrip_ms);
  const snapshotMaterialize = layerSamples.with_snapshot.map((sample) => sample.snapshot_materialize_ms);
  const snapshotResidual = layerSamples.with_snapshot.map((sample) => sample.residual_delivery_ms);
  const baselineResidual = layerSamples.compute_only.map((sample) => sample.residual_delivery_ms);

  return {
    profile_version: 1,
    purpose: "#111 N≈5000 layer attribution; profiling only",
    workload: {
      agents: AGENTS,
      arena_size: ARENA_SIZE,
      seed,
      physics_dt: PHYSICS_DT,
      profile_ticks: PROFILE_TICKS,
      profile_model_seconds: PROFILE_TICKS * PHYSICS_DT,
      controller: "Active Elastic production source, profiling fixture N/arena only",
    },
    environment: {
      user_agent: navigator.userAgent,
      hardware_concurrency: navigator.hardwareConcurrency,
      device_pixel_ratio: window.devicePixelRatio,
    },
    worker_layers: {
      compute_advance: summarize(computeAdvance),
      compute_roundtrip: summarize(computeRoundtrip),
      snapshot_materialize: summarize(snapshotMaterialize),
      snapshot_delivery_residual: summarize(snapshotResidual),
      no_state_delivery_residual: summarize(baselineResidual),
      incremental_state_delivery_ms: Math.max(0, median(snapshotResidual) - median(baselineResidual)),
      bytes_per_snapshot: bytesPerSnapshot,
      raw: layerSamples,
    },
    main_state_array_copy: summarize(stateCopySamples),
    standalone_render: renderBenchmarks,
    concurrent_saturation: concurrent,
  };
}

let cdp;
try {
  const port = await waitForPort();
  cdp = connect(await waitForTarget(port));
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  const expression = `(${profileInPage.toString()})()`;
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "layer attribution profile failed");
  const value = result?.result?.value;
  if (!value) throw new Error("layer attribution profile returned no result");
  console.log(JSON.stringify(value, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
