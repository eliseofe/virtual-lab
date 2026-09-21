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

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");
  await waitReady(cdp.send);

  const expression = `(async () => {
    const resources = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\\.js(?:\\?|$)/.test(name));
    const texts = [];
    for (const resource of resources) {
      try {
        const response = await fetch(resource, { cache: "no-store" });
        if (response.ok) texts.push(await response.text());
      } catch {}
    }
    const deployedJs = texts.join("\\n");
    const decisions = ["Accept", "Reject", "Revise", "Defer", "Future"];
    const panel = document.querySelector(".professor-panel");
    return JSON.stringify({
      decisions: Object.fromEntries(decisions.map((label) => [label, deployedJs.includes(label)])),
      hasGuidance: deployedJs.includes("Professor guidance"),
      hasDisposition: deployedJs.includes("professor_disposition"),
      hasReviseGuard: deployedJs.includes("Revise requires Professor guidance"),
      oldApproveControl: deployedJs.includes('approve.textContent = "Approve"'),
      oldDeclineControl: deployedJs.includes('decline.textContent = "Decline"'),
      signedOutProfessorHidden: Boolean(panel?.hidden),
      hasTriageRpc: deployedJs.includes("triage_extension_request"),
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    });
  })()`;
  const result = JSON.parse(await evaluate(cdp.send, expression));

  if (Object.values(result.decisions).some((present) => !present)) {
    throw new Error(`deployed Professor decision artifact is incomplete: ${JSON.stringify(result)}`);
  }
  if (!result.hasGuidance || !result.hasDisposition || !result.hasReviseGuard || !result.signedOutProfessorHidden || !result.hasTriageRpc) {
    throw new Error(`deployed Professor review contract is incomplete: ${JSON.stringify(result)}`);
  }
  if (result.oldApproveControl || result.oldDeclineControl) {
    throw new Error(`legacy binary Professor controls remain in deployed artifact: ${JSON.stringify(result)}`);
  }
  if (result.scrollWidth > result.width + 1) {
    throw new Error(`Professor review deployment introduced page overflow: ${JSON.stringify(result)}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);

  console.log(JSON.stringify(result, null, 2));
  console.log("Professor review smoke verified the deployed five-way review artifact and signed-out access boundary.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
