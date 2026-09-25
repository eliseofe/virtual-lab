import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RESULTS_PRESENTATION_SCHEMA,
  metricIdsFromArtifacts,
  mutateMetricArtifact,
  mutateResultsPanels,
  normalizeResultsPanels,
  pruneMetricFromPanels,
} from "../../supabase/functions/experiment-mcp/results-authoring.js";

function artifacts(metrics = "") {
  return [
    { id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", order: 10, content: "GAIN = 2.0\n" },
    { id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", order: 20, content: "" },
    { id: "controller", type: "controller", label: "Controller", format: "python-vlab/0.1", order: 30, content: "" },
    { id: "metrics", type: "metrics", label: "Metrics", format: "python-vlab-metrics/0.1", order: 40, content: metrics },
  ];
}

const metricOne = `@metric(id="metric.one", name="Metric one", unit=None, sampling=every(0.1))
def metric_one(snapshot):
    return GAIN
`;

const metricOneUpdated = `@metric(id="metric.one", name="Metric one updated", unit="u", sampling=every(0.2))
def metric_one(snapshot):
    return GAIN + 1.0
`;

const metricTwo = `@metric(id="metric.two", name="Metric two", unit=None, sampling=final())
def metric_two(snapshot):
    return snapshot.agent_count
`;

test("#200 creates, updates and removes one metric without rewriting unrelated artifacts", () => {
  const base = artifacts("");
  const createdOne = mutateMetricArtifact(base, { action: "create_metric", metric_source: metricOne });
  assert.deepEqual(metricIdsFromArtifacts(createdOne.artifacts), ["metric.one"]);
  assert.equal(createdOne.artifacts[0].content, base[0].content);
  assert.equal(createdOne.artifacts[1].content, base[1].content);
  assert.equal(createdOne.artifacts[2].content, base[2].content);

  const createdTwo = mutateMetricArtifact(createdOne.artifacts, { action: "create_metric", metric_source: metricTwo });
  assert.deepEqual(metricIdsFromArtifacts(createdTwo.artifacts), ["metric.one", "metric.two"]);

  const updated = mutateMetricArtifact(createdTwo.artifacts, {
    action: "update_metric",
    metric_id: "metric.one",
    metric_source: metricOneUpdated,
  });
  assert.deepEqual(metricIdsFromArtifacts(updated.artifacts), ["metric.one", "metric.two"]);
  assert.match(updated.metrics_source, /Metric one updated/);
  assert.match(updated.metrics_source, /metric\.two/);

  const removed = mutateMetricArtifact(updated.artifacts, { action: "remove_metric", metric_id: "metric.one" });
  assert.deepEqual(metricIdsFromArtifacts(removed.artifacts), ["metric.two"]);
  assert.doesNotMatch(removed.metrics_source, /metric\.one/);
});

test("#200 stable metric identity cannot be silently changed by update", () => {
  const base = artifacts(metricOne);
  assert.throws(() => mutateMetricArtifact(base, {
    action: "update_metric",
    metric_id: "metric.one",
    metric_source: metricTwo,
  }), /preserve stable metric id/);
});

test("#200 Results panels support ordered multi-series bindings and metric reuse", () => {
  const available = ["metric.one", "metric.two"];
  let panels = mutateResultsPanels([], available, {
    action: "upsert_panel",
    panel_id: "main",
    metric_ids: ["metric.one", "metric.two"],
  });
  panels = mutateResultsPanels(panels, available, {
    action: "upsert_panel",
    panel_id: "detail",
    metric_ids: ["metric.one"],
  });
  assert.deepEqual(panels, [
    { id: "main", type: "time-series", metric_ids: ["metric.one", "metric.two"] },
    { id: "detail", type: "time-series", metric_ids: ["metric.one"] },
  ]);
  assert.throws(() => normalizeResultsPanels([
    { id: "bad", type: "time-series", metric_ids: ["missing"] },
  ], available), /unknown metric/);
});

test("#200 removing a metric prunes only its Results bindings and empty panels", () => {
  const panels = [
    { id: "main", type: "time-series", metric_ids: ["metric.one", "metric.two"] },
    { id: "only-one", type: "time-series", metric_ids: ["metric.one"] },
  ];
  assert.deepEqual(pruneMetricFromPanels(panels, ["metric.two"], "metric.one"), [
    { id: "main", type: "time-series", metric_ids: ["metric.two"] },
  ]);
});

test("#200 deployed-contract source increments versions and keeps Results outside scientific revision", async () => {
  const index = await readFile(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
  const tools = await readFile(new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../supabase/migrations/20260916100000_results_presentations.sql", import.meta.url), "utf8");
  const bridge = await readFile(new URL("../src/results-presentation-bridge.js", import.meta.url), "utf8");
  const shell = await readFile(new URL("../src/workspace-shell.js", import.meta.url), "utf8");

  assert.equal(RESULTS_PRESENTATION_SCHEMA, "vlab.results-presentation/1");
  assert.match(tools, /MCP_SERVER_VERSION = '\d+\.\d+\.\d+'/);
  assert.match(tools, /contract_version: 'vlab\.authoring\/0\.14'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '\d+'/);
  assert.match(index, /author_metrics_results/);
  assert.match(index, /requested_lifecycle_hook: z\.enum\(\['setup', 'initialize', 'control', 'measure', 'finalize'\]\)/);
  assert.match(index, /shared_tool_count: MCP_TOOL_COUNT/);
  assert.match(index, /professor_tool_count: MCP_TOOL_COUNT/);
  assert.match(migration, /create table if not exists public\.experiment_results_presentations/);
  assert.match(migration, /before update on public\.experiment_results_presentations/);
  assert.doesNotMatch(migration, /before update on public\.experiments/);
  assert.match(bridge, /experiment_results_presentations/);
  // #569: plots are added through the results controller, not a global handle.
  assert.match(bridge, /resultsCommands\.addPanelWithMetrics\(ids\)/);
  assert.doesNotMatch(bridge, /__vlabResultsUI|\.click\(\)/);
  assert.match(shell, /import "\.\/results-presentation-bridge\.js"/);
});
