import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-result-persistence-chrome-${process.pid}`;
const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--window-size=1280,900",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
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
async function httpJson(port, path) { const r = await fetch(`http://127.0.0.1:${port}${path}`); if (!r.ok) throw new Error(`DevTools HTTP ${r.status}`); return r.json(); }
async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await httpJson(port, "/json/list").catch(() => []);
    const target = targets.find((entry) => entry.type === "page");
    if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error("Chrome page target did not appear");
}
function connect(wsUrl) {
  const socket = new WebSocket(wsUrl); let nextId = 1; const pending = new Map(); const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); if (message.error) reject(new Error(message.error.message)); else resolve(message.result); }
    else if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? "JavaScript exception");
  });
  const ready = new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const send = async (method, params = {}) => { await ready; const id = nextId++; const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject })); socket.send(JSON.stringify({ id, method, params })); return promise; };
  return { socket, send, exceptions };
}
async function evaluate(send, expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response?.exceptionDetails) throw new Error(response.exceptionDetails.text || "Runtime evaluation failed");
  return response?.result?.value;
}

const fakeFsScript = `(() => {
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const toBytes = async (data) => {
    if (typeof data === 'string') return enc.encode(data);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    return enc.encode(String(data ?? ''));
  };
  class FileNode { constructor(name) { this.name = name; this.bytes = new Uint8Array(); } }
  class DirNode { constructor(name) { this.name = name; this.children = new Map(); } }
  const fileHandle = (node) => ({
    kind: 'file', name: node.name,
    async getFile() { return { size: node.bytes.length, text: async () => dec.decode(node.bytes), arrayBuffer: async () => node.bytes.slice().buffer }; },
    async createWritable(options = {}) {
      let bytes = options.keepExistingData ? node.bytes.slice() : new Uint8Array(); let position = 0;
      return {
        async seek(next) { position = Number(next) || 0; },
        async write(data) {
          const incoming = await toBytes(data); const needed = position + incoming.length;
          if (needed > bytes.length) { const grown = new Uint8Array(needed); grown.set(bytes); bytes = grown; }
          bytes.set(incoming, position); position += incoming.length;
        },
        async close() { node.bytes = bytes; },
      };
    },
  });
  const dirHandle = (node) => ({
    kind: 'directory', name: node.name,
    async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
    async getDirectoryHandle(name, options = {}) {
      let child = node.children.get(name);
      if (!child && options.create) { child = new DirNode(name); node.children.set(name, child); }
      if (!(child instanceof DirNode)) throw new DOMException('not a directory', 'TypeMismatchError');
      return dirHandle(child);
    },
    async getFileHandle(name, options = {}) {
      let child = node.children.get(name);
      if (!child && options.create) { child = new FileNode(name); node.children.set(name, child); }
      if (!(child instanceof FileNode)) throw new DOMException('not a file', 'TypeMismatchError');
      return fileHandle(child);
    },
    async *entries() { for (const [name, child] of node.children) yield [name, child instanceof DirNode ? dirHandle(child) : fileHandle(child)]; },
  });
  const root = new DirNode('VirtualLabTest'); const rootHandle = dirHandle(root);
  const dump = (node) => { const out = {}; for (const [name, child] of node.children) out[name] = child instanceof DirNode ? dump(child) : dec.decode(child.bytes); return out; };
  Object.defineProperty(globalThis, 'showDirectoryPicker', { configurable: true, value: async () => rootHandle });
  Object.defineProperty(globalThis, '__vlabFakeFsDump', { configurable: false, value: () => dump(root) });
})();`;

async function snapshot(send) {
  return JSON.parse(await evaluate(send, `JSON.stringify((() => ({
    worker: document.querySelector('#worker-status')?.dataset.state ?? null,
    persistence: globalThis.__vlabResultPersistence?.diagnostics?.() ?? null,
    results: globalThis.__vlabResultsUI ? {
      polarization: globalThis.__vlabResultsUI.sampleCount('polarization'),
      angular: globalThis.__vlabResultsUI.sampleCount('angular_momentum')
    } : null,
    storageStatus: document.querySelector('#results-storage-status')?.textContent ?? null,
    folderButton: document.querySelector('#results-storage-folder')?.textContent ?? null,
    fs: globalThis.__vlabFakeFsDump?.() ?? null
  }))())`));
}

