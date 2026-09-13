import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeRateMeter, formatRuntimeFactor } from "../src/runtime/rate-meter.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");

async function text(relative) {
  return readFile(path.join(web, relative), "utf8");
}

test("actual runtime factor is observational and uses a long wall-clock window", async () => {
  const html = await text("src/index.html");
  const meterSource = await text("src/runtime-speed.js");

  assert.match(html, /id="simulation-speed-value"/);
  assert.match(html, /id="actual-simulation-speed"/);
  assert.match(html, /src="\.\/runtime-speed\.js"/);
  assert.match(html, /wall-clock execution speed only; simulation dynamics are unchanged/);

  assert.match(meterSource, /RuntimeRateMeter/);
  assert.match(meterSource, /meter\.start\(performance\.now\(\), modelSeconds\)/);
  assert.match(meterSource, /meter\.sample\(performance\.now\(\), modelSeconds\)/);
  assert.doesNotMatch(meterSource, /instantaneousFactor|smoothedFactor|modelDelta \/ wallDeltaSeconds/);
  assert.doesNotMatch(meterSource, /postMessage|worker|CONTROL_DT|PHYSICS_DT/);
});

test("sub-real-time execution reports below 1x", () => {
  const meter = new RuntimeRateMeter({ minElapsedMs: 0 });
  meter.start(0, 10.0);
  assert.equal(meter.sample(5000, 11.5), 0.3);
  assert.equal(formatRuntimeFactor(0.3), "0.30×");
});

test("bursty delayed snapshot delivery cannot turn 0.3x progress into an inflated adjacent-sample rate", () => {
  const meter = new RuntimeRateMeter({ minElapsedMs: 0 });
  meter.start(0, 0.0);

  // The main thread is blocked for ~3 s. Three stale snapshots are then
  // processed almost back-to-back. An adjacent-arrival estimator would see
  // 0.3 model seconds over ~10 ms and could report ~30x. The long-window
  // estimator correctly includes the blocked wall time in its denominator.
  assert.ok(Math.abs(meter.sample(3000, 0.3) - 0.1) < 1e-12);
  assert.ok(Math.abs(meter.sample(3010, 0.6) - (0.6 / 3.01)) < 1e-12);
  assert.ok(Math.abs(meter.sample(3020, 0.9) - (0.9 / 3.02)) < 1e-12);
  assert.ok(Math.abs(meter.sample(4000, 1.2) - 0.3) < 1e-12);
});

test("speed-change baseline reset measures only the new execution interval", () => {
  const meter = new RuntimeRateMeter({ minElapsedMs: 0 });
  meter.start(0, 0.0);
  assert.equal(meter.sample(2000, 1.0), 0.5);
  meter.start(2000, 1.0);
  assert.equal(meter.sample(3000, 3.0), 2.0);
});
