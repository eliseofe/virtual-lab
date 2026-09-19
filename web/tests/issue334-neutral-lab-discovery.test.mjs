import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mcp = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
const version = readFileSync(new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260918172500_global_canonical_capability_registry.sql", import.meta.url), "utf8");

const workspace = mcp.match(/server\.registerTool\(\s*'read_workspace',[\s\S]*?server\.registerTool\(\s*'manage_collection'/)?.[0] ?? "";

test("#334 neutral discovery returns full formal Lab contract and canonical capability registry", () => {
  assert.match(workspace, /authoringInfo\(experiment_id \? include_authoring_contract : true, profile\.role\)/);
  assert.match(workspace, /capability_registry: capabilityRegistry \?\? \[\]/);
  assert.match(workspace, /if \(!include_workspace_index\) return toolResult\(neutralLabKnowledge\)/);
});

test("#334 default discovery does not query Experiment summaries or collections before neutral return", () => {
  const start = workspace.indexOf("const { data: capabilityRegistry");
  const marker = "if (!include_workspace_index) return toolResult(neutralLabKnowledge)";
  const neutralPath = workspace.slice(start, workspace.indexOf(marker) + marker.length);
  assert.ok(start >= 0);
  assert.doesNotMatch(neutralPath, /\.from\('experiments'\)/);
  assert.doesNotMatch(neutralPath, /\.from\('experiment_collections'\)/);
  assert.doesNotMatch(neutralPath, /draft_title|draft_description|professor_notes|developer_notes|requirement_keys|origin_experiment_id/);
});

test("#334 canonical registry function exposes only formal capability truth", () => {
  for (const required of [
    "id uuid",
    "capability_domain text",
    "capability_name text",
    "canonical_definition text",
    "status text",
    "publication_provenance jsonb",
    "implemented_contract_version text",
    "implemented_capability_version text",
    "implemented_at timestamptz",
  ]) {
    assert.equal(migration.includes(required), true, "missing canonical field: " + required);
  }

  for (const forbidden of [
    "draft_title", "draft_description", "context", "professor_notes", "developer_notes",
    "requirement_keys", "origin_experiment_id", "closure_analysis_id", "draft_artifacts",
  ]) {
    assert.equal(migration.includes(forbidden), false, "canonical RPC leaked historical field: " + forbidden);
  }
});

test("#334 canonical registry is global authenticated Lab knowledge with no anonymous access", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute on function public\.list_canonical_capabilities\(\) to authenticated/);
  assert.match(migration, /revoke execute on function public\.list_canonical_capabilities\(\) from anon/);
  assert.doesNotMatch(migration, /auth\.uid|requester_id/);
});

test("#334 neutral discovery survives later MCP/request-interface evolution", () => {
  assert.match(version, /MCP_SERVER_VERSION = '3\.\d+\.\d+'/);
  assert.match(version, /MCP_INTERFACE_VERSION = '13'/);
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/\d+'/);
});
