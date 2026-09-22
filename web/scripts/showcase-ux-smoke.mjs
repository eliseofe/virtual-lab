import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed";
    throw new Error(detail);
  }
  return result?.result?.value;
}

async function waitReady(send) {
  let latest = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      latest = JSON.parse(await evaluate(send, `JSON.stringify({
        worker: document.querySelector('#worker-status')?.dataset.state ?? null,
        browse: document.querySelector('.experiment-browse')?.textContent?.trim() ?? null,
        library: Boolean(document.querySelector('.vlab-library')),
        bridge: Boolean(window.vlabExperimentLibraryBridge)
      })`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Inspected target navigated or closed")) throw error;
      await sleep(100);
      continue;
    }
    if (latest.worker === "ready" && latest.browse === "Browse experiments" && latest.library && latest.bridge) return;
    if (latest.worker === "error") throw new Error(`Browser reported simulator startup error: ${JSON.stringify(latest)}`);
    await sleep(100);
  }
  throw new Error(`Experiment Library did not initialize: ${JSON.stringify(latest)}`);
}

async function clickBrowseWhenReady(send, label) {
  let latest = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      latest = JSON.parse(await evaluate(send, `JSON.stringify((() => {
        const browse = document.querySelector('.experiment-browse');
        const library = document.querySelector('.vlab-library');
        const worker = document.querySelector('#worker-status')?.dataset.state ?? null;
        const bridge = Boolean(window.vlabExperimentLibraryBridge);
        if (browse && library && bridge && worker === "ready") {
          browse.click();
          return { clicked: true, worker, browse: browse.textContent?.trim() ?? null, library: true, bridge };
        }
        return {
          clicked: false,
          worker,
          browse: browse?.textContent?.trim() ?? null,
          library: Boolean(library),
          bridge,
        };
      })())`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Inspected target navigated or closed")) throw error;
      await sleep(100);
      continue;
    }
    if (latest.clicked) return;
    if (latest.worker === "error") {
      throw new Error(`${label}: simulator entered error before Experiment Library could open: ${JSON.stringify(latest)}`);
    }
    await sleep(100);
  }
  throw new Error(`${label}: Browse experiments never became stably clickable: ${JSON.stringify(latest)}`);
}

async function ensureDetailsOpen(send, label) {
  let latest = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    latest = JSON.parse(await evaluate(send, `JSON.stringify((() => {
      const dialog = document.querySelector('.vlab-library');
      const actions = [...dialog?.querySelectorAll('.vlab-library-row-actions button') ?? []];
      if (actions.some((button) => button.textContent?.trim() === 'Open & run')) {
        return { open: true, details: true };
      }
      const details = actions.find((button) => button.textContent?.trim() === 'Details');
      if (details) {
        details.click();
        return { open: true, details: false, clicked: true };
      }
      return { open: Boolean(dialog?.open), details: false, clicked: false };
    })())`));
    if (latest.details) return;
    await sleep(50);
  }
  throw new Error(`${label}: Experiment Details did not expose Open & run: ${JSON.stringify(latest)}`);
}

