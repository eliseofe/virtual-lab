import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chrome can take well over 10 s to publish its DevTools port on a busy CI
// runner (for example right after the WASM/Vite build), so allow 30 s.
async function waitForDevToolsPort(child, profile, attempts = 300) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited before DevTools started (code ${child.exitCode})`);
    }
    try {
      const text = await readFile(`${profile}/DevToolsActivePort`, "utf8");
      const port = Number(text.split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError ?? new Error("Chrome did not publish DevToolsActivePort");
}

async function httpJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

function stopChrome(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2_000).unref();
}

export async function launchSmokeBrowserHost({ launchAttempts = 3 } = {}) {
  const chrome = process.env.CHROME_BIN ?? "google-chrome";
  let lastError;

  for (let launchAttempt = 1; launchAttempt <= launchAttempts; launchAttempt += 1) {
    const profile = `/tmp/vlab-smoke-host-${process.pid}-${launchAttempt}`;
    const child = spawn(chrome, [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--window-size=1280,900",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });

    let chromeLog = "";
    child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });

    try {
      const port = await waitForDevToolsPort(child, profile);
      return {
        port,
        getChromeLog: () => chromeLog,
        async close() {
          stopChrome(child);
          await rm(profile, { recursive: true, force: true }).catch(() => {});
        },
      };
    } catch (error) {
      stopChrome(child);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
      if (chromeLog.trim()) error.message += `\nChrome stderr:\n${chromeLog}`;
      lastError = error;
      if (launchAttempt < launchAttempts) await sleep(250);
    }
  }

  throw lastError ?? new Error("Chrome smoke host failed to start");
}

async function connectBrowser(port) {
  const version = await httpJson(port, "/json/version");
  if (!version.webSocketDebuggerUrl) throw new Error("Chrome browser DevTools websocket is unavailable");

  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const exceptionSinks = new Map();
  const eventListeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method && message.sessionId) {
      for (const listener of eventListeners.get(message.sessionId) ?? []) listener(message.method, message.params ?? {});
    }
    if (message.method === "Runtime.exceptionThrown" && message.sessionId) {
      const sink = exceptionSinks.get(message.sessionId);
      if (sink) {
        const details = message.params?.exceptionDetails;
        sink.push(details?.exception?.description ?? details?.text ?? "JavaScript exception");
      }
    }
  });

  const send = (method, params = {}, sessionId = null) => {
    const id = nextId++;
    const envelope = { id, method, params };
    if (sessionId) envelope.sessionId = sessionId;
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify(envelope));
    return promise;
  };

  return { socket, send, exceptionSinks, eventListeners };
}

export async function createSmokeSession({ url, initialUrl = url }) {
  const sharedPort = Number(process.env.VLAB_SMOKE_CHROME_PORT ?? 0);
  const localHost = Number.isInteger(sharedPort) && sharedPort > 0 ? null : await launchSmokeBrowserHost();
  const port = localHost?.port ?? sharedPort;
  const browser = await connectBrowser(port);

  let browserContextId;
  let targetId;
  let sessionId;
  const exceptions = [];

  try {
    ({ browserContextId } = await browser.send("Target.createBrowserContext"));
    ({ targetId } = await browser.send("Target.createTarget", {
      url: initialUrl,
      browserContextId,
      width: 1280,
      height: 900,
    }));
    ({ sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true }));
    browser.exceptionSinks.set(sessionId, exceptions);
  } catch (error) {
    try { browser.socket.close(); } catch {}
    await localHost?.close();
    throw error;
  }

  let closed = false;
  const cdp = {
    exceptions,
    send(method, params = {}) {
      return browser.send(method, params, sessionId);
    },
    // Subscribe to this session's DevTools events: listener(method, params).
    onEvent(listener) {
      const listeners = browser.eventListeners.get(sessionId) ?? [];
      listeners.push(listener);
      browser.eventListeners.set(sessionId, listeners);
    },
  };

  return {
    cdp,
    getChromeLog: () => localHost?.getChromeLog?.() ?? "",
    async close() {
      if (closed) return;
      closed = true;
      browser.exceptionSinks.delete(sessionId);
      browser.eventListeners.delete(sessionId);
      try { await browser.send("Target.closeTarget", { targetId }); } catch {}
      try { await browser.send("Target.disposeBrowserContext", { browserContextId }); } catch {}
      try { browser.socket.close(); } catch {}
      await localHost?.close();
    },
  };
}
