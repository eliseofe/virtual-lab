import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918063500_experiment_copy_provenance.sql", import.meta.url),
  "utf8",
);
const hardeningMigration = readFileSync(
  new URL("../../supabase/migrations/20260918070000_harden_experiment_copy_rpc.sql", import.meta.url),
  "utf8",
);
const retainedRevisionMigration = readFileSync(
  new URL("../../supabase/migrations/20260920114510_copy_retained_experiment_revision.sql", import.meta.url),
  "utf8",
);
const registry = readFileSync(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/experiment-management.js", import.meta.url), "utf8");

test("#288 preserves immutable copy provenance without coupling source deletion", () => {
  assert.match(migration, /create table if not exists public\.experiment_copy_origins/i);
  assert.match(migration, /experiment_id uuid primary key references public\.experiments\(id\) on delete cascade/i);
  assert.match(migration, /source_experiment_id uuid not null/i);
  assert.doesNotMatch(migration, /source_experiment_id uuid[^\n]*references public\.experiments/i);
  assert.match(migration, /source_revision bigint not null check \(source_revision >= 1\)/i);
  assert.match(migration, /source_owner_id uuid not null/i);
  assert.match(migration, /source_title text not null/i);
  assert.match(migration, /grant select on table public\.experiment_copy_origins to authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^\n]*experiment_copy_origins/i);
});

test("#288 copy RPC authorizes readable non-owned sources and freezes the exact source revision", () => {
  assert.match(migration, /function public\.copy_experiment_to_workspace/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /source_row\.owner_id = caller/i);
  assert.match(migration, /source_row\.visibility = 'public'/i);
  assert.match(migration, /private\.current_user_is_professor\(\)/i);
  assert.match(migration, /p\.role = 'student'/i);
  assert.match(migration, /source_row\.revision <> p_expected_revision/i);
  assert.match(migration, /source_row\.schema_version[\s\S]*source_row\.interface_version/i);
  assert.match(migration, /source_row\.config_source[\s\S]*source_row\.initializer_source[\s\S]*source_row\.controller_source[\s\S]*source_row\.artifacts/i);
  assert.match(migration, /insert into public\.experiment_copy_origins/i);
  assert.match(migration, /source_row\.id[\s\S]*source_row\.owner_id[\s\S]*source_row\.revision[\s\S]*source_row\.title/i);
  assert.doesNotMatch(migration, /update public\.experiments/i);
  assert.match(migration, /revoke all on function public\.copy_experiment_to_workspace/i);
  assert.match(migration, /grant execute on function public\.copy_experiment_to_workspace[^\n]*\n\s*to authenticated/i);
});

test("#288 supervised copy uses the saved remote revision rather than local unsaved edits", () => {
  assert.match(registry, /ui\.saveAsNew\.hidden = !user/);
  assert.match(registry, /copy one to create an independent editable Experiment|Copy to my Experiments creates an independent private Experiment/);
  assert.match(registry, /async function copyCurrentReadableExperiment\(title, collectionId\)/);
  assert.match(registry, /const sourceId = currentRemote\.id/);
  assert.match(registry, /const sourceSnapshot = currentRevisionSnapshot\(\)/);
  assert.match(registry, /const sourceRevision = sourceSnapshot\?\.revision \?\? currentRemote\.revision/);
  assert.match(registry, /supabase\.rpc\("copy_experiment_to_workspace"/);
  assert.match(registry, /p_source_experiment_id: sourceId/);
  assert.match(registry, /p_expected_revision: sourceRevision/);
  assert.match(registry, /p_collection_id: collectionId/);
  assert.match(registry, /data = await copyCurrentReadableExperiment\(title, collectionId\)/);
  assert.match(registry, /const artifacts = registryArtifactsForSave\(\);/);
  assert.doesNotMatch(registry, /allowBuiltInCompatibility/);
});

test("#399 historical read-only copy uses the exact retained revision being viewed", () => {
  assert.match(retainedRevisionMigration, /source_revision_row public\.experiment_revisions%rowtype/);
  assert.match(retainedRevisionMigration, /r\.revision = p_expected_revision/);
  assert.match(retainedRevisionMigration, /source_revision_row\.artifacts/);
  assert.match(retainedRevisionMigration, /source_revision_row\.revision/);
  assert.match(retainedRevisionMigration, /source_revision_row\.title/);
  assert.doesNotMatch(retainedRevisionMigration, /source_row\.revision <> p_expected_revision/);
});

test("#288 presents copying as a distinct action while preserving ordinary Save as new", () => {
  assert.match(management, /locationText === "Student experiment" \|\| locationText === "Shared with me"/);
  assert.match(management, /setText\(management\.saveAsNew, "Copy to my Experiments…"\)/);
  assert.match(management, /setText\(management\.saveAsNew, "Save as new…"\)/);
  assert.match(registry, /ui\.createNew\.textContent = copyingReadable \? "Copy to my Experiments" : "Create private copy"/);
});


test("#288 final RPC boundary keeps privileged logic private", () => {
  assert.match(hardeningMigration, /function private\.copy_experiment_to_workspace_impl/i);
  assert.match(hardeningMigration, /security definer/i);
  assert.match(hardeningMigration, /function public\.copy_experiment_to_workspace/i);
  assert.match(hardeningMigration, /security invoker/i);
  assert.match(hardeningMigration, /select private\.copy_experiment_to_workspace_impl/i);
  assert.match(hardeningMigration, /revoke all on function private\.copy_experiment_to_workspace_impl/i);
  assert.match(hardeningMigration, /grant execute on function private\.copy_experiment_to_workspace_impl[^\n]*\n\s*to authenticated/i);
  assert.match(hardeningMigration, /revoke all on function public\.copy_experiment_to_workspace/i);
  assert.match(hardeningMigration, /grant execute on function public\.copy_experiment_to_workspace[^\n]*\n\s*to authenticated/i);
});
