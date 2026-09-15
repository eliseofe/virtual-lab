import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4173/");
const manifest = await fetch(new URL("build-manifest.json", baseUrl)).then((response) => {
  if (!response.ok) throw new Error(`build manifest HTTP ${response.status}`);
  return response.json();
});
const url = new URL(`${manifest.assetDir}/performance-profile.html`, baseUrl).href;
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-metric-runtime-chrome-${process.pid}`;

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

async function getJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await getJson(port, "/json/list");
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
  const { compileMetrics } = await import("./metrics/compiler.js");
  const PHYSICS_DT = 0.01;
  const CONTROL_DT = 0.1;
  const METRIC_DT = 0.1;
  const TICKS = 2000;
  const AGENTS = 500;
  const repetitions = 3;
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const controllerIr = {
    schema: "vlab.controller-ir/0.1",
    language: "python-vlab/0.1",
    controller: "MetricProfileAgent",
    entry: "step",
    parameters: {},
    state: [],
    body: [{ kind: "return", value: { kind: "call", name: "Motion", args: [
      { kind: "const", value: 0 }, { kind: "const", value: 0 },
    ] } }],
  };
  const side = Math.ceil(Math.sqrt(AGENTS));
  const arenaSize = Math.max(10, side * 1.1);
  const half = arenaSize / 2;
  const initialState = Array.from({ length: AGENTS }, (_, index) => ({
    x: -half + ((index % side) + 0.5) * 1.0,
    y: -half + (Math.floor(index / side) + 0.5) * 1.0,
    heading: (index % 31) * 0.1,
  }));
  const setup = {
    initialState,
    simulation: {
      seed: 197,
      physicsDt: PHYSICS_DT,
      controlDt: CONTROL_DT,
      metricDt: METRIC_DT,
      interactionRadius: 1.0,
      arenaSize,
      sensorNoise: 0.0,
      maxForwardSpeed: 1.0,
      maxAngularSpeed: 1.0,
    },
  };

  const sourceFor = ({ count, interval }) => Array.from({ length: count }, (_, index) => `@metric(id="profile.m${index}", name="Probe ${index}", unit=None, sampling=every(${interval}))\ndef m${index}(snapshot):\n    return snapshot.agent_count\n`).join("\n");
  const cases = [
    { key: "zero", source: "" },
    { key: "one-0.1s", source: sourceFor({ count: 1, interval: 0.1 }) },
    { key: "four-0.1s", source: sourceFor({ count: 4, interval: 0.1 }) },
    { key: "four-0.02s", source: sourceFor({ count: 4, interval: 0.02 }) },
    { key: "four-0.5s", source: sourceFor({ count: 4, interval: 0.5 }) },
  ];

  const waitMessage = (worker, predicate, timeoutMs = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("metric runtime profile timed out"));
    }, timeoutMs);
    const onMessage = (event) => {
      const message = event.data ?? {};
      if (["error", "controller-runtime-error", "setup-error", "metrics-error", "metrics-runtime-error"].includes(message.type)) {
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

  const createWorker = async (metricsIr) => {
    const worker = new Worker("./worker.js", { type: "module" });
    await waitMessage(worker, (message) => message.type === "wasm-ready");
    const ready = waitMessage(worker, (message) => message.type === "ready");
    worker.postMessage({ type: "initialize", setup, ir: controllerIr, metricsIr, parameters: {} });
    await ready;
    return worker;
  };

  const run = async (testCase, metricTransport, includeState = false) => {
    const metricsIr = compileMetrics(testCase.source);
    const worker = await createWorker(metricsIr);
    const result = waitMessage(worker, (message) => message.type === "profile-advanced");
    worker.postMessage({ type: "profile-advance", ticks: TICKS, metricTransport, includeState });
    const message = await result;
    worker.terminate();
    return message;
  };

  const results = [];
  for (const testCase of cases) {
    for (const metricTransport of [false, true]) {
      const samples = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        samples.push(await run(testCase, metricTransport));
      }
      results.push({
        case: testCase.key,
        metric_count: samples[0].metricCount,
        transport: metricTransport,
        advance_ms: median(samples.map((sample) => sample.advanceMs)),
        transport_ms: median(samples.map((sample) => sample.metricTransportMs)),
        transport_bytes: median(samples.map((sample) => sample.metricTransportBytes)),
        emitted_samples: median(samples.map((sample) => sample.metricSamples)),
        dropped_samples: Math.max(...samples.map((sample) => sample.metricDroppedSamples)),
      });
    }
  }

  const baselineState = (await run(cases[0], true, true)).state;
  const measuredState = (await run(cases[2], true, true)).state;
  const deterministic = baselineState.length === measuredState.length
    && baselineState.every((value, index) => Object.is(value, measuredState[index]));
  if (!deterministic) throw new Error("Metrics changed the deterministic simulation trajectory");
  if (results.some((result) => result.dropped_samples !== 0)) {
    throw new Error("Metric profile overflowed the managed sample buffer");
  }

  return {
    version: "vlab.metric-runtime-profile/0.1",
    agents: AGENTS,
    ticks: TICKS,
    repetitions,
    deterministic_trajectory_with_metrics: deterministic,
    results,
  };
}

let socket;
try {
  const port = await waitForPort();
  const wsUrl = await waitForTarget(port);
  const connection = connect(wsUrl);
  socket = connection.socket;
  const expression = `(${profileInPage.toString()})()`;
  const result = await connection.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "page profile failed");
  }
  console.log(JSON.stringify(result.result.value, null, 2));
} catch (error) {
  console.error(chromeLog);
  throw error;
} finally {
  socket?.close();
  child.kill("SIGTERM");
}
