import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914161504_developer_capability_handoff.sql", import.meta.url),
  "utf8",
);
const handoffDoc = readFileSync(
  new URL("../../docs/DEVELOPER_CAPABILITY_HANDOFF.md", import.meta.url),
  "utf8",
);
const developmentLinks = readFileSync(
  new URL("../src/professor-development-links.js", import.meta.url),
  "utf8",
);
const runtimeSpeed = readFileSync(new URL("../src/runtime-speed.js", import.meta.url), "utf8");
const experimentMcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);

test("#141 developer claim is explicit, lifecycle-bounded and retry-safe", () => {
  assert.match(migration, /add column if not exists github_issue_number bigint/i);
  assert.match(migration, /add column if not exists development_started_at timestamptz/i);
  assert.match(migration, /create unique index if not exists capability_requests_github_issue_number_unique/i);
  assert.match(migration, /create unique index if not exists capability_requests_github_issue_url_unique/i);
  assert.match(migration, /function private\.claim_capability_request_for_development/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /current_request\.status = 'approved'/i);
  assert.match(migration, /set status = 'in_progress'/i);
  assert.match(migration, /development_started_at = now\(\)/i);
  assert.match(migration, /current_request\.status = 'in_progress'[\s\S]*github_issue_number = p_github_issue_number/i);
  assert.match(migration, /cannot be claimed from status/i);
});

test("#141 developer claim is absent from browser, research MCP and service-role API", () => {
  assert.match(
    migration,
    /revoke execute on function private\.claim_capability_request_for_development\([\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(experimentMcp, /claim_capability_request_for_development|github_issue_number|development_started_at/);
  assert.doesNotMatch(developmentLinks, /\.update\(|\.insert\(|\.delete\(|\.rpc\(/);
  assert.match(developmentLinks, /profile\?\.role !== "professor"/);
});

test("#141 Professor inbox keeps linked engineering work inspectable without owning it", () => {
  assert.match(developmentLinks, /\.from\("capability_requests"\)/);
  assert.match(developmentLinks, /github_issue_number, github_issue_url, github_pr_url/);
  assert.match(developmentLinks, /request\.github_issue_url/);
  assert.match(developmentLinks, /Issue #\$\{request\.github_issue_number\}/);
  assert.match(developmentLinks, /professor-request-detail-grid/);
  assert.match(developmentLinks, /professor-request-development/);
  assert.match(developmentLinks, /vlab:professor-requests-rendered/);
  assert.match(developmentLinks, /target = "_blank"/);
  assert.match(developmentLinks, /rel = "noopener noreferrer"/);
  assert.doesNotMatch(developmentLinks, /professor-development-links/);
  assert.match(runtimeSpeed, /import\("\.\/professor-inbox\.js"\)\.then/);
  assert.match(runtimeSpeed, /import\("\.\/professor-development-links\.js"\)/);
});

test("#141 public GitHub handoff preserves privacy and exact request identity", () => {
  assert.match(handoffDoc, /Capability request ID: <uuid>/);
  assert.match(handoffDoc, /search .* exact capability request UUID/i);
  assert.match(handoffDoc, /Do NOT automatically copy/i);
  assert.match(handoffDoc, /full `draft_artifacts` content/i);
  assert.match(handoffDoc, /Professor notes/i);
  assert.match(handoffDoc, /unpublished paper text/i);
  assert.match(handoffDoc, /approved.*in_progress/is);
  assert.match(handoffDoc, /implemented.*NOT part of this checkpoint/is);
});
