import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");

  let state = null;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const root = document.querySelector('#react-migration-root');
        const chrome = root?.querySelector('[data-vlab-react-chrome="mounted"]');
        const topbar = document.querySelector('.topbar');
        const legacyWorker = document.querySelector('#worker-status');
        const simulationWorker = document.querySelector('[data-vlab-simulator-readiness]');
        const nav = [...(root?.querySelectorAll('[data-vlab-nav]') ?? [])].map((node) => node.getAttribute('data-vlab-nav'));
        const rect = root?.getBoundingClientRect();
        return {
          root: Boolean(root),
          hidden: Boolean(root?.hidden),
          mounted: Boolean(root?.querySelector('[data-vlab-react-foundation="mounted"]')),
          chrome: Boolean(chrome),
          visible: Boolean(rect && rect.height > 0 && getComputedStyle(root).display !== 'none'),
          legacyTopbarHidden: Boolean(topbar && getComputedStyle(topbar).display === 'none'),
          workerContextual: Boolean(legacyWorker && simulationWorker),
          nav,
          canvasOutsideRoot: Boolean(document.querySelector('#simulation-canvas')) && !root?.contains(document.querySelector('#simulation-canvas')),
          runOutsideRoot: Boolean(document.querySelector('#run')) && !root?.contains(document.querySelector('#run')),
          experimentOutsideRoot: Boolean(document.querySelector('#experiment-select')) && !root?.contains(document.querySelector('#experiment-select')),
          authoringOutsideRoot: Boolean(document.querySelector('#authoring-workbench')) && !root?.contains(document.querySelector('#authoring-workbench')),
        };
      })())`,
      returnByValue: true,
    });
    state = JSON.parse(result?.result?.value ?? "null");
    if (state?.mounted && state?.chrome && state?.workerContextual && state?.nav?.includes('account')) break;
    await sleep(100);
  }

  const requiredNav = ['control-panel', 'simulation', 'edit-experiment', 'help', 'account'];
  const missingNav = requiredNav.filter((item) => !state?.nav?.includes(item));
  if (!state?.root || state.hidden || !state.mounted || !state.chrome || !state.visible || !state.legacyTopbarHidden || !state.workerContextual || missingNav.length || !state.canvasOutsideRoot || !state.runOutsideRoot || !state.experimentOutsideRoot || !state.authoringOutsideRoot) {
    throw new Error(`React/Mantine application chrome failed: ${JSON.stringify({ ...state, missingNav })}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log(JSON.stringify(state, null, 2));
  console.log("React/Mantine application chrome is visible while authoritative simulator/workspace DOM remains outside React ownership.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
