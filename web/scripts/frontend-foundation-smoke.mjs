import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-react-foundation-${process.pid}`;
const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });

let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools started (${child.exitCode})`);
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const targets = await json(port, "/json/list");
    const target = targets.find((item) => item.type === "page" && item.url.startsWith("http"));
    if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error("Chrome page target did not appear");
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

let cdp;
try {
  const port = await waitForPort();
  cdp = connect(await waitForTarget(port));
  await cdp.send("Runtime.enable");

  let state = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const root = document.querySelector('#react-migration-root');
        return {
          root: Boolean(root),
          hidden: Boolean(root?.hidden),
          mounted: Boolean(root?.querySelector('[data-vlab-react-foundation="mounted"]')),
          canvasOutsideRoot: Boolean(document.querySelector('#simulation-canvas')) && !root?.contains(document.querySelector('#simulation-canvas')),
          runOutsideRoot: Boolean(document.querySelector('#run')) && !root?.contains(document.querySelector('#run')),
        };
      })())`,
      returnByValue: true,
    });
    state = JSON.parse(result?.result?.value ?? "null");
    if (state?.mounted) break;
    await sleep(100);
  }

  if (!state?.root || !state.hidden || !state.mounted || !state.canvasOutsideRoot || !state.runOutsideRoot) {
    throw new Error(`React/Mantine coexistence boundary failed: ${JSON.stringify(state)}`);
  }
  console.log(JSON.stringify(state, null, 2));
  console.log("React/Mantine foundation mounted inertly beside the authoritative legacy simulator DOM.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
