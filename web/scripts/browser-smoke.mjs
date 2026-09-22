import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    runSeed: document.querySelector('#run-seed')?.textContent ?? null,
    metricRuntimeBridge: Boolean(globalThis.__vlabMetricRuntime),
    codeEditorsReady: document.querySelectorAll('[data-vlab-code-editor-ready="true"]').length,
    codeEditorErrors: document.querySelectorAll('[data-vlab-code-editor-ready="error"]').length,
    codeEditorErrorMessages: [...document.querySelectorAll('[data-vlab-code-editor-ready="error"]')].map((node) => node.dataset.vlabCodeEditorError || "unknown"),
    configurationEditor: (() => {
      const source = document.querySelector('#experiment-config');
      const root = document.querySelector('[data-vlab-code-editor-root="configuration"]');
      const surface = root?.querySelector('[data-vlab-artifact-editor-surface="true"]');
      const editor = surface?.querySelector('.ace_editor');
      return {
        ready: surface?.dataset.vlabCodeEditorReady ?? null,
        engine: surface?.dataset.vlabEditorEngine ?? null,
        sourceHidden: source ? getComputedStyle(source).display === 'none' : false,
        lineNumbers: surface?.querySelectorAll('.ace_gutter-cell').length ?? 0,
        highlightedTokens: surface?.querySelectorAll('.ace_keyword, .ace_comment, .ace_string, .ace_numeric').length ?? 0,
        content: surface?.querySelector('.ace_text-layer')?.textContent ?? null,
        editable: editor?.querySelector('.ace_text-input')?.getAttribute('readonly') ?? null,
      };
    })(),
    authoringNavigation: (() => {
      const outline = document.querySelector('[data-vlab-authoring-outline="configuration"]');
      const find = document.querySelector('[data-vlab-authoring-find="configuration"]');
      return {
        outlineState: outline?.dataset.vlabOutlineState ?? null,
        outlineCount: Number(outline?.dataset.vlabOutlineSymbolCount ?? 0),
        outlineDisabled: outline?.querySelector('input')?.disabled ?? null,
        findVisible: Boolean(find && getComputedStyle(find).display !== 'none'),
      };
    })(),
    authoringDiagnostics: (() => {
      const surfaces = [...document.querySelectorAll('[data-vlab-artifact-editor-surface="true"]')];
      return {
        total: surfaces.reduce((sum, surface) => sum + Number(surface.dataset.vlabDiagnosticCount ?? 0), 0),
        completionSurfaces: surfaces.filter((surface) => Number(surface.dataset.vlabCompletionCount ?? 0) > 0).length,
      };
    })()
  })`;
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  const value = result?.result?.value;
  return value ? JSON.parse(value) : null;
}

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  let latest = null;
  let succeeded = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    latest = await state(cdp.send);
    if (latest?.statusState === "ready") {
      if (latest.codeEditorErrors) {
        throw new Error(`Ace authoring surface failed to initialize: ${JSON.stringify(latest)}`);
      }
      if (latest.codeEditorsReady < 4) {
        await sleep(100);
        continue;
      }
      if (!latest.metricRuntimeBridge) {
        throw new Error(`metrics runtime bridge is not loaded in the browser artifact: ${JSON.stringify(latest)}`);
      }
      const requiredConfig = [
        'INITIALIZATION_METHOD = "hexagon_perturbed"', "ARENA_SIZE = 10.0", "CONTROL_DT = 0.1",
        "INITIAL_POSITION_NOISE = 0.0", "U = 0.005", "OMEGA_MAX = 1.5707963267948966",
        "K1 = 0.005", "K2 = 0.06", "DESIRED_DISTANCE = 0.45", "PROXIMAL_RANGE = 0.81",
        "INTERACTION_RADIUS = PROXIMAL_RANGE", "MAX_FORWARD_SPEED = U", "MAX_ANGULAR_SPEED = OMEGA_MAX",
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
      if (
        latest.configurationEditor?.ready !== "true"
        || latest.configurationEditor?.engine !== "ace"
        || !latest.configurationEditor?.sourceHidden
        || latest.configurationEditor?.lineNumbers < 2
        || latest.configurationEditor?.highlightedTokens < 1
        || !latest.configurationEditor?.content?.includes("INITIALIZATION_METHOD")
      ) {
        throw new Error(`Ace authoring foundation is not visibly rendering the authoritative configuration source: ${JSON.stringify(latest)}`);
      }
      if (
        latest.authoringNavigation?.outlineState !== "ready"
        || latest.authoringNavigation?.outlineCount < 10
        || latest.authoringNavigation?.outlineDisabled
        || !latest.authoringNavigation?.findVisible
      ) {
        throw new Error(`compiler-derived Configuration outline is not available: ${JSON.stringify(latest)}`);
      }
      if (latest.authoringDiagnostics?.total !== 0 || latest.authoringDiagnostics?.completionSurfaces < 3) {
        throw new Error(`compiler-linked diagnostics/completion support did not initialize cleanly: ${JSON.stringify(latest)}`);
      }

      await cdp.send("Runtime.evaluate", {
        expression: "document.querySelector('[data-vlab-authoring-find=\"configuration\"]').click()",
      });
      await sleep(120);
      const searchVisible = await cdp.send("Runtime.evaluate", {
        expression: "Boolean(document.querySelector('.ace_search') && getComputedStyle(document.querySelector('.ace_search')).display !== 'none')",
        returnByValue: true,
      });
      if (!searchVisible?.result?.value) throw new Error("Ace Find control did not open the in-artifact search UI.");
      await cdp.send("Runtime.evaluate", {
        expression: "document.querySelector('.ace_searchbtn_close')?.click()",
      });

      await cdp.send("Runtime.evaluate", {
        expression: "document.querySelector('[data-vlab-authoring-tab=\"initialization\"]').click()",
      });
      await sleep(120);
      const initializerNavigation = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify((() => {
          const outline = document.querySelector('[data-vlab-authoring-outline="initialization"]');
          const root = document.querySelector('[data-vlab-code-editor-root="initialization"]');
          const surface = root?.querySelector('[data-vlab-artifact-editor-surface="true"]');
          return {
            outlineState: outline?.dataset.vlabOutlineState ?? null,
            outlineCount: Number(outline?.dataset.vlabOutlineSymbolCount ?? 0),
            foldWidgets: surface?.querySelectorAll('.ace_fold-widget').length ?? 0,
          };
        })())`,
        returnByValue: true,
      });
      const initializerNavigationState = JSON.parse(initializerNavigation?.result?.value ?? "null");
      if (
        initializerNavigationState?.outlineState !== "ready"
        || initializerNavigationState?.outlineCount !== 3
        || initializerNavigationState?.foldWidgets < 1
      ) {
        throw new Error(`Initializer outline/folding is not available: ${JSON.stringify(initializerNavigationState)}`);
      }

      await cdp.send("Runtime.evaluate", {
        expression: "document.querySelector('[data-vlab-authoring-tab=\"controller\"]').click()",
      });
      await sleep(120);
      const controllerSupport = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify((() => {
          const root = document.querySelector('[data-vlab-code-editor-root="controller"]');
          const surface = root?.querySelector('[data-vlab-artifact-editor-surface="true"]');
          const editor = surface && window.ace ? window.ace.edit(surface) : null;
          return {
            completionCount: Number(surface?.dataset.vlabCompletionCount ?? 0),
            diagnosticCount: Number(surface?.dataset.vlabDiagnosticCount ?? 0),
            annotations: editor?.session?.getAnnotations?.() ?? [],
          };
        })())`,
        returnByValue: true,
      });
      const controllerSupportState = JSON.parse(controllerSupport?.result?.value ?? "null");
      if (
        controllerSupportState?.completionCount < 3
        || controllerSupportState?.diagnosticCount !== 0
        || controllerSupportState?.annotations?.length !== 0
      ) {
        throw new Error(`Controller authoring support did not initialize cleanly: ${JSON.stringify(controllerSupportState)}`);
      }

      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const surface = document.querySelector('[data-vlab-code-editor-root="controller"] [data-vlab-artifact-editor-surface="true"]');
          const editor = window.ace.edit(surface);
          editor.focus();
          editor.execCommand('startAutocomplete');
        })()`,
      });
      await sleep(120);
      const completionVisible = await cdp.send("Runtime.evaluate", {
        expression: "Boolean(document.querySelector('.ace_autocomplete') && getComputedStyle(document.querySelector('.ace_autocomplete')).display !== 'none')",
        returnByValue: true,
      });
      if (!completionVisible?.result?.value) throw new Error("Ace constrained completion UI did not open.");
      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const surface = document.querySelector('[data-vlab-code-editor-root="controller"] [data-vlab-artifact-editor-surface="true"]');
          window.ace.edit(surface).completer?.detach();
        })()`,
      });

      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const surface = document.querySelector('[data-vlab-code-editor-root="controller"] [data-vlab-artifact-editor-surface="true"]');
          const editor = window.ace.edit(surface);
          globalThis.__vlabIssue205OriginalController = editor.getValue();
          editor.setValue("class SmokeBroken(Agent):\\n    def step(self, obs):\\n        return @", -1);
          editor.clearSelection();
        })()`,
      });
      await sleep(240);
      const linkedDiagnostic = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify((() => {
          const surface = document.querySelector('[data-vlab-code-editor-root="controller"] [data-vlab-artifact-editor-surface="true"]');
          const editor = window.ace.edit(surface);
          const detail = document.querySelector('[data-vlab-authoring-diagnostics="controller"]');
          const tab = document.querySelector('[data-vlab-authoring-tab="controller"]');
          return {
            diagnosticCount: Number(surface?.dataset.vlabDiagnosticCount ?? 0),
            annotations: editor?.session?.getAnnotations?.() ?? [],
            detailCount: Number(detail?.dataset.vlabAuthoringDiagnosticCount ?? 0),
            tabCount: Number(tab?.dataset.vlabDiagnosticCount ?? 0),
          };
        })())`,
        returnByValue: true,
      });
      const linkedDiagnosticState = JSON.parse(linkedDiagnostic?.result?.value ?? "null");
      if (
        linkedDiagnosticState?.diagnosticCount !== 1
        || linkedDiagnosticState?.annotations?.length !== 1
        || linkedDiagnosticState?.annotations?.[0]?.row !== 2
        || linkedDiagnosticState?.detailCount !== 1
        || linkedDiagnosticState?.tabCount !== 1
      ) {
        throw new Error(`Controller compiler error was not source-linked in Ace: ${JSON.stringify(linkedDiagnosticState)}`);
      }

      await cdp.send("Runtime.evaluate", {
        expression: "document.querySelector('[data-vlab-authoring-diagnostic]')?.click()",
      });
      await sleep(60);
      const diagnosticJump = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const surface = document.querySelector('[data-vlab-code-editor-root="controller"] [data-vlab-artifact-editor-surface="true"]');
          return window.ace.edit(surface).getCursorPosition().row;
        })()`,
        returnByValue: true,
      });
      if (diagnosticJump?.result?.value !== 2) throw new Error("Diagnostic selection did not jump to the compiler-reported source line.");

      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const surface = document.querySelector('[data-vlab-code-editor-root="controller"] [data-vlab-artifact-editor-surface="true"]');
          const editor = window.ace.edit(surface);
          editor.setValue(globalThis.__vlabIssue205OriginalController, -1);
          editor.session.getUndoManager().reset();
          editor.clearSelection();
          delete globalThis.__vlabIssue205OriginalController;
        })()`,
      });
      await sleep(240);
      const restoredSupport = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify((() => {
          const surface = document.querySelector('[data-vlab-code-editor-root="controller"] [data-vlab-artifact-editor-surface="true"]');
          const editor = window.ace.edit(surface);
          return {
            diagnosticCount: Number(surface?.dataset.vlabDiagnosticCount ?? 0),
            annotations: editor?.session?.getAnnotations?.() ?? [],
          };
        })())`,
        returnByValue: true,
      });
      const restoredSupportState = JSON.parse(restoredSupport?.result?.value ?? "null");
      if (restoredSupportState?.diagnosticCount !== 0 || restoredSupportState?.annotations?.length !== 0) {
        throw new Error(`Controller diagnostics did not clear after restoring valid source: ${JSON.stringify(restoredSupportState)}`);
      }

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
      console.log("Browser reached simulator ready with Ace authoring, compiler-derived Outline, Find, folding, source-linked diagnostics, constrained completion, metrics runtime bridge, measured speed controls, and restart controls.");
      succeeded = true;
      break;
    }
    if (latest?.statusState === "error") throw new Error(`browser reported startup error: ${JSON.stringify(latest)}`);
    await sleep(100);
  }
  if (!succeeded) throw new Error(`browser did not reach simulator ready: ${JSON.stringify(latest)}; exceptions=${JSON.stringify(cdp.exceptions)}`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
