import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REQUEST_CLASS_LABELS } from "../src/professor/requests.js";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918190000_extension_request_identity_workflow.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const tools = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

const classes = [
  "semantic_capability",
  "authoring_language",
  "runtime_configuration",
  "artifact_workflow",
  "implementation_optimization",
  "security_boundary",
];

test("#346 exposes the owner-approved six-class request taxonomy without automatic rejection", () => {
  for (const value of classes) {
    assert.equal(migration.includes(value), true, "migration missing request class " + value);
    assert.equal(mcp.includes(value), true, "MCP missing request class " + value);
    assert.equal(Object.hasOwn(REQUEST_CLASS_LABELS, value), true, "Professor inbox missing request class " + value);
  }
  assert.match(mcp, /automatic_rejection_classes: \[\]/);
  assert.doesNotMatch(migration, /request_class in .*declined/i);
});

test("#346 keeps requests separate from canonical capability identity", () => {
  assert.match(migration, /canonical_capability_id uuid[\s\S]*references public\.canonical_capabilities\(id\)/i);
  assert.match(migration, /request_class = 'semantic_capability'/);
  assert.match(migration, /Only semantic-capability requests may reference canonical capability identity/i);
  assert.match(migration, /implementation_state,[\s\S]*'not_implemented'/i);
  assert.match(migration, /triage_extension_request/i);
  assert.match(migration, /Approved semantic-capability requests must be bound to canonical capability identity/i);
});

test("#346 stable request identity remains the reconciliation seam after #361", () => {
  assert.match(mcp, /const REUSED_EXTENSION_REQUEST_INPUT = z\.object/);
  assert.match(mcp, /existing_request_id: z\.string\(\)\.uuid\(\)/);
  assert.match(migration, /v_existing_request_id/);
  assert.match(migration, /r\.id = v_existing_request_id/);
  assert.match(migration, /canonical_capability_id is distinct from v_canonical_id/i);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.submit_extension_closure[\s\S]*?revoke all on function public\.submit_extension_closure/i)?.[0] ?? "",
    /lower\(btrim\(r\.capability_domain\)\).*lower\(btrim\(v_request ->> 'capability_domain'\)\)/i,
  );
});

test("#346 stores publication identity separately and makes canonical provenance many-to-many/duplicate-safe", () => {
  assert.match(migration, /publication_identifier text/);
  assert.match(migration, /publication_title text/);
  assert.match(mcp, /publication: z\.object\(/);
  assert.match(migration, /insert into public\.capability_publication_provenance/);
  assert.match(migration, /on conflict \(capability_id, publication_identifier\) do nothing/i);
  assert.match(migration, /One request record belongs to one source publication/i);
});

test("#346 typed request identity remains Professor-triaged after later decision-only UI cleanup", () => {
  assert.match(inbox, /triage_extension_request/);
  // #551: behaviour covered by professor-requests.test.mjs; this checks the inbox uses the rule.
  assert.match(inbox, /requestClass\.textContent = requestClassLabel\(request\)/);
  assert.match(inbox, /for \(const \[label, decision, primary\] of PROFESSOR_REVIEW_DECISIONS\)/);
  assert.doesNotMatch(inbox, /Create new canonical capability|Bind existing:|list_canonical_capability_registry/);
  assert.match(migration, /Only a Professor may triage extension requests/i);
});

test("#346 preserves Student submission and Professor-only triage", () => {
  assert.match(migration, /v_role not in \('student', 'professor'\)/i);
  assert.match(mcp, /Student\/Professor research-AI action/);
  assert.match(migration, /v_role <> 'professor'[\s\S]*Only a Professor may triage extension requests/i);
  assert.match(inbox, /profile\?\.role === "professor"/);
});

test("#346 anchors semantic development to canonical capability identity and permits one issue to satisfy many requests", () => {
  assert.match(migration, /claim_canonical_capability_for_development/i);
  assert.match(migration, /where canonical_capability_id = p_capability_id[\s\S]*status = 'approved'/i);
  assert.match(migration, /set status = 'in_progress'/i);
  assert.match(migration, /complete_canonical_capability_development/i);
  assert.match(migration, /where canonical_capability_id = p_capability_id[\s\S]*status in \('approved', 'in_progress'\)/i);
  assert.match(migration, /revoke execute on function private\.claim_canonical_capability_for_development[\s\S]*authenticated, service_role/i);
});

test("#346 request history is not part of the canonical registry read seam", () => {
  const registry = readFileSync(
    new URL("../../supabase/migrations/20260918181000_canonical_capability_registry_v1.sql", import.meta.url),
    "utf8",
  );
  const rpc = registry.match(/create or replace function public\.list_canonical_capability_registry\(\)[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.doesNotMatch(rpc, /capability_requests|closure_analysis|professor_notes|developer_notes|draft_/i);
});

test("#346 preserves whole-Experiment ambiguity and revalidation invariants", () => {
  assert.match(migration, /Every ambiguity must reference an identified ambiguous requirement/i);
  assert.match(migration, /identified_requirements keys must be unique/i);
  assert.match(migration, /resolved_requirement_keys/);
  assert.match(migration, /remaining_requirement_keys/);
  assert.match(migration, /new_requirement_keys/);
  assert.match(migration, /set lifecycle = case when p_analysis_status = 'unblocked' then 'unblocked' else 'blocked' end/i);
});

test("#346 bumps the request/MCP interface without changing authoring language version", () => {
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/\d+'/);
  assert.match(tools, /MCP_SERVER_VERSION = '3\.\d+\.\d+'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '\d+'/);
  assert.match(tools, /contract_version: 'vlab\.authoring\/0\.13'/);
});
