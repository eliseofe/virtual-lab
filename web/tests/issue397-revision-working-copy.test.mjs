import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

const migration = await readFile(
  path.join(repo, "supabase/migrations/20260920094310_experiment_revision_working_copy.sql"),
  "utf8",
);
const indexMigration = await readFile(
  path.join(repo, "supabase/migrations/20260920094339_experiment_revision_history_fk_indexes.sql"),
  "utf8",
);
const registry = await readFile(path.join(repo, "web/src/registry-ui-v3.js"), "utf8");

test("#397 retains numbered Experiment snapshots without fabricating overwritten history", () => {
  assert.match(migration, /create table public\.experiment_revisions/);
  assert.match(migration, /primary key \(experiment_id, revision\)/);
  assert.match(migration, /insert into public\.experiment_revisions/);
  assert.match(migration, /from public\.experiments e/);
  assert.match(migration, /base_revision bigint/);
  assert.match(migration, /create trigger record_experiment_revision/);
  assert.match(migration, /if new\.revision = old\.revision then/);
});

test("#397 stores one owner-only unnumbered Working copy against a retained base", () => {
  assert.match(migration, /create table public\.experiment_working_copies/);
  assert.match(migration, /experiment_id uuid primary key/);
  assert.match(migration, /foreign key \(experiment_id, base_revision\)/);
  assert.match(migration, /experiment_working_copies_(select|insert|update|delete)_own/);
  assert.match(migration, /alter table public\.experiment_working_copies enable row level security/);
  assert.match(indexMigration, /experiment_working_copies_base_revision_idx/);
});

test("#397 human crystallization records the Working-copy base while allocating chronological head revision", () => {
  assert.match(migration, /crystallize_experiment_working_copy/);
  assert.match(migration, /set_config\('vlab\.revision_base', working\.base_revision::text, true\)/);
  assert.match(migration, /set_config\('vlab\.force_revision', 'true', true\)/);
  assert.match(migration, /new\.revision := old\.revision \+ 1/);
  assert.match(migration, /delete from public\.experiment_working_copies/);
  assert.doesNotMatch(migration, /merge conflict|automatic merge|rebase/i);
});

test("#397 browser autosaves at interaction boundaries rather than on every keystroke", () => {
  assert.match(registry, /async function persistWorkingCopy\(\)/);
  // #554: queries moved to registry/data.js, covered by registry-data.test.mjs; this checks the workspace uses them.
  assert.match(registry, /registryData\.upsertWorkingCopy\(supabase, \{/);
  assert.match(registry, /base_revision: baseRevision/);
  assert.match(registry, /addEventListener\("blur", autosaveAtInteractionBoundary\)/);
  assert.match(registry, /document\.addEventListener\("pointerdown"/);
  assert.match(registry, /addEventListener\("input", updateCurrentUi\)/);
  assert.doesNotMatch(registry, /addEventListener\("input",\s*autosaveAtInteractionBoundary/);
});

test("#397 Save Revision crystallizes only after Working-copy autosave", () => {
  assert.match(registry, /save\.textContent = "Save Revision"/);
  assert.match(registry, /async function saveCurrentExperiment\(\)/);
  assert.match(registry, /await queueWorkingCopyAutosave\(\)/);
  // #554: queries moved to registry/data.js, covered by registry-data.test.mjs; this checks the workspace uses them.
  assert.match(registry, /registryData\.crystallizeWorkingCopy\(supabase, currentRemote\.id\)/);
  assert.match(registry, /currentWorkingCopy = null/);
  assert.doesNotMatch(registry, /conflictRevision/);
});

test("#397 durable Working copy coexists with a newly arrived AI head", () => {
  assert.match(registry, /if \(fresh\.revision > previousRemote\.revision\)/);
  assert.match(registry, /currentRemote = fresh/);
  assert.match(registry, /await loadRevisionHistory\(\)/);
  // #554: behaviour covered by registry-workspace-status.test.mjs; this checks the workspace applies the rule.
  assert.match(registry, /setArtifactEditorsLocked\(status\.lockEditors\)/);
  assert.match(registry, /currentUi\.revisionNotice\.hidden = status\.notice\.hidden/);
  // #554: behaviour covered by registry-labels.test.mjs; this checks the registry uses the rule.
  assert.match(registry, /setMessage\(newRevisionMessage\(fresh\.revision, actor\), "success"\)/);
});

test("#397 warns on navigation loss only for edits not yet durably autosaved", () => {
  assert.match(registry, /function hasUnpersistedRemoteEdits\(\)/);
  assert.match(registry, /async function confirmDiscardIfNeeded\(\)/);
  assert.match(registry, /await queueWorkingCopyAutosave\(\)/);
  assert.match(registry, /window\.addEventListener\("beforeunload"/);
  assert.match(registry, /if \(!hasUnpersistedRemoteEdits\(\)\) return/);
});
