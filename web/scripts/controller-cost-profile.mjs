import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4173/");
const manifest = await fetch(new URL("build-manifest.json", baseUrl)).then((response) => {
  if (!response.ok) throw new Error(`build manifest HTTP ${response.status}`);
  return response.json();
});
const url = new URL(`${manifest.assetDir}/performance-profile.html`, baseUrl).href;
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-controller-cost-chrome-${process.pid}`;

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
  const [controllerModule, configModule, initializerModule, runtimeModule] = await Promise.all([
    import("./controller/compiler.js"),
    import("./config/compiler.js"),
    import("./initializer/compiler.js"),
    import("./runtime/contract.js"),
  ]);
  const { compileController } = controllerModule;
  const { compileConfig, numericParameters } = configModule;
  const { compileInitializer } = initializerModule;
  const { simulationSetupFromRuntime, validateInitialStateForRuntime, validateRuntimeValues } = runtimeModule;

  const configSource = `# EXPERIMENTAL SETUP
N = 91
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
`;
  const initializerSource = `def hexagon_perturbed(config, rng, place):
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

def initialize(config, rng, place):
    hexagon_perturbed(config, rng, place)
`;

  const controllers = [
    {
      key: "active-elastic-real",
      source: `class ActiveElasticAgent(Agent):
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
`,
    },
    {
      key: "neighbour-loop-vector-only",
      source: `class VectorLoopProbe(Agent):
    def step(self, obs):
        proximal = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            proximal += displacement
        return Motion(dot(proximal, obs.heading), 0.0)
`,
    },
    {
      key: "neighbour-loop-norm",
      source: `class NormLoopProbe(Agent):
    def step(self, obs):
        proximal = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            proximal += displacement / distance
        return Motion(dot(proximal, obs.heading), 0.0)
`,
    },
    {
      key: "neighbour-loop-pow",
      source: `class PowLoopProbe(Agent):
    def step(self, obs):
        proximal = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            ratio = DESIRED_DISTANCE / distance
            magnitude = pow(ratio, POTENTIAL_ALPHA) + pow(ratio, 2.0 * POTENTIAL_ALPHA)
            proximal += magnitude * displacement / distance
        return Motion(dot(proximal, obs.heading), 0.0)
`,
    },
    {
      key: "constant",
      source: `class ConstantProbe(Agent):
    def step(self, obs):
        return Motion(0.0, 0.0)
`,
    },
  ];

  const config = compileConfig(configSource);
  const runtimeValues = {
    ...config.values,
    INTERACTION_RADIUS: config.values.PROXIMAL_RANGE,
    MAX_FORWARD_SPEED: config.values.U,
    MAX_ANGULAR_SPEED: config.values.OMEGA_MAX,
  };
  const runtime = validateRuntimeValues(runtimeValues);
  const initializer = compileInitializer(initializerSource);
  const initialState = initializer.initialize(config.values, 1);
  validateInitialStateForRuntime(initialState, runtime);
  const setup = simulationSetupFromRuntime(initialState, runtime, 1);

  const waitMessage = (worker, predicate, timeoutMs = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("worker profile message timed out"));
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

  const advanceTimed = async (worker, ticks) => {
    const result = waitMessage(worker, (message) => message.type === "advanced");
    const start = performance.now();
    worker.postMessage({ type: "advance", ticks });
    await result;
    return performance.now() - start;
  };

  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const results = [];
  for (const controllerSpec of controllers) {
    const compiled = compileController(controllerSpec.source);
    const parameters = numericParameters(config.values, compiled.parameters);
    const samples = [];
    for (let repetition = 0; repetition < 5; repetition += 1) {
      const worker = new Worker("./worker.js", { type: "module" });
      await waitMessage(worker, (message) => message.type === "wasm-ready");
      const snapshot = waitMessage(worker, (message) => message.type === "snapshot");
      worker.postMessage({ type: "initialize", setup, ir: compiled.ir, parameters });
      await snapshot;
      await advanceTimed(worker, 100);
      samples.push(await advanceTimed(worker, 1000));
      worker.terminate();
    }
    const roundtripMs = median(samples);
    results.push({
      key: controllerSpec.key,
      agents: initialState.length,
      ticks: 1000,
      model_seconds: 10,
      roundtrip_ms: roundtripMs,
      model_seconds_per_wall_second: 10 / (roundtripMs / 1000),
      samples_ms: samples,
    });
  }

  return {
    profile_version: 1,
    mode: "controller-cost-attribution",
    user_agent: navigator.userAgent,
    hardware_concurrency: navigator.hardwareConcurrency,
    setup: {
      agents: initialState.length,
      interaction_radius: runtime.INTERACTION_RADIUS,
      initialization: "ordered-hexagonal",
    },
    results,
  };
}

let socket;
try {
  const port = await waitForPort();
  const wsUrl = await waitForTarget(port);
  const connection = connect(wsUrl);
  socket = connection.socket;
  const { send } = connection;
  await send("Runtime.enable");
  const expression = `(${profileInPage.toString()})()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "profile evaluation failed");
  console.log(JSON.stringify(result.result.value, null, 2));
} catch (error) {
  console.error(error.stack || String(error));
  if (chromeLog) console.error(chromeLog);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  child.kill("SIGTERM");
}
