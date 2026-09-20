import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result?.result?.value;
}

async function waitReady(send) {
  let latest = null;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      latest = await evaluate(send, `JSON.stringify({
        state: document.querySelector('#worker-status')?.dataset.state ?? null,
        text: document.querySelector('#worker-status')?.textContent ?? null,
        hardened: document.documentElement?.dataset.vlabUxHardened ?? null,
        experimentManagementReady: Boolean(document.querySelector('.experiment-management')),
        experimentFinderReady: Boolean(document.querySelector('.experiment-browser-filters')),
        experimentEntryReady: Boolean(document.querySelector('.experiment-browse'))
      })`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Inspected target navigated or closed")) throw error;
      await sleep(100);
      continue;
    }
    const parsed = latest ? JSON.parse(latest) : null;
    if (
      parsed?.state === "ready" && parsed?.hardened === "true"
      && parsed?.experimentManagementReady
      && parsed?.experimentFinderReady
      && parsed?.experimentEntryReady
    ) return parsed;
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
    const management = document.querySelector('.experiment-management');
    const experimentSelect = document.querySelector('#experiment-select');
    const legacyPersistence = document.querySelector('#authoring-persistence');
    const redundantLocation = document.querySelector('.experiment-location');
    const signInSave = document.querySelector('.experiment-sign-in-save');
    const browse = document.querySelector('.experiment-browse');
    const before = (left, right) => Boolean(left && right && (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING));
    const visible = (element) => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getClientRects().length);
    const visiblePanes = [...document.querySelectorAll('[data-authoring-artifact-pane]')]
      .filter((pane) => !pane.hidden && getComputedStyle(pane).display !== 'none').length;
    const height = (selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().height ?? 0);
    const heightOfFirstVisible = (selectors) => Math.round([...document.querySelectorAll(selectors)].find(visible)?.getBoundingClientRect().height ?? 0);
    const visibleAuthoringTabs = [...document.querySelectorAll('[data-vlab-authoring-tab]')].filter(visible);
    const authoringTabs = visibleAuthoringTabs.length
      ? visibleAuthoringTabs
      : [...document.querySelectorAll('.authoring-tab')].filter(visible);
    const authoringApply = [...document.querySelectorAll('[data-vlab-authoring-apply], #apply-workspace')].find(visible);
    const locationText = redundantLocation?.textContent?.trim() ?? '';
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      experimentBeforeStage: before(experiment, stage),
      stageBeforeAuthoring: before(stage, authoring),
      authoringBeforeTechnical: before(authoring, technical),
      adminInsideWorkspace: Boolean(workspace?.querySelector('.registry-panel, .professor-panel, .utility-dialog, #collection-organizer')),
      visiblePanes,
      technicalOpen: Boolean(technical?.open),
      filtersPresent: Boolean(document.querySelector('.experiment-browser-filters')),
      filtersHidden: Boolean(document.querySelector('.experiment-browser-filters')?.hidden),
      canvasRight: Math.ceil(document.querySelector('#simulation-canvas')?.getBoundingClientRect().right ?? 0),
      experimentManagement: {
        visible: visible(management),
        selectVisible: visible(experimentSelect),
        legacyPersistenceVisible: visible(legacyPersistence),
        redundantLocationVisible: (locationText === 'Built-in' || locationText === 'No collection') && visible(redundantLocation),
        signInSaveVisible: visible(signInSave),
        signInSaveHeight: Math.round(signInSave?.getBoundingClientRect().height ?? 0),
        browseLabel: browse?.textContent?.trim() ?? null,
      },
      controlHeights: {
        run: heightOfFirstVisible('[data-vlab-simulation-action="run"], #run'),
        pause: heightOfFirstVisible('[data-vlab-simulation-action="pause"], #pause'),
        restart: heightOfFirstVisible('[data-vlab-simulation-action="restart"], #restart'),
        newSeed: heightOfFirstVisible('[data-vlab-simulation-action="new-seed"], #restart-new-seed'),
        fit: heightOfFirstVisible('[data-vlab-simulation-fit], #fit-arena'),
        apply: Math.round(authoringApply?.getBoundingClientRect().height ?? 0),
        browse: height('.experiment-browse')
      },
      tabHeights: authoringTabs.map((tab) => Math.round(tab.getBoundingClientRect().height)),
      ribbon: {
        brandTitle: document.querySelector('.vlab-react-brand-title')?.textContent?.trim() ?? '',
        brandByline: document.querySelector('.vlab-react-brand-byline')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        globalLabels: [...document.querySelectorAll('[data-vlab-nav="simulation"], [data-vlab-nav="authoring"], [data-vlab-nav="help"], [data-vlab-nav="account"]')]
          .filter(visible)
          .map((element) => element.textContent?.trim() ?? ''),
        forbiddenVisible: [...document.querySelectorAll('[data-vlab-nav="experiment"], [data-vlab-nav="results"], [data-vlab-nav="showcase"], [data-vlab-nav="professor"]')]
          .some(visible),
        workerStatusVisible: visible(document.querySelector('[data-vlab-worker-status]')),
      },
      managementTasks: {
        heading: document.querySelector('.experiment-control-title')?.textContent?.trim() ?? '',
        current: visible(document.querySelector('.experiment-task-current')),
        revisions: visible(document.querySelector('.experiment-task-revisions')),
        saveShare: visible(document.querySelector('.experiment-management')),
      },
      simulatorReadinessVisible: visible(document.querySelector('[data-vlab-simulator-readiness]')),
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
  if (!state.filtersPresent) throw new Error(`${label}: Experiment finder filters were not initialized`);
  if (!state.filtersHidden) throw new Error(`${label}: collection filters re-entered primary experiment navigation`);
  if (state.canvasRight > state.width + 1) throw new Error(`${label}: arena exceeds viewport width: ${JSON.stringify(state)}`);
  if (state.topbarRole !== "status" || state.canvasDescribedBy !== "arena-instructions") {
    throw new Error(`${label}: semantic status/arena description wiring missing: ${JSON.stringify(state)}`);
  }
  if (!state.simulatorReadinessVisible || state.ribbon.workerStatusVisible) {
    throw new Error(`${label}: simulator readiness is not contextualized inside Simulation: ${JSON.stringify(state.ribbon)}`);
  }
  if (state.managementTasks.heading !== "Control panel" || !state.managementTasks.current || !state.managementTasks.saveShare) {
    throw new Error(`${label}: task-based Experiment management is incomplete: ${JSON.stringify(state.managementTasks)}`);
  }
  if (!touch) {
    if (state.ribbon.brandTitle !== "Virtual Lab" || state.ribbon.brandByline !== "Eliseo Ferrante · Swarm robotics") {
      throw new Error(`${label}: product identity regressed: ${JSON.stringify(state.ribbon)}`);
    }
    if (JSON.stringify(state.ribbon.globalLabels) !== JSON.stringify(["Simulation", "Authoring", "Help", "Account"])) {
      throw new Error(`${label}: global ribbon hierarchy regressed: ${JSON.stringify(state.ribbon)}`);
    }
    if (state.ribbon.forbiddenVisible) {
      throw new Error(`${label}: Experiment/Results/Showcase/Professor re-entered global navigation`);
    }
  }
  if (!state.experimentManagement.visible || state.experimentManagement.selectVisible || state.experimentManagement.legacyPersistenceVisible) {
    throw new Error(`${label}: Experiment identity/persistence is not unified: ${JSON.stringify(state.experimentManagement)}`);
  }
  if (state.experimentManagement.redundantLocationVisible || state.experimentManagement.browseLabel !== "Experiments") {
    throw new Error(`${label}: Experiment library entry or identity hierarchy regressed: ${JSON.stringify(state.experimentManagement)}`);
  }
  if (!state.experimentManagement.signInSaveVisible) {
    throw new Error(`${label}: signed-out Experiment surface lacks direct sign-in-to-save action: ${JSON.stringify(state.experimentManagement)}`);
  }
  if (touch) {
    for (const [name, controlHeight] of Object.entries(state.controlHeights)) {
      if (controlHeight < 44) throw new Error(`${label}: ${name} touch target is ${controlHeight}px, expected at least 44px`);
    }
    if (state.experimentManagement.signInSaveHeight < 44) {
      throw new Error(`${label}: sign-in-to-save touch target is ${state.experimentManagement.signInSaveHeight}px, expected at least 44px`);
    }
    if (state.tabHeights.some((tabHeight) => tabHeight < 44)) {
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
  await evaluate(send, "document.querySelector('[data-vlab-nav-toggle=\"true\"]').click()");
  await sleep(100);
  const drawerLabels = JSON.parse(await evaluate(send, `JSON.stringify(
    [...document.querySelectorAll('[data-vlab-nav="simulation"], [data-vlab-nav="authoring"], [data-vlab-nav="help-mobile"], [data-vlab-nav="account-mobile"]')]
      .filter((element) => !element.hidden && getComputedStyle(element).display !== 'none' && element.getClientRects().length)
      .map((element) => element.textContent?.trim() ?? '')
  )`));
  if (JSON.stringify(drawerLabels) !== JSON.stringify(["Simulation", "Authoring", "Help", "Account"])) {
    throw new Error(`mobile global navigation hierarchy regressed: ${JSON.stringify(drawerLabels)}`);
  }
  await evaluate(send, "document.querySelector('[data-vlab-nav=\"account-mobile\"]').click()");
  await sleep(100);
  const opened = JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const dialog = document.querySelector('#workspace-utilities');
    const account = document.querySelector('[data-vlab-nav="account"]');
    return {
      open: Boolean(dialog?.open),
      focusInside: Boolean(dialog?.contains(document.activeElement)),
      expanded: account?.getAttribute('aria-expanded') ?? null,
      closeHeight: Math.round(document.querySelector('#utility-close')?.getBoundingClientRect().height ?? 0)
    };
  })())`));
  if (!opened.open || !opened.focusInside || opened.expanded !== "true" || opened.closeHeight < 44) {
    throw new Error(`mobile React Account dialog failed: ${JSON.stringify(opened)}`);
  }
  await evaluate(send, "document.querySelector('#workspace-utilities').close()");
  await sleep(100);
  const returned = JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const toggle = document.querySelector('[data-vlab-nav-toggle="true"]');
    const account = document.querySelector('[data-vlab-nav="account"]');
    return {
      focusReturned: document.activeElement === toggle,
      expanded: account?.getAttribute('aria-expanded') ?? null,
    };
  })())`));
  if (!returned.focusReturned || returned.expanded !== "false") {
    throw new Error(`utility dialog did not return focus/state to React mobile navigation: ${JSON.stringify(returned)}`);
  }
}

