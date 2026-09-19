import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260919122000_durable_closure_role_symmetry.sql", import.meta.url),
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
const authoring = readFileSync(new URL("../../docs/AUTHORING_CONTRACT.md", import.meta.url), "utf8");
const protocol = readFileSync(new URL("../../docs/AI_LAB_PROTOCOL.md", import.meta.url), "utf8");
const workflow = readFileSync(
  new URL("../../docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md", import.meta.url),
  "utf8",
);

test("#360 exposes one durable closure lifecycle to Student and Professor research AI", () => {
  assert.equal((mcp.match(/server\.registerTool\(\s*['"]request_capability['"]/g) ?? []).length, 1);
  assert.equal((mcp.match(/server\.registerTool\(\s*['"]resume_capability_closure['"]/g) ?? []).length, 1);
  assert.equal((mcp.match(/server\.registerTool\(\s*['"]revalidate_capability_closure['"]/g) ?? []).length, 1);
  assert.doesNotMatch(
    mcp,
    /if \(profile\.role === 'professor'\) \{[\s\S]*?(resume_capability_closure|revalidate_capability_closure)/,
  );
  assert.match(mcp, /shared_tool_count: MCP_TOOL_COUNT/);
  assert.match(mcp, /student_tool_count: MCP_TOOL_COUNT/);
  assert.match(mcp, /professor_tool_count: MCP_TOOL_COUNT/);
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/7'/);
  assert.match(tools, /capability_request_interface: 'vlab\.capability-request\/7'/);
});

test("#360 keeps Student revalidation owner-scoped while preserving Professor supervision", () => {
  assert.match(migration, /blocked_experiment_drafts_revalidate_researcher_or_professor/i);
  assert.match(migration, /requester_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /p\.role = 'professor'/i);
  assert.match(migration, /v_role not in \('student', 'professor'\)/i);
  assert.match(
    migration,
    /d\.requester_id = v_user_id[\s\S]*or v_role = 'professor'/i,
  );
  assert.doesNotMatch(migration, /requires a Professor profile/i);
});

test("#360 validation advertises the durable blocked continuation instead of a scientific substitute", () => {
  for (const source of [mcp, tools]) {
    assert.match(source, /durable_closure_required: true/);
    assert.match(source, /task_state_while_unsupported: 'blocked'/);
    assert.match(source, /resume_action: 'resume_capability_closure'/);
    assert.match(source, /revalidate_action: 'revalidate_capability_closure'/);
    assert.match(source, /unblocked_only_after_revalidation: true/);
  }
  assert.match(mcp, /task remains blocked/i);
  assert.match(mcp, /task_status: 'blocked'/);
  assert.match(mcp, /resume_with: 'resume_capability_closure'/);
  assert.match(mcp, /revalidate_with: 'revalidate_capability_closure'/);
});

test("#360 whole-Experiment revalidation is the only unblocking transition", () => {
  assert.match(mcp, /analysis_status === 'unblocked'/);
  assert.match(mcp, /Unblocked requires zero unsupported requirements, zero ambiguity, and zero new requests/);
  assert.match(migration, /unblocked requires zero unsupported requirements, zero ambiguity, and zero new requests/i);
  assert.match(migration, /set lifecycle = case when p_analysis_status = 'unblocked' then 'unblocked' else 'blocked' end/i);
  assert.match(mcp, /task_status: data\?\.blocked_experiment\?\.lifecycle/);
});

test("#360 supported semantics keep the ordinary authoring path", () => {
  assert.match(mcp, /When the Lab already represents the required semantics exactly, author normally/i);
  assert.match(mcp, /validateExperimentArtifacts\(artifacts\)/);
  assert.match(mcp, /\.from\('experiments'\)[\s\S]*\.insert\(/);
  assert.match(mcp, /\.from\('experiments'\)[\s\S]*\.update\(patch\)/);
});

test("#360 formal documents state the same blocking semantics for both roles", () => {
  assert.match(authoring, /Student and Professor research-AI sessions use the same scientific blocking semantics/i);
  assert.match(protocol, /Student and Professor sessions use the same scientific blocking semantics/i);
  assert.match(workflow, /Student and Professor share ordinary Experiment-domain behavior, durable capability-request submission, and closure resume\/revalidation semantics/i);
  for (const source of [authoring, protocol, workflow]) {
    assert.match(source, /whole-Experiment/i);
    assert.match(source, /unblocked/i);
  }
});

test("#360 changes closure routing, not simulator science or request taxonomy", () => {
  for (const requestClass of [
    "semantic_capability",
    "authoring_language",
    "runtime_configuration",
    "artifact_workflow",
    "implementation_optimization",
    "security_boundary",
  ]) {
    assert.match(mcp, new RegExp(requestClass));
  }
  assert.doesNotMatch(migration, /insert into public\.canonical_capabilities/i);
  assert.doesNotMatch(migration, /update public\.canonical_capabilities/i);
});
