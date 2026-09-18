import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918072500_explicit_experiment_sharing.sql", import.meta.url),
  "utf8",
);
const recursionRepair = readFileSync(
  new URL("../../supabase/migrations/20260918074800_fix_experiment_share_policy_recursion.sql", import.meta.url),
  "utf8",
);
const performanceMigration = readFileSync(
  new URL("../../supabase/migrations/20260918075200_index_experiment_shares_shared_by.sql", import.meta.url),
  "utf8",
);
const registry = readFileSync(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/experiment-management.js", import.meta.url), "utf8");

test("#289 share storage is explicit, read-only and RLS-protected", () => {
  assert.match(migration, /create table if not exists public\.experiment_shares/i);
  assert.match(migration, /primary key \(experiment_id, recipient_id\)/i);
  assert.match(migration, /alter table public\.experiment_shares enable row level security/i);
  assert.match(migration, /grant select, insert on table public\.experiment_shares to authenticated/i);
  assert.doesNotMatch(migration, /grant (update|delete)[^\n]*experiment_shares/i);
  assert.match(migration, /create policy "experiment_shares_select_received"/i);
  assert.match(migration, /recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /create policy "experiment_shares_insert_owned"/i);
  assert.match(migration, /e\.owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /p\.id = experiment_shares\.recipient_id/i);
});

test("#289 share grants add read access without broadening Experiment mutation", () => {
  assert.match(migration, /create policy "experiments_select_explicit_share"/i);
  assert.match(migration, /s\.experiment_id = experiments\.id/i);
  assert.match(migration, /s\.recipient_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /create policy[^\n]*experiments[^\n]*(update|delete)/i);
});

test("#289 explicitly shared Experiments can use the existing independent-copy path", () => {
  assert.match(migration, /function private\.copy_experiment_to_workspace_impl/i);
  assert.match(migration, /public\.experiment_shares s/i);
  assert.match(migration, /s\.experiment_id = source_row\.id/i);
  assert.match(migration, /s\.recipient_id = caller/i);
});

test("#289 UI separates shared sources from My Experiments and keeps them read-only", () => {
  assert.match(registry, /let sharedExperiments = \[\]/);
  assert.match(registry, /filterButton\("Shared with me", "shared"\)/);
  assert.match(registry, /experimentGroup\("Shared with me", filteredShared, \{ access: "shared" \}\)/);
  assert.match(registry, /Shared with you · Read-only/);
  assert.match(registry, /currentRemoteAccess === "shared"/);
  assert.match(registry, /ui\.save\.hidden = !owned/);
  assert.match(management, /locationText === "Shared with me"/);
});

test("#289 owner share-grant behavior remains present after successor work", () => {
  assert.match(registry, /Share read-only…/);
  assert.match(registry, /\.from\("experiment_shares"\)[\s\S]*\.insert\(/);
  assert.match(registry, /shared_by: user\.id/);
  assert.doesNotMatch(migration, /grant (update|delete)[^\n]*experiment_shares/i);
});


test("#289 final share-insert authorization avoids RLS recursion", () => {
  assert.match(recursionRepair, /function private\.current_user_owns_active_experiment/i);
  assert.match(recursionRepair, /security definer/i);
  assert.match(recursionRepair, /set search_path = ''/i);
  assert.match(recursionRepair, /e\.owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(recursionRepair, /drop policy if exists "experiment_shares_insert_owned"/i);
  assert.match(recursionRepair, /select private\.current_user_owns_active_experiment\(experiment_shares\.experiment_id\)/i);
  assert.doesNotMatch(
    recursionRepair,
    /create policy "experiment_shares_insert_owned"[\s\S]*from public\.experiments/i,
  );
});


test("#289 indexes the share-owner foreign key used by the collaboration lifecycle", () => {
  assert.match(performanceMigration, /create index if not exists experiment_shares_shared_by_idx/i);
  assert.match(performanceMigration, /on public\.experiment_shares\(shared_by\)/i);
});
