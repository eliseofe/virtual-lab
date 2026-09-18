import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
const tools = readFileSync(new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url), "utf8");
const docs = readFileSync(new URL("../../docs/EXPERIMENT_MCP.md", import.meta.url), "utf8");
const status = readFileSync(new URL("../../CURRENT_STATUS.md", import.meta.url), "utf8");
const report = JSON.parse(readFileSync(new URL("../../.github/terminal-report.json", import.meta.url), "utf8"));

test("#298 defaults workspace discovery to all RLS-visible Experiments", () => {
  assert.match(index, /owned_only: z\.boolean\(\)\.default\(false\)/);
  assert.match(index, /all Experiment summaries visible through the caller\\'s RLS permissions by default/);
  assert.match(index, /Set owned_only=true only when the caller specifically wants to narrow discovery/);
  assert.match(index, /if \(owned_only\) query = query\.eq\('owner_id', userId\)/);
});

test("#298 preserves owner-scoped mutation despite broader read discovery", () => {
  assert.match(index, /\.update\(patch\)[\s\S]*\.eq\('owner_id', userId\)/);
  assert.match(index, /\.delete\(\)[\s\S]*\.eq\('owner_id', userId\)/);
});

test("#298 visible-workspace discovery survives later MCP interface evolution", () => {
  assert.match(tools, /MCP_SERVER_VERSION = '\d+\.\d+\.\d+'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '\d+'/);
  assert.match(docs, /all Experiment summaries visible through the caller's RLS permissions by default/);
  assert.match(docs, /owned_only=true/);
});

test("#298 remains recorded after its UI/UX successor evolves", () => {
  assert.match(status, /Assistant workspace discovery defaults to all Experiments visible/);
  assert.equal(report.schema, "vlab.terminal-report/2");
});
