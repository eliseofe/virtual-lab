import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260922201500_capability_request_single_current_lifecycle.sql", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const mcp = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
const metrics = readFileSync(new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url), "utf8");

test("#522 makes status the only current lifecycle after Professor review", () => {
  assert.match(migration, /status = 'approved' and professor_disposition = 'accepted'/);
  assert.match(migration, /status in \('in_progress', 'implemented'\) and professor_disposition is null/);
  assert.match(migration, /set status = 'in_progress',[\s\S]*professor_disposition = null/);
  assert.match(migration, /set status = 'implemented',[\s\S]*professor_disposition = null/);
  assert.match(migration, /where status in \('in_progress', 'implemented'\)[\s\S]*professor_disposition is not null/);
});

test("#522 normalizes legacy rows before installing the stricter lifecycle constraint", () => {
  const drop = migration.indexOf("drop constraint if exists capability_requests_status_disposition_consistency");
  const normalize = migration.indexOf("update public.capability_requests\nset professor_disposition = null");
  const add = migration.indexOf("add constraint capability_requests_status_disposition_consistency");
  assert.ok(drop >= 0 && normalize > drop && add > normalize, "migration must drop old rule, normalize rows, then add new rule");
});

test("#522 preserves accepted provenance without recording lifecycle clearing as a new review", () => {
  assert.match(migration, /new\.professor_disposition is null or new\.professor_disposition = 'pending'/);
  assert.match(migration, /capability_request_professor_reviews/);
  assert.doesNotMatch(migration, /delete from public\.capability_request_professor_reviews/);
});

test("#522 owner-facing UI renders one current state", () => {
  assert.match(inbox, /function requestCurrentState\(request\)/);
  assert.match(inbox, /request\.status === "implemented" \|\| request\.status === "in_progress"/);
  assert.match(inbox, /request\.status === "approved"\) return "accepted"/);
  assert.match(inbox, /status\.textContent = currentState\.replaceAll/);
  assert.doesNotMatch(inbox, /status\.textContent = request\.professor_disposition\.replaceAll/);
});

test("#522 MCP declares request_status authoritative and versions the contract", () => {
  assert.match(mcp, /vlab\.capability-request\/10/);
  assert.match(mcp, /current_request_state_authority: 'request_status'/);
  assert.match(mcp, /professor_disposition_scope: 'review_phase_only'/);
  assert.match(metrics, /MCP_SERVER_VERSION = '3\.17\.0'/);
  assert.match(metrics, /capability_request_interface: 'vlab\.capability-request\/10'/);
});
