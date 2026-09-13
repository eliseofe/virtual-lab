import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4173/");
const manifest = await fetch(new URL("build-manifest.json", baseUrl)).then((response) => {
  if (!response.ok) throw new Error(`build manifest HTTP ${response.status}`);
  return response.json();
});
const url = new URL(`${manifest.assetDir}/performance-profile.html`, baseUrl).href;
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-isolation-chrome-${process.pid}`;

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
  const PHYSICS_DT = 0.01;
  const TRIVIAL_IR = {
    schema: "vlab.controller-ir/0.1",
    language: "python-vlab/0.1",
    controller: "IsolationProbeAgent",
    entry: "step",
    parameters: {},
    state: [],
    body: [{
      kind: "return",
      value: {
        kind: "call",
        name: "Motion",
        args: [{ kind: "const", value: 0 }, { kind: "const", value: 0 }],
      },
    }],
  };

  const [configModule, initializerModule, runtimeModule] = await Promise.all([
    import("./config/compiler.js"),
    import("./initializer/compiler.js"),
    import("./runtime/contract.js"),
  ]);
  const { compileConfig } = configModule;
  const { compileInitializer } = initializerModule;
  const { simulationSetupFromRuntime, validateInitialStateForRuntime, validateRuntimeValues } = runtimeModule;

  const specs = [
    {
      key: "active-elastic-ordered",
      title: "Active Elastic — authoring contract test",
      experiment_id: "b57a9113-32d5-4c82-928b-22ceec2c4a2b",
      revision: 1,
      compatibility_aliases: true,
      config_source: `N = 91
ARENA_SIZE = 10.0
INITIALIZATION_METHOD = "hexagon_perturbed"
INITIAL_POSITION_NOISE = 0.0
CONTROL_DT = 0.1
SENSOR_NOISE = 0.1
EXPERIMENT_DURATION = 25000.0
U = 0.005
OMEGA_MAX = 1.5707963267948966
K1 = 0.005
K2 = 0.06
POTENTIAL_ALPHA = 2.0
POTENTIAL_EPSILON = 1.5
DESIRED_DISTANCE = 0.45
PROXIMAL_RANGE = 0.81
`,
      initializer_source: `def hexagon_perturbed(config, rng, place):
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
`,
    },
    {
      key: "simple-random-walk-disordered",
      title: "Simple Random Walk",
      experiment_id: "75a313d5-150a-4831-b4f7-b02255a1482e",
      revision: 3,
      compatibility_aliases: false,
      config_source: `N = 100
ARENA_SIZE = 10.0
CONTROL_DT = 0.1
SENSOR_NOISE = 0.0
EXPERIMENT_DURATION = 200.0
INTERACTION_RADIUS = 1.0
MAX_FORWARD_SPEED = 0.1
MAX_ANGULAR_SPEED = 1.5707963267948966
SPEED = 0.05
`,
      initializer_source: `def random_uniform(config, rng, place):
    half = config.ARENA_SIZE / 2.0
    for i in range(config.N):
        x = rng.uniform(-half, half)
        y = rng.uniform(-half, half)
        theta = rng.uniform(0.0, TAU)
        place(i, x, y, theta)

def initialize(config, rng, place):
    random_uniform(config, rng, place)
