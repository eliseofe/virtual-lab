import { performance } from "node:perf_hooks";
import { samplesToCsv } from "../src/result-storage-core.js";

const metricCount = 8;
const samplesPerMetric = 32768;
const series = Array.from({ length: samplesPerMetric }, (_, index) => ({
  t: (index + 1) * 0.01,
  value: Math.sin(index * 0.001),
}));
const started = performance.now();
let bytes = 0;
for (let metric = 0; metric < metricCount; metric += 1) {
  bytes += Buffer.byteLength(samplesToCsv(series));
}
const elapsedMs = performance.now() - started;
const samples = metricCount * samplesPerMetric;
const result = {
  workload: "persistence-serialization-only",
  metricCount,
  samplesPerMetric,
  samples,
  bytes,
  elapsedMs,
  samplesPerMs: samples / Math.max(elapsedMs, 1e-9),
};
console.log(JSON.stringify(result, null, 2));
if (samples !== 262144 || bytes <= 0 || !Number.isFinite(elapsedMs) || elapsedMs > 5000) {
  throw new Error(`unexpected persistence serialization profile: ${JSON.stringify(result)}`);
}
