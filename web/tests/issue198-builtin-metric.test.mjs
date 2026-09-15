import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compileMetrics } from "../src/metrics/compiler.js";
import { BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE } from "../src/builtin-active-elastic-metrics-source.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const installer = await readFile(path.join(repo, "web/src/builtin-active-elastic-metrics.js"), "utf8");
const bridge = await readFile(path.join(repo, "web/src/metrics-runtime-bridge.js"), "utf8");
const html = await readFile(path.join(repo, "web/src/index.html"), "utf8");
const artifacts = await readFile(path.join(repo, "web/src/experiment-artifacts.js"), "utf8");

test("#198 built-in Active Elastic ships two owner-authorized live metrics", () => {
  assert.match(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE, /@metric\(id="polarization", name="Polarization order parameter"/);
  assert.match(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE, /@metric\(id="angular_momentum", name="Angular momentum order parameter"/);
  assert.match(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE, /rotation \+= cross2\(radial_hat, agent\.heading\)/);
  const ir = compileMetrics(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE);
  assert.deepEqual(ir.metrics.map((metric) => metric.id), ["polarization", "angular_momentum"]);
  assert.match(JSON.stringify(ir.metrics[1]), /"name":"cross2"/);
});

test("#198 Metrics is a normal static core editor rather than an emergency DOM fixture", () => {
  assert.match(html, /id="metrics-source"/);
  assert.match(html, /data-artifact-id="metrics"/);
  assert.match(artifacts, /id: "metrics"[\s\S]*editorSelector: "#metrics-source"/);
  assert.doesNotMatch(installer, /createElement|append\(/);
  assert.match(installer, /document\.querySelector\("#metrics-source"\)/);
});

test("#198 built-in source is installed before Results/runtime bridge initialization", () => {
  const builtinImport = bridge.indexOf('import "./builtin-active-elastic-metrics.js";');
  const resultsImport = bridge.indexOf('import "./results-ui.js";');
  assert.ok(builtinImport >= 0);
  assert.ok(resultsImport > builtinImport);
});
