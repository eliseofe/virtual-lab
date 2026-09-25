// Invalid startup sources must not lock the Lab (#577 follow-up). The Lab
// compiles the sources it starts with (restored workspace or last edits); if
// they fail (e.g. an Initialization written before a retired call), the run
// controls stay off but applying sources must stay open, so the user, or
// opening an Experiment from the Library, can supply valid ones.
//
// The check breaks the startup Initialization before the simulator is ready
// (the WASM download is held for 3 s), expects a setup error with applying
// still enabled, then restores the valid source, applies it, and expects the
// simulator to become ready.

import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let session;
try {
  session = await createSmokeSession({ url, initialUrl: "about:blank" });
  const { cdp } = session;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `document.addEventListener("DOMContentLoaded", () => {
      const source = document.querySelector("#initializer-source");
      window.__vlabValidInitializer = source.value;
      source.value = source.value.replace(/(def initialize\\(config, rng, place\\):)/, "$1\\n    set_agent_state(0, 'role', 1.0)");
    });`,
  });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*.wasm*" }] });
  cdp.onEvent(async (method, params) => {
    if (method !== "Fetch.requestPaused") return;
    await sleep(3000);
    await cdp.send("Fetch.continueRequest", { requestId: params.requestId });
  });
  await cdp.send("Page.navigate", { url });

  const read = async () => JSON.parse((await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      status: document.querySelector('#worker-status')?.textContent ?? null,
      setupError: document.querySelector('#setup-error')?.textContent ?? null,
      applyDisabled: document.querySelector('#apply-setup')?.disabled ?? null,
      runDisabled: document.querySelector('#run')?.disabled ?? null,
      broken: document.querySelector('#initializer-source')?.value.includes('set_agent_state') ?? null,
    })`,
    returnByValue: true,
  }))?.result?.value ?? "null");

  let state = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await read();
    if (/error|ready/i.test(state?.status ?? "")) break;
    await sleep(250);
  }
  if (!state?.broken || state.status !== "Experiment setup error" || !/set_agent_state/.test(state.setupError)) {
    throw new Error(`the broken startup source did not produce a setup error: ${JSON.stringify(state)}`);
  }
  if (state.applyDisabled || !state.runDisabled) {
    throw new Error(`after a startup error, applying must stay enabled and running disabled: ${JSON.stringify(state)}`);
  }

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('#initializer-source').value = window.__vlabValidInitializer;
      document.querySelector('#apply-setup').click();`,
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await read();
    if (state?.status === "Simulator ready") break;
    await sleep(250);
  }
  if (state?.status !== "Simulator ready" || state.runDisabled || state.setupError) {
    throw new Error(`applying valid sources after a startup error did not start the simulator: ${JSON.stringify(state)}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log("Invalid startup sources leave applying open; valid sources then start the simulator.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
