import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918140225_capability_closure_revalidation.sql", import.meta.url),
  "utf8",
);
const policyMerge = readFileSync(
  new URL("../../supabase/migrations/20260918140253_capability_closure_revalidation_policy_merge.sql", import.meta.url),
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

test("#312 adds Professor-only resume and revalidation tools without changing Student tool count", () => {
  assert.match(mcp, /if \(profile\.role === 'professor'\) \{[\s\S]*'resume_capability_closure'/);
  assert.match(mcp, /if \(profile\.role === 'professor'\) \{[\s\S]*'revalidate_capability_closure'/);
  assert.match(mcp, /shared_tool_count: 7/);
  assert.match(mcp, /student_tool_count: 7/);
  assert.match(mcp, /professor_tool_count: 9/);
  assert.equal((mcp.match(/server\.registerTool\(\s*['"]request_capability['"]/g) ?? []).length, 1);
});

test("#312 resume returns the durable blocked Experiment, ordered analysis history and linked requests", () => {
  assert.match(mcp, /from\('blocked_experiment_drafts'\)[\s\S]*maybeSingle\(\)/);
  assert.match(mcp, /from\('capability_closure_analyses'\)[\s\S]*order\('analysis_sequence'/);
  assert.match(mcp, /from\('capability_requests'\)[\s\S]*\.in\('closure_analysis_id', analysisIds\)/);
  assert.match(mcp, /latest_analysis/);
  assert.match(mcp, /analysis_history/);
});

test("#312 revalidation is optimistic, append-only and versioned", () => {
  assert.match(mcp, /base_analysis_sequence: z\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(mcp, /supabase\.rpc\('revalidate_capability_closure'/);
  assert.match(migration, /v_previous\.analysis_sequence <> p_base_analysis_sequence/);
  assert.match(migration, /v_next_sequence := v_previous\.analysis_sequence \+ 1/);
  assert.match(migration, /insert into public\.capability_closure_analyses/);
  assert.doesNotMatch(migration, /update public\.capability_closure_analyses/);
  assert.match(migration, /p_contract_version/);
});

test("#312 whole-Experiment transition explicitly distinguishes resolved, remaining and new gaps", () => {
  assert.match(migration, /resolved_requirement_keys/);
  assert.match(migration, /remaining_requirement_keys/);
  assert.match(migration, /new_requirement_keys/);
  assert.match(migration, /except[\s\S]*jsonb_array_elements\(p_identified_requirements\)/i);
  assert.match(migration, /intersect[\s\S]*jsonb_array_elements\(p_identified_requirements\)/i);
});

test("#312 cannot declare unblocked while any unsupported requirement or ambiguity remains", () => {
  assert.match(mcp, /analysis_status: z\.enum\(\['best_effort_complete', 'partial_due_to_ambiguity', 'unblocked'\]\)/);
  assert.match(migration, /unblocked requires zero unsupported requirements, zero ambiguity, and zero new requests/i);
  assert.match(migration, /partial_due_to_ambiguity requires an ambiguous requirement and unresolved ambiguity/i);
  assert.match(migration, /set lifecycle = case when p_analysis_status = 'unblocked' then 'unblocked' else 'blocked' end/i);
});

test("#312 preserves prior request lifecycle rows and only inserts newly surfaced requests", () => {
  assert.match(migration, /p_new_requests/);
  assert.match(migration, /insert into public\.capability_requests/);
  assert.doesNotMatch(migration, /update public\.capability_requests/);
  assert.doesNotMatch(migration, /delete from public\.capability_requests/);
});

test("#312 keeps Student submission while allowing Professor cross-requester revalidation", () => {
  assert.match(policyMerge, /d\.requester_id = \(select auth\.uid\(\)\)[\s\S]*p\.role = 'professor'/i);
  assert.match(policyMerge, /requester_role = \([\s\S]*select p\.role[\s\S]*auth\.uid/i);
  assert.equal((policyMerge.match(/create policy "capability_closure_analyses_insert_researcher_or_professor_revalidation"/g) ?? []).length, 1);
  assert.equal((policyMerge.match(/create policy "capability_requests_insert_researcher_or_professor_revalidation"/g) ?? []).length, 1);
});

test("#312 bumps the MCP and capability-request interfaces", () => {
  assert.match(tools, /MCP_SERVER_VERSION = '3\.2\.0'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '10'/);
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/3'/);
});
