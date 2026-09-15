import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileMetrics } from "../src/metrics/compiler.js";

const workerSource = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");
const bridgeSource = await readFile(new URL("../src/metrics-runtime-bridge.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.html", import.meta.url), "utf8");

const metricSource = `@metric(id="probe.count", name="Count", unit=None, sampling=every(0.1))
def count(snapshot):
    return snapshot.agent_count

@metric(id="probe.time", name="Time", unit="s", sampling=every(0.2))
def time(snapshot):
    return snapshot.scientific_time

@metric(id="probe.final", name="Final", unit=None, sampling=final())
def final_value(snapshot):
    return snapshot.agent_count
`;

test("Metrics compiler preserves independent per-metric sampling policies", () => {
  const ir = compileMetrics(metricSource);
  assert.equal(ir.schema, "vlab.metrics-ir/0.1");
  assert.equal(ir.measurement_phase, "post-physics-wrapped-state/1");
  assert.deepEqual(ir.metrics.map((metric) => [metric.id, metric.sampling]), [
    ["probe.count", { kind: "periodic", interval_seconds: 0.1 }],
    ["probe.time", { kind: "periodic", interval_seconds: 0.2 }],
    ["probe.final", { kind: "final" }],
  ]);
});

test("worker transports metric history in bounded batches independently from render snapshots", () => {
  assert.match(workerSource, /SNAPSHOT_INTERVAL_MS\s*=\s*1000\s*\/\s*60/);
  assert.match(workerSource, /METRIC_TRANSPORT_INTERVAL_MS\s*=\s*100/);
  assert.match(workerSource, /METRIC_TRANSPORT_BATCH_SIZE\s*=\s*4096/);
  assert.match(workerSource, /drain_metric_samples_json/);
  assert.match(workerSource, /metric-batch/);
  assert.match(workerSource, /metricDroppedSamples/);
  assert.doesNotMatch(workerSource, /localStorage|indexedDB|\.from\(|supabase|fetch\(/i);
});

test("Metrics runtime bridge is installed before main simulation startup", () => {
  const bridge = indexSource.indexOf('src="./metrics-runtime-bridge.js"');
  const main = indexSource.indexOf('src="./main.js"');
  assert.ok(bridge >= 0 && main > bridge);
  assert.match(bridgeSource, /compileMetrics\(metricSource\(\)/);
  assert.match(bridgeSource, /vlab:apply-metrics/);
  assert.match(bridgeSource, /vlab:metric-batch/);
  assert.match(bridgeSource, /__vlabMetricRuntime/);
});

test("metrics-only authoring changes use the existing Apply and restart action", () => {
  assert.match(bridgeSource, /data-experiment-artifact-id=\\"metrics\\"/);
  assert.match(bridgeSource, /#apply-workspace/);
  assert.match(bridgeSource, /metricsDirty = true/);
  assert.match(bridgeSource, /stopImmediatePropagation/);
  assert.match(bridgeSource, /type: "apply-metrics"/);
});
