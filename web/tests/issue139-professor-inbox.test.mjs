import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914155241_professor_capability_inbox.sql", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const runtimeSpeed = readFileSync(new URL("../src/runtime-speed.js", import.meta.url), "utf8");

test("#139 stores durable Professor review provenance", () => {
  assert.match(migration, /add column if not exists reviewed_by uuid references auth\.users\(id\)/i);
  assert.match(migration, /add column if not exists reviewed_at timestamptz/i);
  assert.match(migration, /new\.reviewed_by := auth\.uid\(\)/i);
  assert.match(migration, /new\.reviewed_at := now\(\)/i);
  assert.match(migration, /old\.status = 'requested' and new\.status in \('approved', 'declined'\)/i);
});

test("#139 Professor inbox RLS exposes triage only to Professor", () => {
  assert.match(migration, /drop policy if exists "capability_requests_select_own_professor"/i);
  assert.match(migration, /create policy "capability_requests_select_professor_inbox"/i);
  assert.match(migration, /p\.role = 'professor'/i);
  assert.match(migration, /grant update \(status, professor_notes\) on table public\.capability_requests to authenticated/i);
  assert.match(migration, /create policy "capability_requests_triage_professor"/i);
  assert.match(migration, /using \([\s\S]*status = 'requested'/i);
  assert.match(migration, /with check \([\s\S]*status in \('approved', 'declined'\)/i);
  assert.match(migration, /reviewed_by = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /grant update on table public\.capability_requests to authenticated/i);
});

test("#139 Lab inbox remains Professor-only while later triage moves behind the typed RPC", () => {
  assert.match(inbox, /select\("id, display_name, role"\)/);
  assert.match(inbox, /profile\?\.role === "professor"/);
  assert.match(inbox, /ui\.panel\.hidden = !isProfessor/);
  assert.match(inbox, /\.from\("capability_requests"\)/);
  assert.match(inbox, /triage_extension_request/);
  assert.match(inbox, /p_decision: status/);
  assert.match(inbox, /p_professor_notes: note\.trim\(\) \|\| null/);
  assert.match(inbox, /approve\.textContent = "Approve"/);
  assert.match(inbox, /decline\.textContent = "Decline"/);
  assert.doesNotMatch(inbox, /github\.com|github_issue_url|github_pr_url|service_role|deploy/i);
});

test("#139 Professor inbox stays additive to ordinary registry and simulator UI", () => {
  assert.match(runtimeSpeed, /import\("\.\/registry-ui-v3\.js"\)\.then/);
  assert.match(runtimeSpeed, /import\("\.\/professor-inbox\.js"\)/);
  assert.match(runtimeSpeed, /Professor inbox failed to load/);
});
