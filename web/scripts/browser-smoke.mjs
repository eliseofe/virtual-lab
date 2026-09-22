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
      console.log("Browser reached simulator ready with Ace authoring, the metrics runtime bridge, measured speed controls, and same-seed/new-seed restart controls.");
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
