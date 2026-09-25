import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260923003000_capability_request_already_supported.sql", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const mcp = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
const linked = readFileSync(new URL("../../supabase/functions/experiment-mcp/closure-linked-requests.js", import.meta.url), "utf8");
const metrics = readFileSync(new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url), "utf8");

test("#523 keeps lifecycle and Professor response separate", () => {
  assert.match(migration, /status = 'resolved' and professor_disposition = 'already_supported'/);
  assert.match(migration, /capability_requests_status_check[\s\S]*'resolved'/);
  assert.match(migration, /capability_request_professor_reviews_disposition_check[\s\S]*'already_supported'/);
  assert.match(migration, /set status = 'resolved',[\s\S]*professor_disposition = 'already_supported'/);
});

test("#523 stores machine-readable existing support", () => {
  assert.match(migration, /create table if not exists public\.capability_request_support_resolutions/);
  assert.match(migration, /support_kind in \('canonical_capability', 'contract_path'\)/);
  assert.match(migration, /canonical_capability_id uuid references public\.canonical_capabilities/);
  assert.match(migration, /resolve_extension_request_already_supported/);
  assert.match(migration, /implementation_state = 'implemented'/);
  assert.match(migration, /semantic request resolved as Already Supported must cite at least one implemented canonical capability/i);
});

test("#523 exposes the sixth Professor action", () => {
  // #551: behaviour covered by professor-requests.test.mjs; this checks the inbox uses the rule.
  assert.match(inbox, /panel\.dataset\.vlabProfessorReviewContract = PROFESSOR_REVIEW_CONTRACT/);
  assert.match(inbox, /for \(const \[label, decision, primary\] of PROFESSOR_REVIEW_DECISIONS\)/);
  assert.match(inbox, /professor-support-capabilities/);
  assert.match(inbox, /resolve_extension_request_already_supported/);
  assert.match(inbox, /const currentState = requestCurrentState\(request\)/);
});

test("#523 MCP roundtrips resolved support without treating it as missing", () => {
  assert.match(mcp, /vlab\.capability-request\/11/);
  assert.match(metrics, /MCP_SERVER_VERSION = '3\.23\.0'/);
  assert.match(mcp, /resolved_supported/);
  assert.match(mcp, /support_resolution/);
  assert.match(mcp, /already_supported:/);
  assert.match(linked, /support_resolution/);
});

test("#523 reconciles only the five established false-positive Eliseo request keys", () => {
  for (const key of [
    "controller.quality_modulated_timer",
    "initialization.stubborn_fraction",
    "environment.time_triggered_quality_swap",
    "controller.phase_machine_and_stubborn",
    "environment.site_quality_regions",
  ]) assert.ok(migration.includes(key), key);
  assert.equal(migration.includes("observation.neighbour_public_scalar"), false);
  assert.equal(migration.includes("arena_visualization_red_blue_nest"), false);
});
