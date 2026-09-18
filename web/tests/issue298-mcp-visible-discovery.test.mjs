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

test("#298 is a patch-level MCP behavior change with stable interface", () => {
  assert.match(tools, /MCP_SERVER_VERSION = '3\.0\.1'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '8'/);
  assert.match(docs, /all Experiment summaries visible through the caller's RLS permissions by default/);
  assert.match(docs, /owned_only=true/);
});

test("#298 records #299 as the unstarted successor", () => {
  assert.match(status, /#299 — restructure Experiment navigation and Professor supervision UX/);
  assert.equal(report.schema, "vlab.terminal-report/2");
  assert.equal(report.next.kind, "epic_continues");
  assert.equal(report.next.issue, 299);
  assert.equal(report.close_issue, 298);
});
