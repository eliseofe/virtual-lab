import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4173/");
const manifest = await fetch(new URL("build-manifest.json", baseUrl)).then((response) => {
  if (!response.ok) throw new Error(`build manifest HTTP ${response.status}`);
  return response.json();
});
const url = new URL(`${manifest.assetDir}/performance-profile.html`, baseUrl).href;
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-runtime-scheduler-${process.pid}`;

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
  const CONTROL_DT = 0.1;
  const METRIC_DT = 0.1;
  const AGENTS = 10000;
  const ARENA_SIZE = 100;
  const side = Math.ceil(Math.sqrt(AGENTS));
  const spacing = ARENA_SIZE / side;
  const half = ARENA_SIZE / 2;
  const state = Array.from({ length: AGENTS }, (_, index) => ({
    x: -half + ((index % side) + 0.5) * spacing,
    y: -half + (Math.floor(index / side) + 0.5) * spacing,
    heading: (index % 64) * 0.03125,
  }));
  const ir = {
    schema: "vlab.controller-ir/0.1",
    language: "python-vlab/0.1",
    controller: "SchedulerProbeAgent",
    entry: "step",
    parameters: {},
    state: [],
    body: [{
      kind: "return",
      value: { kind: "call", name: "Motion", args: [{ kind: "const", value: 0 }, { kind: "const", value: 0 }] },
    }],
  };
  const setup = {
    initialState: state,
    simulation: {
      seed: 1,
      physicsDt: PHYSICS_DT,
      controlDt: CONTROL_DT,
      metricDt: METRIC_DT,
      interactionRadius: 1,
      arenaSize: ARENA_SIZE,
      sensorNoise: 0,
      maxForwardSpeed: 1,
      maxAngularSpeed: 1,
    },
  };

  const waitMessage = (worker, predicate, timeoutMs = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("runtime scheduler profile timed out"));
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

  const worker = new Worker("./worker.js", { type: "module" });
  await waitMessage(worker, (message) => message.type === "wasm-ready");
  const initial = waitMessage(worker, (message) => message.type === "snapshot");
  worker.postMessage({ type: "initialize", setup, ir, parameters: {} });
  await initial;

  const results = [];
  for (const requestedSpeed of [1, 5, 20, 60, 240]) {
    const reset = waitMessage(worker, (message) => message.type === "reset");
    worker.postMessage({ type: "reset" });
    await reset;

    let snapshots = 0;
    const onSnapshot = (event) => {
      if (event.data?.type === "snapshot") snapshots += 1;
    };
    worker.addEventListener("message", onSnapshot);

    const started = performance.now();
    worker.postMessage({ type: "run", speed: requestedSpeed });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const paused = waitMessage(worker, (message) => message.type === "paused");
    worker.postMessage({ type: "pause" });
    const final = await paused;
    const elapsedMs = performance.now() - started;
    worker.removeEventListener("message", onSnapshot);

    results.push({
      requested_speed: requestedSpeed,
      scientific_time: final.scientificTime,
      physics_ticks: final.physicsTicks,
      elapsed_ms: elapsedMs,
      achieved_speed: final.scientificTime / (elapsedMs / 1000),
      snapshot_count: snapshots,
      snapshot_hz: snapshots / (elapsedMs / 1000),
    });
  }
  worker.terminate();

  return {
    profile_version: 1,
    agents: AGENTS,
    physics_dt: PHYSICS_DT,
    user_agent: navigator.userAgent,
    hardware_concurrency: navigator.hardwareConcurrency,
    results,
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
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "runtime scheduler profile failed");
  const value = result?.result?.value;
  if (!value) throw new Error("runtime scheduler profile returned no result");
  console.log(JSON.stringify(value, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
