import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result?.result?.value;
}

async function waitReady(send) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const state = await evaluate(send, "document.querySelector('#worker-status')?.dataset.state ?? null");
    if (state === "ready") return;
    if (state === "error") throw new Error("Browser reported startup error");
    await sleep(100);
  }
  throw new Error("Professor review smoke did not reach ready state");
}

async function waitProfessorReviewContract(send) {
  let latest = null;
  for (let attempt = 0; attempt < 250; attempt += 1) {
    latest = JSON.parse(await evaluate(send, `JSON.stringify((() => {
      const panel = document.querySelector(".professor-panel");
      return {
        contract: panel?.dataset.vlabProfessorReviewContract ?? null,
        decisions: panel?.dataset.vlabProfessorReviewDecisions ?? null,
        reviseGuidanceRequired: panel?.dataset.vlabProfessorReviseGuidanceRequired ?? null,
        signedOutProfessorHidden: Boolean(panel?.hidden),
        dialogReady: Boolean(document.querySelector("#professor-extension-inbox")),
      };
    })())`));
    if (
      latest.contract === "vlab.professor-review/3"
      && latest.decisions === "accepted,revise,deferred,future,rejected,already_supported"
      && latest.reviseGuidanceRequired === "true"
      && latest.signedOutProfessorHidden
      && latest.dialogReady
    ) return latest;
    await sleep(100);
  }
  throw new Error(`Professor review module did not expose its deployed contract: ${JSON.stringify(latest)}`);
}

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");
  await waitReady(cdp.send);
  await waitProfessorReviewContract(cdp.send);

  const expression = `JSON.stringify((() => {
    const panel = document.querySelector(".professor-panel");
    const dialog = document.querySelector("#professor-extension-inbox");
    return {
      contract: panel?.dataset.vlabProfessorReviewContract ?? null,
      decisions: panel?.dataset.vlabProfessorReviewDecisions ?? null,
      reviseGuidanceRequired: panel?.dataset.vlabProfessorReviseGuidanceRequired ?? null,
      signedOutProfessorHidden: Boolean(panel?.hidden),
      dialogReady: Boolean(dialog),
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  })())`;
  const result = JSON.parse(await evaluate(cdp.send, expression));

  if (
    result.contract !== "vlab.professor-review/2"
    || result.decisions !== "accepted,revise,deferred,future,rejected"
    || result.reviseGuidanceRequired !== "true"
    || !result.signedOutProfessorHidden
    || !result.dialogReady
  ) {
    throw new Error(`deployed Professor review contract is incomplete: ${JSON.stringify(result)}`);
  }
  if (result.scrollWidth > result.width + 1) {
    throw new Error(`Professor review deployment introduced page overflow: ${JSON.stringify(result)}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);

  console.log(JSON.stringify(result, null, 2));
  console.log("Professor review smoke verified the live five-way review contract marker and signed-out access boundary.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
