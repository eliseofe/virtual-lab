import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");

async function text(relative) {
  return readFile(path.join(web, relative), "utf8");
}

test("actual runtime factor is observational and displayed beside requested speed", async () => {
  const html = await text("src/index.html");
  const meter = await text("src/runtime-speed.js");

  assert.match(html, /id="simulation-speed-value"/);
  assert.match(html, /id="actual-simulation-speed"/);
  assert.match(html, /src="\.\/runtime-speed\.js"/);
  assert.match(html, /Actual speed is measured from model time versus wall time/);

  assert.match(meter, /performance\.now\(\)/);
  assert.match(meter, /modelDelta \/ wallDeltaSeconds/);
  assert.match(meter, /MutationObserver\(sampleMeasurement\)/);
  assert.match(meter, /requestedSpeed\.addEventListener\("input", resetMeasurement\)/);
  assert.doesNotMatch(meter, /postMessage|worker|CONTROL_DT|PHYSICS_DT/);
});