async function waitUntil(send, predicate, label, attempts = 200) {
  let value = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await snapshot(send);
    if (predicate(value)) return value;
    await sleep(100);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(value)}`);
}

function experimentTree(fs) {
  const names = Object.keys(fs ?? {});
  if (names.length !== 1) throw new Error(`expected exactly one Experiment directory, got ${JSON.stringify(names)}`);
  return { name: names[0], tree: fs[names[0]] };
}

let cdp;
try {
  const port = await waitForPort(); cdp = connect(await waitForTarget(port));
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: fakeFsScript });
  await cdp.send("Page.navigate", { url });

  await waitUntil(cdp.send, (s) => s.worker === "ready" && s.persistence && s.results, "persistence startup");
  await evaluate(cdp.send, `document.querySelector('#results-storage-folder')?.click()`);
  await waitUntil(cdp.send, (s) => s.persistence?.mode === "directory" && s.persistence?.rootName === "VirtualLabTest", "directory selection");

  await evaluate(cdp.send, `document.querySelector('#run')?.click()`);
  await waitUntil(cdp.send, (s) => s.results?.polarization >= 12 && s.results?.angular >= 12, "first run samples");
  await evaluate(cdp.send, `document.querySelector('#pause')?.click()`);
  await waitUntil(cdp.send, (s) => s.persistence?.active?.pendingSamples === 0 && s.persistence?.stats?.samplesFlushed > 0, "first asynchronous flush");
  await evaluate(cdp.send, `document.querySelector('#restart')?.click()`);
  const first = await waitUntil(cdp.send, (s) => s.persistence?.lastFinished?.durable === true && !s.persistence?.active, "first run terminal persistence");

  const firstExp = experimentTree(first.fs);
  const firstRuns = firstExp.tree?.runs ?? {};
  const firstNames = Object.keys(firstRuns).sort();
  for (const expected of ["angular_momentum_000001.csv", "polarization_000001.csv"]) {
    if (!firstNames.includes(expected)) throw new Error(`missing flat first-run metric file ${expected}: ${JSON.stringify(firstNames)}`);
    if (!/^scientific_time,value\n/.test(firstRuns[expected])) throw new Error(`bad CSV header in ${expected}`);
  }
  if (Object.values(firstRuns).some((value) => typeof value !== "string")) throw new Error(`run output must be flat files, not per-run directories: ${JSON.stringify(firstRuns)}`);
  const hiddenLog = firstExp.tree?.[".vlab"]?.["runs.ndjson"] ?? "";
  if (!hiddenLog.includes('"event":"started"') || !hiddenLog.includes('"event":"restarted"')) throw new Error(`hidden run bookkeeping missing start/terminal records: ${hiddenLog}`);

  await evaluate(cdp.send, `document.querySelector('#run')?.click()`);
  await waitUntil(cdp.send, (s) => s.results?.polarization >= 8 && s.results?.angular >= 8, "second run samples");
  await evaluate(cdp.send, `document.querySelector('#pause')?.click()`);
  await waitUntil(cdp.send, (s) => s.persistence?.active?.pendingSamples === 0, "second run flush");
  await evaluate(cdp.send, `document.querySelector('#restart')?.click()`);
  const second = await waitUntil(cdp.send, (s) => s.persistence?.lastFinished?.durable === true && s.persistence?.lastFinished?.runNumber === 2, "second run terminal persistence");
  const secondExp = experimentTree(second.fs);
  const secondNames = Object.keys(secondExp.tree?.runs ?? {}).sort();
  for (const expected of ["angular_momentum_000002.csv", "polarization_000002.csv"]) {
    if (!secondNames.includes(expected)) throw new Error(`second run did not increment without overwrite: ${JSON.stringify(secondNames)}`);
  }
  if (second.persistence.stats.flushMs < 0 || second.persistence.stats.flushCount < 2) throw new Error(`flush timing was not measured separately: ${JSON.stringify(second.persistence.stats)}`);
  if (second.persistence.stats.maxPendingSamples >= second.persistence.pendingLimit) throw new Error(`persistence unexpectedly hit backpressure limit: ${JSON.stringify(second.persistence)}`);
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log(JSON.stringify({ first: first.persistence, second: second.persistence, experimentDirectory: secondExp.name, files: secondNames }, null, 2));
  console.log("Single-run Results persistence verified: selected root, flat per-metric CSV files, incremental run numbers, hidden bookkeeping, async flush timing, and no per-run directories.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error)); if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions); if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog); process.exitCode = 1;
} finally { try { cdp?.socket?.close(); } catch {} child.kill("SIGTERM"); }
