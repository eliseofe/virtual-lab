import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918120918_capability_closure_analyses.sql", import.meta.url),
  "utf8",
);
const indexesMigration = readFileSync(
  new URL("../../supabase/migrations/20260918121001_capability_closure_analysis_indexes.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);

test("#310 durable blocked Experiment is not title-only", () => {
  assert.match(migration, /create table if not exists public\.blocked_experiment_drafts/i);
  assert.match(migration, /title text not null/i);
  assert.match(migration, /artifacts jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /source_context text not null default ''/i);
  assert.match(
    migration,
    /jsonb_array_length\(artifacts\) > 0[\s\S]*length\(btrim\(description\)\) > 0[\s\S]*length\(btrim\(source_context\)\) > 0/i,
  );
});

test("#310 closure analyses are appendable versioned snapshots", () => {
  assert.match(migration, /create table if not exists public\.capability_closure_analyses/i);
  assert.match(migration, /analysis_sequence bigint not null/i);
  assert.match(migration, /unique \(blocked_experiment_id, analysis_sequence\)/i);
  assert.match(migration, /contract_version text not null/i);
  assert.match(
    migration,
    /analysis_status in \([\s\S]*'best_effort_complete'[\s\S]*'partial_due_to_ambiguity'[\s\S]*'unblocked'/i,
  );
  assert.match(migration, /identified_requirements jsonb not null/i);
  assert.match(migration, /unresolved_ambiguities jsonb not null/i);
});

test("#310 ambiguity and unblocked states have structural integrity", () => {
  assert.match(
    migration,
    /analysis_status <> 'partial_due_to_ambiguity'[\s\S]*jsonb_array_length\(unresolved_ambiguities\) > 0/i,
  );
  assert.match(
    migration,
    /analysis_status <> 'unblocked'[\s\S]*jsonb_array_length\(identified_requirements\) = 0[\s\S]*jsonb_array_length\(unresolved_ambiguities\) = 0/i,
  );
});

test("#310 capability requests can link to one closure analysis without rewriting legacy rows", () => {
  assert.match(migration, /add column if not exists closure_analysis_id uuid/i);
  assert.match(migration, /capability_requests_closure_analysis_fkey/i);
  assert.match(
    migration,
    /references public\.capability_closure_analyses\(id\)[\s\S]*on delete restrict/i,
  );
  assert.doesNotMatch(migration, /closure_analysis_id uuid not null/i);
});

test("#310 new closure tables are RLS protected and not exposed yet", () => {
  assert.match(migration, /alter table public\.blocked_experiment_drafts enable row level security/i);
  assert.match(migration, /alter table public\.capability_closure_analyses enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.blocked_experiment_drafts[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.capability_closure_analyses[\s\S]*from public, anon, authenticated/i,
  );
  assert.doesNotMatch(migration, /grant .*blocked_experiment_drafts.*authenticated/i);
  assert.doesNotMatch(migration, /grant .*capability_closure_analyses.*authenticated/i);
});

test("#310 analyst foreign key has a covering index", () => {
  assert.match(indexesMigration, /closure_analyses_analyst_idx/i);
  assert.match(indexesMigration, /capability_closure_analyses\\(analyst_id\\)/i);
});

test("#310 leaves the current MCP connector contract unchanged", () => {
  assert.equal(
    (mcp.match(/server\.registerTool\(\s*['"]request_capability['"]/g) ?? []).length,
    1,
  );
  for (const tool of [
    "read_workspace",
    "manage_collection",
    "create_experiment",
    "edit_experiment",
    "delete_experiment",
  ]) {
    const matches = mcp.match(new RegExp(`server\\.registerTool\\(\\s*['"]${tool}['"]`, "g")) ?? [];
    assert.equal(matches.length, 1, `${tool} must remain one shared implementation`);
  }
});
