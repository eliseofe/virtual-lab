import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260916170000_showcase_publication.sql", import.meta.url),
  "utf8",
);
const showcase = readFileSync(new URL("../src/showcase.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/workspace-shell.js", import.meta.url), "utf8");

test("#149 Showcase is exact-revision publication, not a collection move", () => {
  assert.match(migration, /create table if not exists public\.showcase_entries/i);
  assert.match(migration, /snapshot_id uuid not null unique references public\.preserved_experiment_snapshots/i);
  assert.match(migration, /source_revision bigint not null/i);
  assert.match(migration, /snapshot_kind[\s\S]*'curated'/i);
  assert.match(migration, /source_row\.revision <> p_expected_revision/i);
  assert.match(migration, /source_row\.artifacts/i);
  assert.doesNotMatch(migration, /update public\.experiments[\s\S]*visibility/i);
  assert.doesNotMatch(migration, /collection_id\s*=/i);
});

test("#149 promotion and removal are Professor-gated and reversible", () => {
  assert.match(migration, /p\.role = 'professor'/i);
  assert.match(migration, /promote_experiment_to_showcase/i);
  assert.match(migration, /remove_experiment_from_showcase/i);
  assert.match(migration, /removed_at = now\(\), removed_by = caller/i);
  assert.match(migration, /where s\.removed_at is null/i);
  assert.match(migration, /grant execute on function public\.promote_experiment_to_showcase\(uuid, bigint\) to authenticated/i);
  assert.match(migration, /grant execute on function public\.remove_experiment_from_showcase\(uuid\) to authenticated/i);
});

test("#149 public Showcase discovery exposes only curated active snapshots", () => {
  assert.match(migration, /create or replace function public\.list_showcase_experiments\(\)/i);
  assert.match(migration, /p\.snapshot_kind = 'curated'/i);
  assert.match(migration, /p\.artifacts is not null/i);
  assert.match(migration, /grant execute on function public\.list_showcase_experiments\(\) to anon, authenticated/i);
});

test("#149 browser exposes public Showcase plus reversible Professor curation", () => {
  assert.match(shell, /import "\.\/showcase\.js"/);
  assert.match(showcase, /launcher\.textContent = "Showcase"/);
  assert.match(showcase, /supabase\.rpc\("list_showcase_experiments"\)/);
  assert.match(showcase, /supabase\.rpc\("promote_experiment_to_showcase"/);
  assert.match(showcase, /supabase\.rpc\("remove_experiment_from_showcase"/);
  assert.match(showcase, /profile\?\.role === "professor"/);
  assert.match(showcase, /Save private copy/);
  assert.match(showcase, /Showcase · Read-only/);
  assert.match(showcase, /Removal is reversible/);
});