async function inspectLibrary(send, label, expectedTwoPane) {
  await clickBrowseWhenReady(send, label);

  let state = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    state = JSON.parse(await evaluate(send, `JSON.stringify((() => {
      const dialog = document.querySelector('.vlab-library');
      const rows = [...dialog?.querySelectorAll('.vlab-library-row') ?? []];
      return {
        open: Boolean(dialog?.open),
        rows: rows.length,
        status: dialog?.querySelector('.vlab-library-status')?.textContent?.trim() ?? '',
        activeElastic: rows.some((row) => row.textContent?.includes('Active Elastic')),
      };
    })())`));
    if (state.open && state.rows > 0) break;
    await sleep(100);
  }
  if (!state?.open || state.rows < 1) throw new Error(`${label}: Experiment Library did not load Showcase rows: ${JSON.stringify(state)}`);

  await ensureDetailsOpen(send, label);

  const inspected = JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const dialog = document.querySelector('.vlab-library');
    const rect = dialog?.getBoundingClientRect();
    const directory = dialog?.querySelector('.vlab-library-directory')?.getBoundingClientRect();
    const results = dialog?.querySelector('.vlab-library-results-wrap')?.getBoundingClientRect();
    const visible = (element) => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getClientRects().length);
    const sourceOptions = [...dialog?.querySelectorAll('.vlab-library-source-select option') ?? []].map((option) => option.textContent?.trim());
    const sourceTabs = [...dialog?.querySelectorAll('.vlab-library-source-tabs button') ?? []].filter(visible).map((button) => button.textContent?.trim());
    const directoryLabels = [...dialog?.querySelectorAll('.vlab-library-directory button') ?? []].map((button) => button.textContent?.replace(/\\s+/g, ' ').trim());
    const rowTexts = [...dialog?.querySelectorAll('.vlab-library-row') ?? []].map((row) => row.textContent?.replace(/\\s+/g, ' ').trim());
    const allScope = [...dialog?.querySelectorAll('.vlab-library-search select option') ?? []].map((option) => option.textContent?.trim());
    const actions = [...dialog?.querySelectorAll('.vlab-library-row-actions button') ?? []].map((button) => button.textContent?.trim());
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      dialogWidth: Math.round(rect?.width ?? 0),
      withinViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      sourceOptions,
      sourceTabs,
      sourceValue: dialog?.querySelector('.vlab-library-source-select select')?.value ?? null,
      directoryLabels,
      rowTexts,
      activeElastic: rowTexts.some((text) => text.includes('Active Elastic')),
      builtIn: dialog?.textContent?.includes('Built-in') ?? false,
      globalAll: directoryLabels.some((label) => /^All experiments\\b/.test(label)),
      searchScopes: allScope,
      searchPlaceholder: dialog?.querySelector('.vlab-library-search input')?.placeholder ?? '',
      searchFocused: Boolean(document.activeElement?.closest?.('.vlab-library-search')),
      openRunInDetails: actions.includes('Open & run'),
      ordinaryRunInPrimary: [...dialog?.querySelectorAll('.vlab-library-row > .vlab-library-row-actions button') ?? []].some((button) => /run/i.test(button.textContent ?? '')),
      manageShowcaseVisible: visible(document.querySelector('.showcase-launcher')),
      twoPane: Boolean(directory && results && results.left >= directory.right - 2),
      closeHeight: Math.round([...dialog?.querySelectorAll('.vlab-library-head button') ?? []].find((button) => button.textContent?.trim() === 'Close')?.getBoundingClientRect().height ?? 0),
    };
  })())`));

  if (
    !inspected.withinViewport
    || inspected.scrollWidth > inspected.width + 1
    || inspected.sourceValue !== "showcase"
    || JSON.stringify(inspected.sourceOptions) !== JSON.stringify(["Showcase"])
    || !inspected.directoryLabels.some((value) => value.startsWith("All Showcase"))
    || !inspected.directoryLabels.some((value) => value.startsWith("Uncategorized"))
    || !inspected.activeElastic
    || inspected.builtIn
    || inspected.globalAll
    || !inspected.searchScopes.includes("Here")
    || !inspected.searchScopes.includes("All sources")
    || inspected.ordinaryRunInPrimary
    || !inspected.openRunInDetails
    || inspected.manageShowcaseVisible
    || inspected.twoPane !== expectedTwoPane
  ) {
    throw new Error(`${label}: browse-first Showcase library contract failed: ${JSON.stringify(inspected)}`);
  }
  if (inspected.width >= 2000 && inspected.dialogWidth > 1154) {
    throw new Error(`${label}: library stretched beyond readable max width: ${JSON.stringify(inspected)}`);
  }
  if (inspected.width <= 520 && inspected.closeHeight < 44) {
    throw new Error(`${label}: close target is ${inspected.closeHeight}px, expected at least 44px`);
  }

  await evaluate(send, "document.querySelector('.vlab-library')?.close()");
  return inspected;
}

const viewports = [
  { label: "phone", width: 390, height: 844, mobile: true, twoPane: false },
  { label: "foldable", width: 768, height: 1024, mobile: true, twoPane: false },
  { label: "desktop", width: 1366, height: 900, mobile: false, twoPane: true },
  { label: "ultra-wide", width: 2560, height: 1440, mobile: false, twoPane: true },
];

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  await waitReady(cdp.send);

  const states = {};
  for (const viewport of viewports) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await sleep(120);
    states[viewport.label] = await inspectLibrary(cdp.send, viewport.label, viewport.twoPane);
  }

  console.log(JSON.stringify(states, null, 2));
  console.log("Experiment Library smoke verified browse-first Showcase discovery at phone, foldable, desktop and ultra-wide widths.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
