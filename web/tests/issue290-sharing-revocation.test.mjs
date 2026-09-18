import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918081000_sharing_revocation_boundaries.sql", import.meta.url),
  "utf8",
);
const registry = readFileSync(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8");
const status = readFileSync(new URL("../../CURRENT_STATUS.md", import.meta.url), "utf8");
const roadmap = readFileSync(new URL("../../ROADMAP.md", import.meta.url), "utf8");
const report = JSON.parse(readFileSync(new URL("../../.github/terminal-report.json", import.meta.url), "utf8"));

test("#290 owner can list and revoke ordinary shares without gaining Experiment mutation rights", () => {
  assert.match(migration, /grant select, insert, delete on table public\.experiment_shares to authenticated/i);
  assert.match(migration, /create policy "experiment_shares_select_accessible"/i);
  assert.match(migration, /current_user_owns_experiment\(experiment_shares\.experiment_id\)/i);
  assert.match(migration, /create policy "experiment_shares_delete_owned"/i);
  assert.doesNotMatch(migration, /grant update on table public\.experiment_shares/i);
  assert.doesNotMatch(migration, /create policy[^\n]*experiments[^\n]*(update|delete)/i);
});

test("#290 recipient directory supports student collaboration without redundant student-to-Professor sharing", () => {
  assert.match(migration, /function private\.list_experiment_share_recipients/i);
  assert.match(migration, /caller_role = 'student'/i);
  assert.match(migration, /p\.role = 'student'/i);
  assert.match(migration, /caller_role = 'professor'/i);
  assert.match(migration, /p\.role in \('student', 'professor'\)/i);
  assert.match(migration, /function private\.current_user_can_share_with/i);
  assert.match(migration, /if caller_role = 'student'[\s\S]*return recipient_role = 'student'/i);
  assert.match(migration, /function public\.list_experiment_share_recipients/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /select \* from private\.list_experiment_share_recipients\(\)/i);
});

test("#290 browser manages outgoing grants and uses only the eligible recipient RPC", () => {
  assert.match(registry, /let outgoingShares = \[\]/);
  assert.match(registry, /supabase\.rpc\("list_experiment_share_recipients"\)/);
  assert.doesNotMatch(registry, /\.from\("profiles"\)[\s\S]{0,180}\.neq\("id", user\.id\)/);
  assert.match(registry, /Shared read-only with/);
  assert.match(registry, /revoke\.textContent = "Revoke"/);
  assert.match(registry, /async function revokeCurrentExperimentShare\(recipientId\)/);
  assert.match(registry, /\.from\("experiment_shares"\)[\s\S]*\.delete\(\{ count: "exact" \}\)/);
  assert.match(registry, /await loadOutgoingShares\(\)/);
});

test("#290 preserves copy and supervision as independent mechanisms", () => {
  assert.match(registry, /Copy to my Experiments/);
  assert.match(registry, /vlab:open-supervised-experiment/);
  assert.match(registry, /access: "supervised"/);
  assert.match(migration, /experiments_select_explicit_share|experiment_shares/);
  assert.doesNotMatch(migration, /drop policy if exists "experiments_select_student_for_professor"/i);
});

test("#290 closes the currently approved collaboration epic scope", () => {
  assert.match(status, /#287–#290/);
  assert.doesNotMatch(roadmap, /\*\*Started and unfinished:\*\* #45/);
  assert.equal(report.schema, "vlab.terminal-report/2");
  assert.equal(report.next.kind, "scope_complete");
  assert.equal(report.next.disposition, "closed");
  assert.equal(report.next.lab_url, "https://eliseofe.github.io/virtual-lab/");
  assert.equal(report.close_issue, 290);
});
