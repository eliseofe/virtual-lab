import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-responsive-chrome-${process.pid}`;

const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--window-size=1280,900", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });

let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result?.result?.value;
}

async function waitReady(send) {
  let latest = null;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    latest = await evaluate(send, `JSON.stringify({
      state: document.querySelector('#worker-status')?.dataset.state ?? null,
      text: document.querySelector('#worker-status')?.textContent ?? null,
      hardened: document.documentElement.dataset.vlabUxHardened ?? null
    })`);
    const parsed = latest ? JSON.parse(latest) : null;
    if (parsed?.state === "ready" && parsed?.hardened === "true") return parsed;
    if (parsed?.state === "error") throw new Error(`browser reported startup error: ${latest}`);
    await sleep(100);
  }
  throw new Error(`browser did not reach hardened ready state: ${latest}`);
}

async function structure(send) {
  const value = await evaluate(send, `JSON.stringify((() => {
    const experiment = document.querySelector('.experiment-panel');
    const stage = document.querySelector('.stage-panel');
    const authoring = document.querySelector('#authoring-workbench');
    const technical = document.querySelector('.technical-panel');
    const workspace = document.querySelector('.workspace');
    const before = (left, right) => Boolean(left && right && (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING));
    const visiblePanes = [...document.querySelectorAll('[data-authoring-artifact-pane]')]
      .filter((pane) => !pane.hidden && getComputedStyle(pane).display !== 'none').length;
    const height = (selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().height ?? 0);
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      experimentBeforeStage: before(experiment, stage),
      stageBeforeAuthoring: before(stage, authoring),
      authoringBeforeTechnical: before(authoring, technical),
      adminInsideWorkspace: Boolean(workspace?.querySelector('.registry-panel, .professor-panel, .utility-dialog, #collection-organizer')),
      visiblePanes,
      technicalOpen: Boolean(technical?.open),
      filtersHidden: Boolean(document.querySelector('.experiment-browser-filters')?.hidden),
      canvasRight: Math.ceil(document.querySelector('#simulation-canvas')?.getBoundingClientRect().right ?? 0),
      controlHeights: {
        run: height('#run'),
        pause: height('#pause'),
        restart: height('#restart'),
        newSeed: height('#restart-new-seed'),
        fit: height('#fit-arena'),
        apply: height('#apply-workspace'),
        browse: height('.experiment-browse')
      },
      tabHeights: [...document.querySelectorAll('.authoring-tab')].map((tab) => Math.round(tab.getBoundingClientRect().height)),
      topbarRole: document.querySelector('.topbar-status')?.getAttribute('role') ?? null,
      canvasDescribedBy: document.querySelector('#simulation-canvas')?.getAttribute('aria-describedby') ?? null
    };
  })())`);
  return JSON.parse(value);
}

function assertCoreLayout(state, label, { touch = false } = {}) {
  if (state.scrollWidth > state.width + 1) throw new Error(`${label}: horizontal page overflow: ${JSON.stringify(state)}`);
  if (!state.experimentBeforeStage || !state.stageBeforeAuthoring || !state.authoringBeforeTechnical) {
    throw new Error(`${label}: simulation-first document order regressed: ${JSON.stringify(state)}`);
  }
  if (state.adminInsideWorkspace) throw new Error(`${label}: administrative surface re-entered the scientific workspace`);
  if (state.visiblePanes !== 1) throw new Error(`${label}: expected exactly one visible authoring pane, got ${state.visiblePanes}`);
  if (state.technicalOpen) throw new Error(`${label}: Technical details should be collapsed by default`);
  if (!state.filtersHidden) throw new Error(`${label}: collection filters re-entered primary experiment navigation`);
  if (state.canvasRight > state.width + 1) throw new Error(`${label}: arena exceeds viewport width: ${JSON.stringify(state)}`);
  if (state.topbarRole !== "status" || state.canvasDescribedBy !== "arena-instructions") {
    throw new Error(`${label}: semantic status/arena description wiring missing: ${JSON.stringify(state)}`);
  }
  if (touch) {
    for (const [name, height] of Object.entries(state.controlHeights)) {
      if (height < 44) throw new Error(`${label}: ${name} touch target is ${height}px, expected at least 44px`);
    }
    if (state.tabHeights.some((height) => height < 44)) {
      throw new Error(`${label}: authoring tab touch target below 44px: ${JSON.stringify(state.tabHeights)}`);
    }
  }
}

async function verifyFinder(send) {
  await evaluate(send, "document.querySelector('.experiment-browse').click()");
  await sleep(100);
  const opened = JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const dialog = document.querySelector('.experiment-browser');
    const rect = dialog?.getBoundingClientRect();
    const active = document.activeElement;
    return {
      open: Boolean(dialog?.open),
      activeSearch: Boolean(active?.classList?.contains('experiment-browser-search')),
      withinViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      filtersHidden: Boolean(dialog?.querySelector('.experiment-browser-filters')?.hidden),
      closeHeight: Math.round([...dialog.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Close')?.getBoundingClientRect().height ?? 0)
    };
  })())`));
  if (!opened.open || !opened.activeSearch || !opened.withinViewport || !opened.filtersHidden || opened.closeHeight < 44) {
    throw new Error(`mobile experiment finder failed: ${JSON.stringify(opened)}`);
  }
  await evaluate(send, "document.querySelector('.experiment-browser').close()");
  await sleep(80);
  const returned = await evaluate(send, "document.activeElement === document.querySelector('.experiment-browse')");
  if (!returned) throw new Error("experiment finder did not return focus to its launcher");
}

