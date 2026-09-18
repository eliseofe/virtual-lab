import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918062000_professor_supervision_read_access.sql", import.meta.url),
  "utf8",
);
const registry = readFileSync(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8");
const supervision = readFileSync(new URL("../src/professor-supervision.js", import.meta.url), "utf8");
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
  assert.match(registry, /select\("id, display_name, role"\)/);
  assert.match(registry, /Student experiment · Read-only/);
  assert.match(registry, /Professor supervision · Read-only/);
  assert.match(registry, /ui\.saveAsNew\.hidden = !user \|\| Boolean\(currentRemote && !owned\)/);
  assert.match(registry, /vlab:open-supervised-experiment/);
  assert.match(registry, /Experiment not found or not available to this account/);
  assert.doesNotMatch(registry, /\.eq\("id", id\)\s*\.eq\("owner_id", user\.id\)/);
});

test("#287 Professor surface lists student Experiments and performs no Experiment writes", () => {
  assert.match(supervision, /\.eq\("role", "student"\)/);
  assert.match(supervision, /\.from\("experiments"\)/);
  assert.match(supervision, /\.eq\("lifecycle", "active"\)/);
  assert.match(supervision, /Student Experiments are read-only/);
  assert.match(supervision, /vlab:open-supervised-experiment/);
  assert.doesNotMatch(supervision, /\.from\("experiments"\)[\s\S]{0,400}\.(insert|update|delete)\(/);
});

test("#287 Professor supervision remains additive to existing Professor inbox", () => {
  assert.match(runtimeSpeed, /import\("\.\/professor-inbox\.js"\)/);
  assert.match(runtimeSpeed, /import\("\.\/professor-supervision\.js"\)/);
  assert.match(runtimeSpeed, /Professor supervision view failed to load/);
});