`,
    },
  ];

  const waitMessage = (worker, predicate, timeoutMs = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("worker isolation-profile message timed out"));
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

  const compileSetup = (spec, seed = 1) => {
    const config = compileConfig(spec.config_source);
    const runtimeValues = spec.compatibility_aliases ? {
      ...config.values,
      INTERACTION_RADIUS: config.values.INTERACTION_RADIUS ?? config.values.PROXIMAL_RANGE,
      MAX_FORWARD_SPEED: config.values.MAX_FORWARD_SPEED ?? config.values.U,
      MAX_ANGULAR_SPEED: config.values.MAX_ANGULAR_SPEED ?? config.values.OMEGA_MAX,
    } : config.values;
    const runtime = validateRuntimeValues(runtimeValues);
    const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
    const initializer = compileInitializer(spec.initializer_source, initializerConfig);
    validateInitialStateForRuntime(initializer.state, runtime);
    return {
      setup: simulationSetupFromRuntime(runtime, seed, initializer.state),
      interactionRadius: runtime.interactionRadius,
      arenaSize: runtime.arenaSize,
    };
  };

  const createWorker = async (compiled) => {
    const worker = new Worker("./worker.js", { type: "module" });
    await waitMessage(worker, (message) => message.type === "wasm-ready");
    const snapshot = waitMessage(worker, (message) => message.type === "snapshot");
    worker.postMessage({
      type: "initialize",
      setup: compiled.setup,
      ir: TRIVIAL_IR,
      parameters: {},
    });
    const initialSnapshot = await snapshot;
    return { worker, initialSnapshot };
  };

  const advanceTimed = async (worker, ticks) => {
    const pending = waitMessage(worker, (message) => message.type === "advanced");
    const start = performance.now();
    worker.postMessage({ type: "advance", ticks });
    const message = await pending;
    return { elapsedMs: performance.now() - start, message };
  };

  const reset = async (worker) => {
    const pending = waitMessage(worker, (message) => message.type === "reset");
    worker.postMessage({ type: "reset" });
    return pending;
  };

  const averageNeighbourCount = (flatState, radius, arenaSize) => {
    const count = flatState.length / 3;
    const radius2 = radius * radius;
    let directedNeighbours = 0;
    const minimumImage = (delta) => delta - arenaSize * Math.round(delta / arenaSize);
    for (let i = 0; i < count; i += 1) {
      const ix = flatState[i * 3];
      const iy = flatState[i * 3 + 1];
      for (let j = i + 1; j < count; j += 1) {
        const dx = minimumImage(flatState[j * 3] - ix);
        const dy = minimumImage(flatState[j * 3 + 1] - iy);
        if ((dx * dx) + (dy * dy) <= radius2) directedNeighbours += 2;
      }
    }
    return directedNeighbours / count;
  };

  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const workloads = [];
  for (const spec of specs) {
    const compiled = compileSetup(spec);
    const { worker, initialSnapshot } = await createWorker(compiled);
    const windows = [];
    for (const ticks of [10, 100, 1000]) {
      const samples = [];
      let finalSnapshot = null;
      for (let repetition = 0; repetition < 5; repetition += 1) {
        await reset(worker);
        const result = await advanceTimed(worker, ticks);
        samples.push(result.elapsedMs);
        finalSnapshot = result.message;
      }
      const roundtripMs = median(samples);
      windows.push({
        ticks,
        model_seconds: ticks * PHYSICS_DT,
        roundtrip_ms: roundtripMs,
        model_seconds_per_wall_second: (ticks * PHYSICS_DT) / (roundtripMs / 1000),
        avg_neighbours_at_end: averageNeighbourCount(finalSnapshot.state, compiled.interactionRadius, compiled.arenaSize),
      });
    }
    workloads.push({
      key: spec.key,
      title: spec.title,
      experiment_id: spec.experiment_id,
      revision: spec.revision,
      controller_mode: "trivial-zero-motion-no-neighbour-access",
      agents: initialSnapshot.agentCount,
      arena_size: compiled.arenaSize,
      interaction_radius: compiled.interactionRadius,
      avg_neighbours_at_start: averageNeighbourCount(initialSnapshot.state, compiled.interactionRadius, compiled.arenaSize),
      windows,
    });
    worker.terminate();
  }

  return {
    profile_version: 1,
    mode: "real-workload-controller-isolation",
    user_agent: navigator.userAgent,
    hardware_concurrency: navigator.hardwareConcurrency,
    companion_actual_controller_profile: "browser-profile.json.real_workloads",
    workloads,
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
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "real workload isolation profile failed");
  const value = result?.result?.value;
  if (!value) throw new Error("real workload isolation profile returned no result");
  console.log(JSON.stringify(value, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
