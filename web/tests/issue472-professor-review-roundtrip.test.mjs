import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MCP_TOOL_NAMES } from "../../supabase/functions/experiment-mcp/tool-surface.ts";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260921185000_professor_disposition_roundtrip.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const linked = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/closure-linked-requests.js", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../product-surface.json", import.meta.url), "utf8"));
const smoke = readFileSync(new URL("../scripts/professor-review-smoke.mjs", import.meta.url), "utf8");

test("#472 Professor decision surface remains extensible plus pending as system state", () => {
  for (const pair of [
    '["Accept", "accepted", true]',
    '["Reject", "rejected", false]',
    '["Revise", "revise", false]',
    '["Defer", "deferred", false]',
    '["Future", "future", false]',
    '["Already supported", "already_supported", false]',
  ]) assert.ok(inbox.includes(pair), pair);
  assert.match(inbox, /requestCurrentState\(request\) === "pending"/);
  assert.match(inbox, /Professor guidance/);
  assert.match(inbox, /Revise requires Professor guidance/);
  assert.doesNotMatch(inbox, /approve\.textContent = "Approve"/);
  assert.doesNotMatch(inbox, /decline\.textContent = "Decline"/);
  assert.match(inbox, /vlab\.professor-review\/2/);
  assert.match(inbox, /vlabProfessorReviewDecisions/);
  assert.match(inbox, /vlabProfessorReviseGuidanceRequired/);
});

test("#472 Professor decision is distinct from implementation lifecycle", () => {
  assert.match(migration, /decision must be accepted, rejected, revise, deferred, or future/i);
  assert.ok(migration.includes("when 'accepted' then 'approved'"));
  assert.ok(migration.includes("when 'rejected' then 'declined'"));
  assert.ok(migration.includes("else 'requested'"));
  assert.match(migration, /Revise requires Professor guidance/i);
  assert.doesNotMatch(migration, /priority/i);
});

test("#472 requester revision preserves one request and candidate identity with history", () => {
  assert.match(migration, /Only the original requester may submit a candidate revision/i);
  assert.ok(migration.includes("professor_disposition <> 'revise'"));
  assert.match(migration, /generalization_revision = v_revision/i);
  assert.ok(migration.includes("'requester_revision'"));
  assert.match(migration, /update public\.candidate_capabilities[\s\S]*where request_id = p_request_id/i);
  assert.match(migration, /update public\.candidate_contract_deltas[\s\S]*where request_id = p_request_id/i);
  assert.ok(migration.includes("professor_disposition = 'pending'"));
  assert.match(migration, /professor_guidance = null/i);
  const helper = migration.match(/create or replace function private\.revise_candidate_extension_for_requester[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.doesNotMatch(helper, /insert into public\.capability_requests|insert into public\.candidate_capabilities|insert into public\.candidate_contract_deltas/i);
});

test("#472 revision wrappers keep closure submission atomic and existing tools", () => {
  assert.match(migration, /submit_structured_extension_closure_v8/i);
  assert.match(migration, /revalidate_structured_extension_closure_v8/i);
  assert.match(migration, /private\.revise_candidate_extension_for_requester[\s\S]*public\.submit_structured_extension_closure\(/i);
  assert.match(mcp, /submit_structured_extension_closure_v8/);
  assert.match(mcp, /revalidate_structured_extension_closure_v8/);
  assert.deepEqual([...MCP_TOOL_NAMES], [
    "read_workspace",
    "manage_collection",
    "create_experiment",
    "edit_experiment",
    "delete_experiment",
    "author_metrics_results",
    "request_capability",
    "resume_capability_closure",
    "revalidate_capability_closure",
  ]);
});

test("#472 MCP exposes sanitized Professor disposition and guidance with revision semantics", () => {
  assert.match(mcp, /PROFESSOR_DISPOSITION_BEHAVIOR/);
  for (const disposition of ["pending", "accepted", "rejected", "revise", "deferred", "future", "already_supported"]) {
    assert.ok(mcp.includes(disposition + ": '"), disposition);
  }
  assert.match(mcp, /revised_candidate_capability/);
  assert.match(mcp, /revised_candidate_contract_delta/);
  assert.match(mcp, /revision_response/);
  assert.match(mcp, /professor_disposition, professor_guidance/);
  assert.ok(linked.includes("'professor_disposition'"));
  assert.ok(linked.includes("'professor_guidance'"));
  assert.equal(linked.includes("'requester_id'"), false);
  assert.equal(linked.includes("'professor_notes'"), false);
  assert.equal(linked.includes("'developer_notes'"), false);
});

test("#472 duplicate safety survives every disposition", () => {
  assert.match(migration, /Revised semantic key already belongs to another candidate/i);
  assert.match(migration, /Revised contract-delta key already belongs to another candidate/i);
  assert.match(migration, /Revised semantic key already has canonical capability identity/i);
  assert.ok(mcp.includes("new_request_threshold: 'genuinely_absent_from_implemented_and_candidates'"));
  assert.match(mcp, /reuse_when_candidate_covers: true/);
});

test("#472 production manifest includes deterministic live-contract browser smoke for Professor review", () => {
  const surface = manifest.surfaces.find((item) => item.id === "professor-review");
  assert.ok(surface);
  assert.equal(surface.state, "active");
  assert.equal(surface.smoke[0].script, "web/scripts/professor-review-smoke.mjs");
  assert.match(smoke, /dataset\.vlabProfessorReviewContract/);
  assert.match(smoke, /accepted,revise,deferred,future,rejected,already_supported/);
  assert.match(smoke, /vlabProfessorReviseGuidanceRequired/);
  assert.match(smoke, /waitProfessorReviewContract/);
  assert.match(smoke, /attempt < 250/);
  assert.doesNotMatch(smoke, /performance\.getEntriesByType\("resource"\)/);
});
