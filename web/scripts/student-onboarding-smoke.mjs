import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-student-onboarding-${process.pid}`;
const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });

let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
]);

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
  const response = await withTimeout(fetch(`http://127.0.0.1:${port}${path}`), 3000, `DevTools ${path}`);
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
  const exceptions = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
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
    await withTimeout(ready, 3000, "DevTools websocket open");
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out after 5000ms`));
      }, 5000);
      pending.set(id, { resolve, reject, timer });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return promise;
  };

  return { socket, send, exceptions };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result?.result?.value;
}

async function state(send) {
  const raw = await evaluate(send, `JSON.stringify((() => {
    const panel = document.querySelector('.registry-panel');
    const auth = panel?.querySelector('.registry-auth');
    const heading = panel?.querySelector('.registry-heading .field-label');
    const create = panel?.querySelector('[data-vlab-create-account]');
    const help = document.querySelector('[data-vlab-nav="help"]');
    const helpPanel = document.querySelector('#vlab-student-help');
    const grok = helpPanel?.querySelector('[data-vlab-provider="grok"]');
    const claude = helpPanel?.querySelector('[data-vlab-provider="claude"]');
    const firstPrompt = helpPanel?.querySelector('[data-vlab-first-prompt]');
    const account = document.querySelector('[data-vlab-nav="account"]');
    return {
      worker: document.querySelector('#worker-status')?.dataset.state ?? null,
      registrationReady: panel?.getAttribute('data-vlab-student-registration') ?? null,
      authHidden: Boolean(auth?.hidden),
      heading: heading?.textContent?.trim() ?? null,
      createAccount: Boolean(create),
      help: Boolean(help),
      helpPanel: Boolean(helpPanel),
      helpHidden: Boolean(helpPanel?.hidden),
      helpTitle: helpPanel?.querySelector('#vlab-student-help-title')?.textContent?.trim() ?? null,
      grok: Boolean(grok),
      claude: Boolean(claude),
      firstPrompt: firstPrompt?.textContent?.trim() ?? null,
      accountText: account?.textContent?.trim() ?? null,
    };
  })())`);
  return JSON.parse(raw ?? "null");
}

async function waitReady(send) {
  let latest = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    latest = await state(send);
    if (latest?.worker === "ready" && latest.registrationReady === "ready" && latest.help && latest.helpPanel) return latest;
    await sleep(100);
  }
  throw new Error(`student onboarding did not become ready: ${JSON.stringify(latest)}`);
}

let cdp;
try {
  const port = await waitForPort();
  cdp = connect(await waitForTarget(port));
  await cdp.send("Runtime.enable");

  const initial = await waitReady(cdp.send);
  if (initial.authHidden || initial.heading !== "Sign in or create account" || !initial.createAccount || initial.accountText !== "Sign in") {
    throw new Error(`signed-out student registration surface is incorrect: ${JSON.stringify(initial)}`);
  }

  await evaluate(cdp.send, `document.querySelector('[data-vlab-nav="help"]').click()`);
  await sleep(50);
  const opened = await state(cdp.send);
  if (opened.helpHidden || opened.helpTitle !== "Use Virtual Lab" || !opened.grok || !opened.claude || !opened.firstPrompt) {
    throw new Error(`Getting started did not open correctly: ${JSON.stringify(opened)}`);
  }

  const providerState = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    document.querySelector('[data-vlab-provider="claude"]').click();
    return {
      claudePressed: document.querySelector('[data-vlab-provider="claude"]')?.getAttribute('aria-pressed'),
      claudeHidden: document.querySelector('[data-vlab-provider-panel="claude"]')?.hidden,
      grokHidden: document.querySelector('[data-vlab-provider-panel="grok"]')?.hidden,
    };
  })())`));
  if (providerState.claudePressed !== "true" || providerState.claudeHidden || !providerState.grokHidden) {
    throw new Error(`provider switching failed: ${JSON.stringify(providerState)}`);
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 700, deviceScaleFactor: 1, mobile: true });
  await sleep(80);
  const mobilePanel = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    const helpPanel = document.querySelector('#vlab-student-help');
    const close = helpPanel?.querySelector('.vlab-student-help-close');
    const style = helpPanel ? getComputedStyle(helpPanel) : null;
    if (helpPanel) helpPanel.scrollTop = helpPanel.scrollHeight;
    return {
      open: Boolean(helpPanel && !helpPanel.hidden),
      clientHeight: helpPanel?.clientHeight ?? 0,
      scrollHeight: helpPanel?.scrollHeight ?? 0,
      scrollTop: helpPanel?.scrollTop ?? 0,
      overflowY: style?.overflowY ?? null,
      closeHeight: Math.round(close?.getBoundingClientRect().height ?? 0),
      withinViewport: Boolean(helpPanel && helpPanel.getBoundingClientRect().top >= -1 && helpPanel.getBoundingClientRect().bottom <= window.innerHeight + 1),
    };
  })())`));
  if (!mobilePanel.open || mobilePanel.scrollHeight <= mobilePanel.clientHeight || mobilePanel.scrollTop <= 0 || !["auto", "scroll"].includes(mobilePanel.overflowY) || mobilePanel.closeHeight < 44 || !mobilePanel.withinViewport) {
    throw new Error(`mobile Getting started is not safely scrollable: ${JSON.stringify(mobilePanel)}`);
  }

  await evaluate(cdp.send, `document.querySelector('.vlab-student-help-close').click()`);

  // Regression for the production freeze: repeatedly mutate the exact hidden state
  // observed by registration/onboarding. A self-triggering MutationObserver loop makes
  // the following bounded CDP call time out instead of hanging the CI job forever.
  const observerStress = JSON.parse(await evaluate(cdp.send, `(async () => {
    const auth = document.querySelector('.registry-auth');
    const professor = document.querySelector('#professor-menu');
    if (!auth) throw new Error('registry auth missing');
    localStorage.removeItem('vlab-student-getting-started-v1');
    for (let i = 0; i < 20; i += 1) {
      auth.hidden = i % 2 === 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    auth.hidden = false;
    if (professor) professor.hidden = true;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return JSON.stringify({
      heading: document.querySelector('.registry-heading .field-label')?.textContent?.trim() ?? null,
      accountText: document.querySelector('[data-vlab-nav="account"]')?.textContent?.trim() ?? null,
      registrationReady: document.querySelector('.registry-panel')?.getAttribute('data-vlab-student-registration') ?? null,
    });
  })()`));
  if (observerStress.heading !== "Sign in or create account" || observerStress.accountText !== "Sign in" || observerStress.registrationReady !== "ready") {
    throw new Error(`registration observer stress regressed: ${JSON.stringify(observerStress)}`);
  }

  // Exercise the first-login Getting started path without creating a real account.
  const autoOpened = JSON.parse(await evaluate(cdp.send, `(async () => {
    const auth = document.querySelector('.registry-auth');
    const professor = document.querySelector('#professor-menu');
    localStorage.removeItem('vlab-student-getting-started-v1');
    document.querySelector('#vlab-student-help').hidden = true;
    auth.hidden = true;
    if (professor) professor.hidden = true;
    await new Promise((resolve) => setTimeout(resolve, 900));
    const helpPanel = document.querySelector('#vlab-student-help');
    const result = {
      opened: Boolean(helpPanel && !helpPanel.hidden),
      title: helpPanel?.querySelector('#vlab-student-help-title')?.textContent?.trim() ?? null,
    };
    auth.hidden = false;
    helpPanel.hidden = true;
    return JSON.stringify(result);
  })()`));
  if (!autoOpened.opened || autoOpened.title !== "Use Virtual Lab") {
    throw new Error(`first-login Getting started did not auto-open: ${JSON.stringify(autoOpened)}`);
  }

  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log(JSON.stringify({ initial, opened, providerState, mobilePanel, observerStress, autoOpened }, null, 2));
  console.log("Student registration and Getting started verified in production, including mobile scrollability and bounded observer-freeze regression coverage.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
