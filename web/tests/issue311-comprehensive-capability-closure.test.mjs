import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918130234_capability_closure_submission.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const tools = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

test("#311 Student and Professor share one capability submission tool", () => {
  assert.equal((mcp.match(/server\.registerTool\(\s*['"]request_capability['"]/g) ?? []).length, 1);
  assert.doesNotMatch(mcp, /if \(profile\.role === 'professor'\)[\s\S]*request_capability/);
  assert.match(mcp, /Student\/Professor research-AI action/);
  assert.match(mcp, /triage_authority: 'professor'/);
  assert.match(mcp, /shared_tool_count: MCP_TOOL_COUNT/);
  assert.match(mcp, /student_tool_count: MCP_TOOL_COUNT/);
  assert.match(mcp, /professor_tool_count: MCP_TOOL_COUNT/);
});

test("#311 unsupported diagnostics advertise requestability for both roles", () => {
  assert.match(mcp, /requestable: true,[\s\S]*action: 'request_capability'/);
  assert.doesNotMatch(mcp, /reason: 'student-role'/);
  assert.match(tools, /capability_request_interface: 'vlab\.capability-request\/\d+'/);
  assert.match(tools, /triage_authority: 'professor'/);
});

test("#311 requires a whole blocked Experiment context rather than title-only preservation", () => {
  assert.match(mcp, /A title alone is not enough/);
  assert.match(mcp, /source_context: z\.string\(\)\.max\(40000\)/);
  assert.match(mcp, /identified_requirements: z\.array\(CLOSURE_REQUIREMENT_INPUT\)\.min\(1\)/);
  assert.match(mcp, /analysis_status: z\.enum\(\['best_effort_complete', 'partial_due_to_ambiguity'\]\)/);
  assert.match(migration, /A title alone is not enough to preserve a blocked Experiment/i);
});

test("#311 preserves ambiguity on the research side and blocks ambiguous developer requests", () => {
  assert.match(mcp, /resolution_status: z\.enum\(\['clear', 'ambiguous'\]\)/);
  assert.match(migration, /partial_due_to_ambiguity requires at least one unresolved ambiguity/i);
  assert.match(migration, /scientifically ambiguous/i);
});

test("#311 groups multiple capability requests under one atomic closure analysis", () => {
  assert.match(mcp, /requests: z\.array\(GROUPED_EXTENSION_REQUEST_INPUT\)/);
  assert.match(mcp, /supabase\.rpc\('submit_extension_closure'/);
  assert.match(migration, /create or replace function public\.submit_capability_closure/i);
  assert.match(migration, /closure_analysis_id/i);
  assert.match(migration, /requirement_keys jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /for v_request in[\s\S]*jsonb_array_elements\(p_requests\)/i);
});

test("#311 Student can submit but Professor alone retains queue-wide triage", () => {
  assert.match(migration, /requester_role = \([\s\S]*select p\.role[\s\S]*auth\.uid/i);
  assert.match(migration, /create policy "capability_requests_select_visible"/i);
  assert.match(migration, /requester_id = \(select auth\.uid\(\)\)[\s\S]*p\.role = 'professor'/i);
  assert.doesNotMatch(migration, /create policy "capability_requests_triage_student"/i);
});

test("#311 fixes the request lifecycle hook contract without freezing later MCP versions", () => {
  assert.match(migration, /'setup', 'initialize', 'control', 'measure', 'finalize'/);
  assert.match(tools, /MCP_SERVER_VERSION = '\d+\.\d+\.\d+'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '\d+'/);
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/\d+'/);
});
