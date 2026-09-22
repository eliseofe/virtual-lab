import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260916170000_showcase_publication.sql", import.meta.url),
  "utf8",
);
const unifiedMigration = readFileSync(
  new URL("../../supabase/migrations/20260916221000_showcase_unified_sources.sql", import.meta.url),
  "utf8",
);
const showcase = readFileSync(new URL("../src/showcase.js", import.meta.url), "utf8");
const library = readFileSync(new URL("../src/experiment-library.js", import.meta.url), "utf8");
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
  assert.match(migration, /removed_at = now\(\), removed_by = caller/i);
  assert.match(unifiedMigration, /remove_showcase_entry\(p_showcase_id uuid\)/i);
  assert.match(unifiedMigration, /p\.role = 'professor'/i);
  assert.match(unifiedMigration, /where s\.id = p_showcase_id[\s\S]*s\.removed_at is null/i);
  assert.match(migration, /grant execute on function public\.promote_experiment_to_showcase\(uuid, bigint\) to authenticated/i);
  assert.match(unifiedMigration, /grant execute on function public\.remove_showcase_entry\(uuid\) to authenticated/i);
});

test("#149 public Showcase discovery exposes only curated active snapshots", () => {
  assert.match(unifiedMigration, /function public\.list_showcase_experiments\(\)/i);
  assert.match(unifiedMigration, /p\.snapshot_kind = 'curated'/i);
  assert.match(unifiedMigration, /p\.artifacts is not null/i);
  assert.match(unifiedMigration, /grant execute on function public\.list_showcase_experiments\(\) to anon, authenticated/i);
});

test("#149 browser exposes public Showcase discovery plus reversible Professor curation", () => {
  assert.match(shell, /import "\.\/experiment-library\.js"/);
  assert.match(shell, /import "\.\/showcase\.js"/);
  assert.match(library, /supabase\.rpc\("list_showcase_experiments"\)/);
  assert.match(library, /"All Showcase"/);
  assert.match(library, /"Uncategorized"/);
  assert.match(showcase, /launcher\.textContent = "Manage Showcase"/);
  assert.match(showcase, /profile\?\.role !== "professor"/);
  assert.match(showcase, /supabase\.rpc\("promote_experiment_to_showcase"/);
  assert.match(showcase, /supabase\.rpc\("remove_showcase_entry"/);
  assert.match(showcase, /p_showcase_id: entry\.showcase_id/);
  assert.match(showcase, /Save private copy/);
  assert.match(showcase, /Showcase · Read-only/);
  assert.match(showcase, /remove\.textContent = "Remove"/);
  assert.match(showcase, /remove\.addEventListener\("click", \(\) => run\(\(\) => removeEntry\(entry, remove\)\)\)/);
});
