import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918151213_capability_closure_reconciliation.sql", import.meta.url),
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

test("#313 reuses one blocked Experiment for repeated initial closure submissions", () => {
  assert.match(migration, /requester_id = v_user_id[\s\S]*lifecycle = 'blocked'/);
  assert.match(migration, /origin_experiment_id = p_origin_experiment_id/);
  assert.match(migration, /lower\(btrim\(d\.title\)\) = lower\(v_title\)/);
  assert.match(migration, /v_reused_draft := true/);
  assert.match(migration, /v_next_sequence := v_previous\.analysis_sequence \+ 1/);
  assert.match(migration, /reused_blocked_experiment/);
});

test("#313 cumulative initial analyses preserve requirements found across multiple research-AI calls", () => {
  assert.match(migration, /jsonb_array_elements\(v_previous\.identified_requirements\)/);
  assert.match(migration, /jsonb_array_elements\(p_identified_requirements\)/);
  assert.match(migration, /distinct on \(s\.key\)/);
  assert.match(migration, /v_identified_requirements/);
  assert.match(migration, /v_unresolved_ambiguities/);
});

test("#313 reconciles an existing nonterminal request without changing its lifecycle status", () => {
  assert.match(migration, /r\.status in \('requested', 'approved', 'in_progress'\)/);
  assert.match(migration, /when 'in_progress' then 3[\s\S]*when 'approved' then 2[\s\S]*when 'requested' then 1/);
  assert.match(migration, /private\.reconcile_capability_request/);
  assert.match(migration, /set closure_analysis_id = p_closure_analysis_id,[\s\S]*requirement_keys = v_keys/);
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,300}status\s*=/i,
    "reconciliation must not rewrite request lifecycle status",
  );
  assert.match(migration, /reused_existing', true/);
});

test("#313 reconciliation helper is private, caller-owned and schema-pinned", () => {
  assert.match(migration, /create or replace function private\.reconcile_capability_request/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /r\.requester_id = v_user_id/);
  assert.match(migration, /d\.requester_id = v_user_id/);
  assert.match(migration, /revoke all on function private\.reconcile_capability_request/);
  assert.match(migration, /grant execute on function private\.reconcile_capability_request[\s\S]*to authenticated/);
});

test("#313 keeps the capability request interface stable across later MCP evolution", () => {
  const interfaceVersion = Number(tools.match(/MCP_INTERFACE_VERSION = '(\\d+)'/)?.[1] ?? 0);
  assert.ok(interfaceVersion >= 10);
  assert.match(tools, /MCP_SERVER_VERSION = '3\.\d+\.\d+'/);
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/3'/);
  assert.match(mcp, /converge on the same durable blocked Experiment/i);
  assert.match(mcp, /preserving (?:its|their) current lifecycle state/i);
});
