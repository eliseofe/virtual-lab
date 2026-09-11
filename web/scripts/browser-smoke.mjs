import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-chrome-${process.pid}`;

const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });

let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools started (code ${child.exitCode})`);
    try {
      const text = await readFile(`${profile}/DevToolsActivePort`, "utf8");
      const port = Number(text.split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError ?? new Error("Chrome did not publish DevToolsActivePort");
}

async function json(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(port) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await json(port, "/json/list");
      const target = targets.find((item) => item.type === "page" && item.url.startsWith("http"));
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError ?? new Error("Chrome DevTools page target did not appear");
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      exceptions.push(details?.exception?.description ?? details?.text ?? "JavaScript exception");
    }
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
  return { socket, send, exceptions };
}

async function state(send) {
  const expression = `JSON.stringify({
    status: document.querySelector('#worker-status')?.textContent ?? null,
    statusState: document.querySelector('#worker-status')?.dataset.state ?? null,
    setupFeedback: document.querySelector('#setup-feedback')?.textContent ?? null,
    setupError: document.querySelector('#setup-error')?.textContent ?? null,
    controllerFeedback: document.querySelector('#compile-feedback')?.textContent ?? null,
    controllerError: document.querySelector('#compile-error')?.textContent ?? null,
    configValue: document.querySelector('#experiment-config')?.value ?? null,
    initializerValue: document.querySelector('#initializer-source')?.value ?? null,
    controllerValue: document.querySelector('#controller-source')?.value ?? null,
    scientificTime: document.querySelector('#scientific-time')?.textContent ?? null,
    physicsTicks: document.querySelector('#physics-ticks')?.textContent ?? null,
    speed: document.querySelector('#simulation-speed')?.value ?? null,
    speedLabel: document.querySelector('#simulation-speed-value')?.textContent ?? null,
    actualSpeed: document.querySelector('#actual-simulation-speed')?.textContent ?? null,
    runSeed: document.querySelector('#run-seed')?.textContent ?? null
  })`;
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  const value = result?.result?.value;
  return value ? JSON.parse(value) : null;
}

