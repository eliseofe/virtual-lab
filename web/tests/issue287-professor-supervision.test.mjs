import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918062000_professor_supervision_read_access.sql", import.meta.url),
  "utf8",
);
const registry = readFileSync(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8");
const runtimeSpeed = readFileSync(new URL("../src/runtime-speed.js", import.meta.url), "utf8");

test("#287 grants Professor read access without broadening write policies", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /current_user_is_professor/i);
  assert.match(migration, /create policy "profiles_select_students_for_professor"/i);
  assert.match(migration, /role = 'student'[\s\S]*current_user_is_professor/i);
  assert.match(migration, /create policy "experiments_select_student_for_professor"/i);
  assert.match(migration, /p\.id = experiments\.owner_id[\s\S]*p\.role = 'student'/i);
  assert.doesNotMatch(migration, /for (insert|update|delete)/i);
});

test("#287 keeps supervised student Experiments outside My Experiments and read-only", () => {
  assert.match(registry, /select\("id,display_name,role"\)/);
  assert.match(registry, /Supervised research · Read-only/);
  // #554: the retired flat browser was removed; the unified Library shows this, covered by library-browse.test.mjs.
  assert.doesNotMatch(registry, /function renderBrowser|const browser = null/);
  // #554: behaviour covered by registry-workspace-status.test.mjs; this checks the workspace applies the rule.
  assert.match(registry, /ui\.save\.hidden = status\.saveHidden/);
  assert.match(registry, /vlab:open-supervised-experiment/);
  assert.match(registry, /Experiment not found in your library or not available to this account/);
  assert.doesNotMatch(registry, /\.eq\("id", id\)\s*\.eq\("owner_id", user\.id\)/);
});

test("#287 Professor supervision remains read-only and is now integrated into Experiment discovery", () => {
  assert.match(registry, /async function loadSupervisedExperimentList\(\)/);
  assert.match(registry, /\.eq\("role", "student"\)/);
  assert.match(registry, /Supervised research/);
  assert.match(registry, /access: "supervised"/);
  // #554: behaviour covered by registry-workspace-status.test.mjs; this checks the workspace applies the rule.
  assert.match(registry, /ui\.save\.hidden = status\.saveHidden/);
  assert.doesNotMatch(registry, /\.from\("experiments"\)[\s\S]{0,400}\.(insert|update|delete)\([^\n]*supervised/i);
});

test("#287 Professor capability inbox remains separate from Experiment supervision", () => {
  assert.match(runtimeSpeed, /import\("\.\/professor-inbox\.js"\)/);
  assert.doesNotMatch(runtimeSpeed, /professor-supervision/);
});
