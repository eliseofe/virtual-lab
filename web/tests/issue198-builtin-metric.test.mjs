import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const builtin = await readFile(path.join(repo, "web/src/builtin-active-elastic-metrics.js"), "utf8");
const bridge = await readFile(path.join(repo, "web/src/metrics-runtime-bridge.js"), "utf8");

test("#198 built-in Active Elastic ships the owner-authorized polarization metric", () => {
  assert.match(builtin, /@metric\(id="polarization", name="Polarization order parameter"/);
  assert.match(builtin, /total \+= agent\.heading/);
  assert.match(builtin, /return norm\(total\) \/ snapshot\.agent_count/);
  assert.match(builtin, /data-experiment-artifact-id="metrics"/);
});

test("#198 metric artifact is installed before Results/runtime bridge initialization", () => {
  const builtinImport = bridge.indexOf('import "./builtin-active-elastic-metrics.js";');
  const resultsImport = bridge.indexOf('import "./results-ui.js";');
  assert.ok(builtinImport >= 0, "metrics bridge must import the built-in metric artifact");
  assert.ok(resultsImport > builtinImport, "built-in metric artifact must be installed before Results initializes");
});