async function verifyUtilityDialog(send) {
  await evaluate(send, "document.querySelector('#account-menu').click()");
  await sleep(100);
  const opened = JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const dialog = document.querySelector('#workspace-utilities');
    return {
      open: Boolean(dialog?.open),
      focusInside: Boolean(dialog?.contains(document.activeElement)),
      expanded: document.querySelector('#account-menu')?.getAttribute('aria-expanded') ?? null,
      closeHeight: Math.round(document.querySelector('#utility-close')?.getBoundingClientRect().height ?? 0)
    };
  })())`));
  if (!opened.open || !opened.focusInside || opened.expanded !== "true" || opened.closeHeight < 44) {
    throw new Error(`mobile utility dialog failed: ${JSON.stringify(opened)}`);
  }
  await evaluate(send, "document.querySelector('#workspace-utilities').close()");
  await sleep(80);
  const returned = await evaluate(send, "document.activeElement === document.querySelector('#account-menu') && document.querySelector('#account-menu').getAttribute('aria-expanded') === 'false'");
  if (!returned) throw new Error("utility dialog did not return focus/state to Account launcher");
}

async function verifyAuthoringKeyboard(send) {
  const result = JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const first = document.querySelector('.authoring-tab[data-artifact-id="configuration"]');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const selected = document.querySelector('.authoring-tab[aria-selected="true"]');
    const visiblePanes = [...document.querySelectorAll('[data-authoring-artifact-pane]')]
      .filter((pane) => !pane.hidden && getComputedStyle(pane).display !== 'none').length;
    return {
      selected: selected?.dataset.artifactId ?? null,
      focused: document.activeElement?.dataset?.artifactId ?? null,
      visiblePanes,
      labelledBy: document.querySelector('#authoring-pane-initialization')?.getAttribute('aria-labelledby') ?? null,
      selectedId: selected?.id ?? null
    };
  })())`));
  if (result.selected !== "initialization" || result.focused !== "initialization" || result.visiblePanes !== 1 || result.labelledBy !== result.selectedId) {
    throw new Error(`authoring keyboard/tab semantics failed: ${JSON.stringify(result)}`);
  }
}

let cdp;
try {
  const port = await waitForPort();
  const wsUrl = await waitForTarget(port);
  cdp = connect(wsUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Emulation.enable");

  await waitReady(cdp.send);
  const desktop = await structure(cdp.send);
  assertCoreLayout(desktop, "desktop");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitReady(cdp.send);

  const mobile = await structure(cdp.send);
  assertCoreLayout(mobile, "mobile", { touch: true });
  await verifyFinder(cdp.send);
  await verifyUtilityDialog(cdp.send);
  await verifyAuthoringKeyboard(cdp.send);

  console.log(JSON.stringify({ desktop, mobile }, null, 2));
  console.log("Responsive smoke verified simulation-first hierarchy, no mobile overflow, 44px primary targets, authoring keyboard semantics, and dialog focus entry/return.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog);
  process.exitCode = 1;
} finally {
  try { cdp?.socket?.close(); } catch {}
  child.kill("SIGTERM");
}
