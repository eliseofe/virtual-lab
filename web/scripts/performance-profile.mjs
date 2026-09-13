import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4173/");
const manifest = await fetch(new URL("build-manifest.json", baseUrl)).then((response) => {
  if (!response.ok) throw new Error(`build manifest HTTP ${response.status}`);
  return response.json();
});
const url = new URL(`${manifest.assetDir}/performance-profile.html`, baseUrl).href;
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-performance-chrome-${process.pid}`;

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
  const CONTROL_DT = 0.10;
  const METRIC_DT = 0.10;
  const IR = {
    schema: "vlab.controller-ir/0.1",
    language: "python-vlab/0.1",
    controller: "PerformanceProbeAgent",
    entry: "step",
    parameters: {},
    state: [],
    body: [
      { kind: "assign", target: "sum", value: { kind: "call", name: "Vec2", args: [{ kind: "const", value: 0 }, { kind: "const", value: 0 }] } },
      { kind: "for_each", variable: "neighbour", iterable: { kind: "load", path: "obs.neighbours" }, body: [
        { kind: "aug_assign", target: "sum", op: "+", value: { kind: "load", path: "neighbour.relative_position" } },
      ] },
      { kind: "return", value: { kind: "call", name: "Motion", args: [
        { kind: "call", name: "dot", args: [{ kind: "load", path: "sum" }, { kind: "load", path: "obs.heading" }] },
        { kind: "const", value: 0 },
      ] } },
    ],
  };

  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const makeState = (count) => {
    const arenaSize = Math.sqrt(count);
    const side = Math.ceil(Math.sqrt(count));
    const spacing = arenaSize / side;
    const half = arenaSize / 2;
    return {
      arenaSize,
      state: Array.from({ length: count }, (_, index) => ({
        x: -half + ((index % side) + 0.5) * spacing,
        y: -half + (Math.floor(index / side) + 0.5) * spacing,
        heading: (index % 32) * 0.03125,
      })),
    };
  };
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
  const createWorker = async (count) => {
    const { arenaSize, state } = makeState(count);
    const worker = new Worker("./worker.js", { type: "module" });
    await waitMessage(worker, (message) => message.type === "wasm-ready");
    const snapshot = waitMessage(worker, (message) => message.type === "snapshot");
    worker.postMessage({
      type: "initialize",
      setup: {
        initialState: state,
        simulation: {
          seed: 1,
          physicsDt: PHYSICS_DT,
          controlDt: CONTROL_DT,
          metricDt: METRIC_DT,
          interactionRadius: 1.0,
          arenaSize,
          sensorNoise: 0.0,
          maxForwardSpeed: 10000.0,
          maxAngularSpeed: 10000.0,
        },
      },
      ir: IR,
      parameters: {},
    });
    await snapshot;
    return worker;
  };
  const advance = async (worker, ticks) => {
    const result = waitMessage(worker, (message) => message.type === "advanced");
    const start = performance.now();
    worker.postMessage({ type: "advance", ticks });
    await result;
    return performance.now() - start;
  };
  const reset = async (worker) => {
    const result = waitMessage(worker, (message) => message.type === "reset");
    worker.postMessage({ type: "reset" });
    await result;
  };

  const batches = [];
  for (const count of [100, 1000, 10000]) {
    const worker = await createWorker(count);
    await advance(worker, 10);
    for (const ticks of [0, 10, 100]) {
      const samples = [];
      for (let repetition = 0; repetition < 5; repetition += 1) samples.push(await advance(worker, ticks));
      const roundtripMs = median(samples);
      batches.push({
        agents: count,
        ticks,
        roundtrip_ms: roundtripMs,
        model_seconds_per_wall_second: ticks > 0 ? (ticks * PHYSICS_DT) / (roundtripMs / 1000) : null,
      });
    }
    worker.terminate();
  }

  const scheduler = [];
  const schedulerWorker = await createWorker(1000);
  for (const requestedSpeed of [20, 60, 120, 240, 480]) {
    await reset(schedulerWorker);
    const batchTicks = Math.max(1, Math.round((0.05 * requestedSpeed) / PHYSICS_DT));
    const start = performance.now();
    let completedTicks = 0;
    let pending = null;
    const timer = setInterval(() => {
      if (pending) return;
      pending = advance(schedulerWorker, batchTicks)
        .then(() => { completedTicks += batchTicks; })
        .finally(() => { pending = null; });
    }, 50);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    clearInterval(timer);
    if (pending) await pending;
    const elapsedMs = performance.now() - start;
    scheduler.push({
      agents: 1000,
      requested_speed: requestedSpeed,
      batch_ticks: batchTicks,
      completed_ticks: completedTicks,
      elapsed_ms: elapsedMs,
      achieved_speed: (completedTicks * PHYSICS_DT) / (elapsedMs / 1000),
    });
  }
  schedulerWorker.terminate();

  return {
    profile_version: 1,
    user_agent: navigator.userAgent,
    hardware_concurrency: navigator.hardwareConcurrency,
    batch_roundtrips: batches,
    scheduler,
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
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "browser profile failed");
  const value = result?.result?.value;
  if (!value) throw new Error("browser profile returned no result");
  console.log(JSON.stringify(value, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
