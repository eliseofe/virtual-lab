import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result?.result?.value;
}

async function waitReady(send) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    let state;
    try {
      state = await evaluate(send, "document.querySelector('#worker-status')?.dataset.state ?? null");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Inspected target navigated or closed")) throw error;
      await sleep(100);
      continue;
    }
    if (state === "ready") return;
    if (state === "error") throw new Error("Browser reported simulator startup error");
    await sleep(100);
  }
  throw new Error("Browser did not reach simulator ready state");
}

async function waitForShowcaseLauncher(send) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await evaluate(send, "Boolean(document.querySelector('.showcase-launcher'))");
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Showcase launcher did not initialize");
}

async function inspectShowcase(send, label) {
  await waitForShowcaseLauncher(send);
  await evaluate(send, "document.querySelector('.showcase-launcher').click()");

  let launchState = null;
  for (let attempt = 0; attempt < 250; attempt += 1) {
    launchState = JSON.parse(await evaluate(send, `JSON.stringify((() => {
      const dialog = document.querySelector('.showcase-dialog');
      const message = document.querySelector('.showcase-message');
      return {
        open: Boolean(dialog?.open),
        entries: document.querySelectorAll('.showcase-entry').length,
        message: message?.textContent?.trim() ?? '',
        messageState: message?.dataset?.state ?? null,
      };
    })())`));
    if (launchState.messageState === "error") {
      throw new Error(`${label} Showcase reported an error: ${JSON.stringify(launchState)}`);
    }
    if (launchState.open && launchState.entries > 0) break;
    await sleep(100);
  }
  if (!launchState?.open || launchState.entries < 1) {
    throw new Error(`${label} Showcase did not become usable after launch: ${JSON.stringify(launchState)}`);
  }

  const value = await evaluate(send, `JSON.stringify((() => {
    const dialog = document.querySelector('.showcase-dialog');
    const rect = dialog?.getBoundingClientRect();
    const entries = [...document.querySelectorAll('.showcase-entry')].map((entry) => entry.textContent?.replace(/\\s+/g, ' ').trim() ?? '');
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      open: Boolean(dialog?.open),
      withinViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      entries,
      activeElastic: entries.some((text) => text.includes('Active Elastic') && text.includes('Curated') && text.includes('Open & run')),
      homogeneous: entries.length >= 1 && entries.every((text) => text.includes('Curated') && text.includes('Open & run')),
      falseEmpty: document.body.textContent?.includes('No Showcase experiments yet.') ?? false,
      syntheticBuiltin: entries.some((text) => text.includes('Built-in') || text.includes('Public example')),
      closeHeight: Math.round(document.querySelector('.showcase-head-actions button:last-child')?.getBoundingClientRect().height ?? 0),
      message: document.querySelector('.showcase-message')?.textContent?.trim() ?? '',
    };
  })())`);
  const state = JSON.parse(value);
  if (!state.open || !state.withinViewport || !state.activeElastic || !state.homogeneous || state.syntheticBuiltin || state.falseEmpty || state.scrollWidth > state.width + 1) {
    throw new Error(`${label} Showcase UX failed: ${JSON.stringify(state)}`);
  }
  await evaluate(send, "document.querySelector('.showcase-dialog')?.close()");
  return state;
}

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await waitReady(cdp.send);
  const desktop = await inspectShowcase(cdp.send, "desktop");

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
  const mobile = await inspectShowcase(cdp.send, "mobile");
  if (mobile.closeHeight < 44) throw new Error(`mobile Showcase close target is ${mobile.closeHeight}px, expected at least 44px`);

  console.log(JSON.stringify({ desktop, mobile }, null, 2));
  console.log("Showcase smoke verified homogeneous curated entries, Active Elastic presence, and responsive layout on desktop and 390x844 mobile.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