async function verifyAuthoringKeyboard(send) {
  await evaluate(send, `(() => {
    const first = document.querySelector('[data-vlab-authoring-tab="configuration"]')
      ?? document.querySelector('.authoring-tab[data-artifact-id="configuration"]');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    return true;
  })()`);
  await sleep(100);
  const result = JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const selected = document.querySelector('[data-vlab-authoring-tab][aria-selected="true"]')
      ?? document.querySelector('.authoring-tab[aria-selected="true"]');
    const visiblePanes = [...document.querySelectorAll('[data-authoring-artifact-pane]')]
      .filter((pane) => !pane.hidden && getComputedStyle(pane).display !== 'none').length;
    return {
      selected: selected?.getAttribute('data-vlab-authoring-tab') ?? selected?.dataset?.artifactId ?? null,
      focused: document.activeElement?.getAttribute?.('data-vlab-authoring-tab') ?? document.activeElement?.dataset?.artifactId ?? null,
      visiblePanes
    };
  })())`));
  if (result.selected !== "initialization" || result.focused !== "initialization" || result.visiblePanes !== 1) {
    throw new Error(`authoring keyboard/tab semantics failed: ${JSON.stringify(result)}`);
  }
}

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

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
  console.log("Responsive smoke verified unified Experiment management, simulation-first hierarchy, migrated Simulation/Authoring touch targets, authoring keyboard semantics, and React Account dialog focus entry/return.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