let cdp;
try {
  const port = await waitForPort();
  const wsUrl = await waitForTarget(port);
  cdp = connect(wsUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  let latest = null;
  let succeeded = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    latest = await state(cdp.send);
    if (latest?.statusState === "ready" && /Kernel .* ready/.test(latest.status ?? "")) {
      const requiredConfig = [
        'INITIALIZATION_METHOD = "hexagon_perturbed"', "ARENA_SIZE = 10.0", "CONTROL_DT = 0.1",
        "INITIAL_POSITION_NOISE = 0.0", "U = 0.005", "OMEGA_MAX = 1.5707963267948966",
        "K1 = 0.005", "K2 = 0.06", "DESIRED_DISTANCE = 0.45", "PROXIMAL_RANGE = 0.81",
      ];
      for (const marker of requiredConfig) {
        if (!latest.configValue?.includes(marker)) throw new Error(`preloaded config is missing '${marker}'`);
      }
      for (const removed of ["PHYSICS_DT =", "METRIC_DT =", "NEIGHBOUR_RADIUS =", "K3 =", "V0 = U", "SPRING_K =", "SEED ="]) {
        if (latest.configValue?.includes(removed)) throw new Error(`preloaded config still exposes '${removed}'`);
      }
      for (const marker of ["def hexagon_perturbed", "def random_uniform", "config.DESIRED_DISTANCE", "config.ARENA_SIZE", "place(i, x, y, theta)"]) {
        if (!latest.initializerValue?.includes(marker)) throw new Error(`preloaded initializer is missing '${marker}'`);
      }
      for (const marker of ["class ActiveElasticAgent", "pow(2.0, 1.0 / POTENTIAL_ALPHA)", "K1 * dot(proximal, obs.heading) + U", "K2 * dot(proximal, perpendicular(obs.heading))"]) {
        if (!latest.controllerValue?.includes(marker)) throw new Error(`controller source is missing '${marker}'`);
      }
      if (latest.speed !== "20" || latest.speedLabel !== "20×") throw new Error(`runtime speed did not default to 20×: ${JSON.stringify(latest)}`);
      if (latest.runSeed !== "2026") throw new Error(`initial run seed is not the deterministic default: ${JSON.stringify(latest)}`);

      await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#run').click()" });
      await sleep(700);
      const running = await state(cdp.send);
      const firstTime = Number(running?.scientificTime ?? 0);
      if (!(firstTime > 1.0)) throw new Error(`default accelerated simulation did not advance faster than the old 1× ceiling: ${JSON.stringify(running)}`);
      if (!/^\d+(?:\.\d+)?×$/.test(running?.actualSpeed ?? "")) throw new Error(`actual runtime factor did not become numeric while running: ${JSON.stringify(running)}`);
      if (running?.statusState === "error") throw new Error(`simulation entered error state after Run: ${JSON.stringify(running)}`);

      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const speed = document.querySelector('#simulation-speed');
          speed.value = '60';
          speed.dispatchEvent(new Event('input', { bubbles: true }));
        })()`,
      });
      const beforeSpeedChange = Number(running?.scientificTime ?? 0);
      await sleep(350);
      const faster = await state(cdp.send);
      const afterSpeedChange = Number(faster?.scientificTime ?? 0);
      if (faster?.speed !== "60" || faster?.speedLabel !== "60×") throw new Error(`live speed control did not update without restart: ${JSON.stringify(faster)}`);
      if (!(afterSpeedChange > beforeSpeedChange)) throw new Error(`scientific time did not continue after live speed change: ${JSON.stringify(faster)}`);
      if (!/^\d+(?:\.\d+)?×$/.test(faster?.actualSpeed ?? "")) throw new Error(`actual runtime factor did not recover after live speed change: ${JSON.stringify(faster)}`);
      if (faster?.statusState === "error") throw new Error(`simulation entered error state after live speed change: ${JSON.stringify(faster)}`);
      await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#pause').click()" });

      await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#restart').click()" });
      await sleep(120);
      const replay = await state(cdp.send);
      if (replay?.runSeed !== "2026" || Number(replay?.scientificTime ?? -1) !== 0) throw new Error(`same-seed restart did not preserve seed and reset time: ${JSON.stringify(replay)}`);

      await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#restart-new-seed').click()" });
      await sleep(180);
      const randomized = await state(cdp.send);
      if (!/^\d+$/.test(randomized?.runSeed ?? "") || randomized.runSeed === "2026") throw new Error(`new-seed restart did not produce a distinct visible seed: ${JSON.stringify(randomized)}`);
      if (Number(randomized?.scientificTime ?? -1) !== 0) throw new Error(`new-seed restart did not reset scientific time: ${JSON.stringify(randomized)}`);
      if (randomized?.statusState === "error") throw new Error(`new-seed restart entered error state: ${JSON.stringify(randomized)}`);

      const randomizedSeed = randomized.runSeed;
      await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#restart').click()" });
      await sleep(120);
      const replayRandomized = await state(cdp.send);
      if (replayRandomized?.runSeed !== randomizedSeed || Number(replayRandomized?.scientificTime ?? -1) !== 0) throw new Error(`same-seed restart did not preserve the new seed: ${JSON.stringify(replayRandomized)}`);

      console.log(JSON.stringify(replayRandomized, null, 2));
      console.log("Browser reached kernel ready, reported measured speed, changed runtime speed live, and verified same-seed/new-seed restart controls.");
      succeeded = true;
      break;
    }
    if (latest?.statusState === "error") throw new Error(`browser reported startup error: ${JSON.stringify(latest)}`);
    await sleep(100);
  }
  if (!succeeded) throw new Error(`browser did not reach kernel ready: ${JSON.stringify(latest)}; exceptions=${JSON.stringify(cdp.exceptions)}`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
