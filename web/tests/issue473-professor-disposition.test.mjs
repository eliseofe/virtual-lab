import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260921183133_professor_request_dispositions.sql", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");

test("#473 adds one extensible Professor disposition axis without replacing technical lifecycle", () => {
  assert.match(migration, /add column if not exists professor_disposition text/i);
  assert.match(migration, /'pending', 'accepted', 'rejected', 'revise', 'deferred', 'future'/);
  assert.match(migration, /status in \('approved', 'in_progress', 'implemented'\).*professor_disposition = 'accepted'/s);
  assert.match(migration, /status = 'declined'.*professor_disposition = 'rejected'/s);
  assert.match(migration, /status = 'requested'.*'pending', 'revise', 'deferred', 'future'/s);
  assert.doesNotMatch(migration, /priority/i);
});

test("#473 preserves Professor guidance separately and records durable review history", () => {
  assert.match(migration, /add column if not exists professor_guidance text/i);
  assert.match(migration, /add column if not exists professor_disposition_reviewed_by uuid references auth\.users\(id\)/i);
  assert.match(migration, /add column if not exists professor_disposition_reviewed_at timestamptz/i);
  assert.match(migration, /create table if not exists public\.capability_request_professor_reviews/i);
  assert.match(migration, /review_revision integer not null/i);
  assert.match(migration, /record_capability_request_professor_review/i);
  assert.match(migration, /professor_guidance = nullif\(btrim\(coalesce\(p_professor_notes, ''\)\), ''\)/i);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.triage_extension_request[\s\S]*?\$function\$;/i)?.[0] ?? "",
    /set[\s\S]*professor_notes\s*=/i,
  );
});

test("#473 backfills historical lifecycle without changing request identity", () => {
  assert.match(migration, /when status in \('approved', 'in_progress', 'implemented'\) then 'accepted'/i);
  assert.match(migration, /when status = 'declined' then 'rejected'/i);
  assert.match(migration, /else 'pending'/i);
  assert.doesNotMatch(migration, /delete from public\.capability_requests/i);
  assert.doesNotMatch(migration, /insert into public\.capability_requests/i);
});

test("#473 keeps new requests pending and Professor-only triage authoritative", () => {
  assert.match(migration, /as restrictive\s+for insert[\s\S]*professor_disposition = 'pending'/i);
  assert.match(migration, /professor_guidance is null/i);
  assert.match(migration, /Only a Professor may triage extension requests/);
  assert.match(migration, /and r\.professor_disposition = 'pending'/i);
  assert.match(migration, /when 'approved' then 'accepted'/i);
  assert.match(migration, /when 'accepted' then 'accepted'/i);
  assert.match(migration, /when 'declined' then 'rejected'/i);
  assert.match(migration, /when 'rejected' then 'rejected'/i);
  assert.match(migration, /when 'revise' then 'revise'/i);
  assert.match(migration, /when 'deferred' then 'deferred'/i);
  assert.match(migration, /when 'future' then 'future'/i);
});

test("#473 keeps reviewed non-binary candidates unavailable and discoverable", () => {
  assert.match(migration, /when new\.status = 'implemented' then 'superseded_implemented'\s+else 'candidate_unavailable'/i);
  assert.match(migration, /professor_disposition = new\.professor_disposition/i);
  assert.match(migration, /professor_guidance = new\.professor_guidance/i);
  assert.match(migration, /update public\.candidate_capabilities/i);
  assert.match(migration, /update public\.candidate_contract_deltas/i);
  assert.doesNotMatch(migration, /availability\s*=\s*'implemented'/i);
});

test("#473 pending Professor inbox semantics use disposition, while visual redesign remains for successor", () => {
  // #551: behaviour covered by professor-requests.test.mjs; this checks the inbox uses the rule.
  assert.match(inbox, /const currentState = requestCurrentState\(request\)/);
  assert.match(inbox, /requestCurrentState\(request\) === "pending"/);
  assert.match(inbox, /const ordered = orderedRequests\(requests\)/);
  assert.match(inbox, /if \(!canReview\(profile\?\.role, request\)\) return;/);
  assert.match(inbox, /professor_disposition, professor_guidance, professor_disposition_reviewed_at/);
  // #551: the six decisions are covered by professor-requests.test.mjs; this checks the inbox renders them.
  assert.match(inbox, /for \(const \[label, decision, primary\] of PROFESSOR_REVIEW_DECISIONS\)/);
});
