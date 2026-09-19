import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260919114500_pretriage_request_reuse.sql", import.meta.url),
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
const inbox = readFileSync(
  new URL("../src/professor-inbox.js", import.meta.url),
  "utf8",
);

test("#361 keeps the existing six-class taxonomy and versions the request interface", () => {
  for (const requestClass of [
    "semantic_capability",
    "authoring_language",
    "runtime_configuration",
    "artifact_workflow",
    "implementation_optimization",
    "security_boundary",
  ]) {
    assert.match(mcp, new RegExp(requestClass));
    assert.match(migration, new RegExp(requestClass));
  }
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/\d+'/);
  assert.match(tools, /capability_request_interface: 'vlab\.capability-request\/\d+'/);
});

test("#361 historical request catalog remains sanitized while #374 discovery exposes candidates", () => {
  assert.match(migration, /create table public\.active_extension_request_catalog/i);
  assert.match(migration, /request_id uuid primary key/i);
  assert.match(migration, /status in \('requested', 'approved', 'in_progress'\)/i);
  assert.match(migration, /grant select on table public\.active_extension_request_catalog to authenticated/i);

  const createCatalog = migration.match(
    /create table public\.active_extension_request_catalog[\s\S]*?\);/,
  )?.[0] ?? "";
  for (const privateField of [
    "requester_id",
    "publication_identifier",
    "publication_title",
    "professor_notes",
    "developer_notes",
    "closure_analysis_id",
    "requirement_keys",
    "draft_artifacts",
  ]) {
    assert.doesNotMatch(createCatalog, new RegExp(privateField));
  }

  const workspace = mcp.match(
    /server\.registerTool\(\s*'read_workspace',[\s\S]*?server\.registerTool\(\s*'manage_collection'/,
  )?.[0] ?? "";
  assert.match(workspace, /\.from\('candidate_capabilities'\)/);
  assert.match(workspace, /\.from\('candidate_contract_deltas'\)/);
  assert.doesNotMatch(workspace, /\.from\('active_extension_request_catalog'\)/);
  assert.doesNotMatch(workspace, /\.from\('capability_requests'\)/);
});

test("#361 makes one request collect evidence from several closure analyses", () => {
  assert.match(migration, /create table public\.capability_request_evidence/i);
  assert.match(migration, /primary key \(request_id, closure_analysis_id\)/i);
  assert.match(migration, /request_id uuid not null references public\.capability_requests\(id\)/i);
  assert.match(migration, /closure_analysis_id uuid not null references public\.capability_closure_analyses\(id\)/i);
  assert.match(migration, /select c\.\* into v_catalog[\s\S]*active_extension_request_catalog/i);
  assert.doesNotMatch(
    migration,
    /One request record belongs to one source publication; create a new request for another paper/i,
  );
});

test("#361 reuse seam survives #374 structured candidate creation", () => {
  assert.match(mcp, /const REUSED_EXTENSION_REQUEST_INPUT = z\.object/);
  assert.match(mcp, /existing_request_id: z\.string\(\)\.uuid\(\)/);
  assert.match(mcp, /const NEW_SEMANTIC_EXTENSION_REQUEST_INPUT = z\.object/);
  assert.match(mcp, /const NEW_CONTRACT_DELTA_REQUEST_INPUT = z\.object/);
  assert.match(mcp, /novelty_statement: z\.string\(\)\.min\(1\)/);
  assert.match(mcp, /new_request_threshold: 'genuinely_absent_from_implemented_and_candidates'/);
  assert.match(mcp, /reuse_when_candidate_covers: true/);
  assert.match(migration, /add column if not exists novelty_statement text/i);
});

test("#361 Professor approval enters design without creating canonical truth", () => {
  const triage = migration.match(
    /create or replace function public\.triage_extension_request[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(triage, /set status = p_decision/i);
  assert.doesNotMatch(triage, /insert into public\.canonical_capabilities/i);
  assert.doesNotMatch(triage, /insert into public\.capability_publication_provenance/i);
  assert.match(migration, /revoke insert on table public\.canonical_capabilities from authenticated/i);
  assert.match(
    migration,
    /revoke insert on table public\.capability_publication_provenance from authenticated/i,
  );
  assert.match(inbox, /Approval accepts the need into the design queue/i);
  assert.doesNotMatch(inbox, /card\.append\(semanticEditor\.editor\)/);
});

test("#361 keeps technical evidence beneath the Professor-facing request identity", () => {
  assert.match(migration, /novelty_statement/i);
  assert.match(migration, /capability_request_evidence/i);
  assert.match(mcp, /scientific\/model definition/i);
  assert.match(mcp, /generalization_needed/i);
});
