import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914153000_capability_requests.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const metricsResults = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

test("#135 capability requests are durable RLS-protected domain rows", () => {
  assert.match(migration, /create table if not exists public\.capability_requests/i);
  assert.match(migration, /requester_id uuid not null references auth\.users\(id\)/i);
  assert.match(migration, /draft_artifacts jsonb not null/i);
  assert.match(migration, /capability_domain text not null/i);
  assert.match(migration, /requested_lifecycle_hook in \('setup', 'initialize', 'control', 'finalize'\)/i);
  assert.match(migration, /status in \('requested', 'approved', 'declined', 'in_progress', 'implemented'\)/i);
  assert.match(migration, /github_issue_url text/i);
  assert.match(migration, /implemented_capability_version text/i);
  assert.match(migration, /alter table public\.capability_requests enable row level security/i);
});

test("#135 only Professor can insert an initial request and authenticated users cannot mutate lifecycle yet", () => {
  assert.match(migration, /grant select, insert on table public\.capability_requests to authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]*update[^;]*capability_requests[^;]*to authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*capability_requests[^;]*to authenticated/i);
  assert.match(migration, /requester_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /requester_role = 'professor'/i);
  assert.match(migration, /p\.role = 'professor'/i);
  assert.match(migration, /status = 'requested'/i);
  assert.match(migration, /github_issue_url is null/i);
  assert.match(migration, /implemented_at is null/i);
});

test("#135 existing Student and Professor experiment tools remain one shared implementation", () => {
  for (const tool of [
    "read_workspace",
    "manage_collection",
    "create_experiment",
    "edit_experiment",
    "delete_experiment",
  ]) {
    const matches = mcp.match(new RegExp(`server\\.registerTool\\(\\s*['\"]${tool}['\"]`, "g")) ?? [];
    assert.equal(matches.length, 1, `${tool} must remain one shared implementation`);
  }
  assert.match(metricsResults, /'author_metrics_results'/);
});

test("#135 Professor gets one additional request tool while Student gets no request action", () => {
  assert.match(mcp, /if \(profile\.role === 'professor'\) \{[\s\S]*server\.registerTool\(\s*'request_capability'/);
  assert.equal((mcp.match(/server\.registerTool\(\s*['\"]request_capability['\"]/g) ?? []).length, 1);
  assert.match(mcp, /requestable: true,[\s\S]*action: 'request_capability'/);
  assert.match(mcp, /requestable: false,[\s\S]*action: null,[\s\S]*reason: 'student-role'/);
  assert.match(mcp, /validationForRole\(validation, profile\.role\)/);
});

test("#135 request action preserves origin or draft without validating unsupported draft science", () => {
  assert.match(mcp, /origin_experiment_id: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(mcp, /draft_artifacts: z\.array\(ARTIFACT_INPUT\)\.optional\(\)/);
  assert.match(mcp, /const preservedArtifacts = draft_artifacts \?\? origin\?\.artifacts \?\? \[\]/);
  assert.match(mcp, /\.from\('capability_requests'\)[\s\S]*\.insert\(/);
  assert.match(mcp, /status: 'requested'/);
  assert.doesNotMatch(mcp, /validateExperimentArtifacts\(preservedArtifacts\)/);
});

test("#135 MCP interface advertises role-dependent capability requests without simulator access", () => {
  assert.match(metricsResults, /MCP_SERVER_VERSION = '3\.0\.\d+'/);
  assert.match(metricsResults, /MCP_INTERFACE_VERSION = '8'/);
  assert.match(mcp, /capability_request_interface: CAPABILITY_REQUEST_INTERFACE/);
  assert.match(mcp, /shared_tool_count: 6/);
  assert.match(mcp, /professor_tool_count: 7/);
  assert.match(mcp, /simulator_access: false/);
  assert.match(mcp, /requested_lifecycle_hook: z\.enum\(\['setup', 'initialize', 'control', 'measure', 'finalize'\]\)/);
});
