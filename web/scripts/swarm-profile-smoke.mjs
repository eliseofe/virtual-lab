import assert from "node:assert/strict";
import { createSmokeSession } from "./smoke-browser-harness.mjs";
const url = process.argv[2] ?? "http://127.0.0.1:4173/";
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  if (attempt === 49) throw Error(`Server unavailable: ${url}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const session = await createSmokeSession({ url, initialUrl: "about:blank" });
const { cdp } = session;
async function evaluate(expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
    );
  return r.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 120; i++) {
    const result = await evaluate(expression);
    if (result) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(
    `Timeout: ${expression}; ${await evaluate('document.querySelector("#worker-status").textContent+" "+document.querySelector("#setup-error").textContent')}`,
  );
}
try {
  await cdp.send("Network.enable");
  // Exercise the built app without accessing the hosted registry or changing data.
  await cdp.send("Network.setBlockedURLs", { urls: ["*supabase.co/*"] });
  await cdp.send("Page.navigate", { url });
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await wait(
    'document.querySelector("#worker-status")?.dataset.state==="ready" && !!document.querySelector("#swarm-presets")',
  );
  for (const [variant, backend] of [
    ["2:1", "unicycle"],
    ["2:2", "unicycle"],
    ["2:3", "unicycle"],
    ["3:1", "quadrotor"],
  ]) {
    await evaluate(
      `(()=>{document.querySelector('#swarm-presets').click();const f=document.querySelector('dialog[aria-label="Swarm vs Swarm experiments"] form');f.elements.variant.value=${JSON.stringify(variant)};f.elements.variant.dispatchEvent(new Event('change'));f.requestSubmit();})()`,
    );
    await wait(
      `globalThis.__vlabMetricRuntime.runtimeContext()?.setup?.profile?.backend === '${backend}' && document.querySelector('#setup-feedback').dataset.state === 'success' && document.querySelector('#scientific-time').textContent==='0.000'`,
    );
    if (variant === "2:1") {
      await evaluate(`(() => {
        const editor=document.querySelector('[data-experiment-artifact-id="metrics"]');
        window.originalMetrics=editor.value;
        editor.value=editor.value.replaceAll('every(0.1)', 'every(0.07)');
        document.querySelector('#apply-setup').click();
      })()`);
      await wait(
        'document.querySelector("#setup-feedback").dataset.state === "error"',
      );
      assert.equal(
        await evaluate(
          "globalThis.__vlabMetricRuntime.runtimeContext().metricsIr.metrics[0].sampling.interval_seconds",
        ),
        0.1,
      );
      await evaluate(
        `document.querySelector('[data-experiment-artifact-id="metrics"]').value=window.originalMetrics;document.querySelector('#apply-setup').click()`,
      );
      await wait(
        'document.querySelector("#setup-feedback").dataset.state === "success"',
      );
    }
    assert.notEqual(
      await evaluate('document.querySelector("#run-seed").textContent'),
      "2026",
    );
    await evaluate(
      `(()=>{const speed=document.querySelector('#simulation-speed');speed.value='60';speed.dispatchEvent(new Event('input',{bubbles:true}));window.swarmSamples=[];document.addEventListener('vlab:metric-batch',e=>window.swarmSamples.push(...e.detail.samples),{signal:(window.smokeAbort=new AbortController()).signal});document.querySelector('#run').click();})()`,
    );
    await wait(
      'Number(document.querySelector("#scientific-time").textContent)>2',
    );
    await evaluate('document.querySelector("#pause").click()');
    await new Promise((r) => setTimeout(r, 100));
    const time = await evaluate(
      'document.querySelector("#scientific-time").textContent',
    );
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(
      await evaluate('document.querySelector("#scientific-time").textContent'),
      time,
    );
    assert.ok(await evaluate("window.swarmSamples.length>0"));
    assert.equal(
      await evaluate("window.swarmSamples.every(s=>Number.isFinite(s.value))"),
      true,
    );
    const phase = await evaluate(
      "globalThis.__vlabMetricRuntime.lastBatch()?.measurement_phase",
    );
    assert.equal(phase, "post-physics-state/1");
    // Exercise the actual canvas loop: later frames must still be requested in 3D.
    assert.ok(
      await evaluate(
        `(()=>{const c=document.querySelector('canvas');return c.width>0&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v!==0);})()`,
      ),
    );
    await evaluate(
      'window.smokeAbort.abort();document.querySelector("#restart").click()',
    );
    await wait(
      'document.querySelector("#scientific-time").textContent==="0.000"',
    );
    console.log(
      `PASS ${variant}: load, fresh heading seed, run, pause, metrics, canvas, reset`,
    );
  }
  assert.deepEqual(cdp.exceptions, []);
  console.log(
    "PASS: all four profile presets in the real built browser application",
  );
} finally {
  await session.close();
}
