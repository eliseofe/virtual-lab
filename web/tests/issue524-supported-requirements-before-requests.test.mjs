import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260923075000_capability_closure_classified_requirements.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
const versions = readFileSync(new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md", import.meta.url), "utf8");

test("#524 stores requirement classification separately from request identity", () => {
  assert.match(migration, /create table if not exists public\.capability_closure_requirements/);
  assert.match(migration, /classification in \('supported', 'unsupported', 'ambiguous'\)/);
  assert.match(migration, /create table if not exists public\.capability_closure_requirement_support/);
  assert.match(migration, /support_kind in \('canonical_capability', 'contract_path'\)/);
  assert.match(migration, /Historical rows stay historically truthful/);
});

test("#524 backend forbids fake requests for supported or ambiguous requirements", () => {
  assert.match(migration, /Requests may reference only requirements classified as unsupported/);
  assert.match(migration, /Every unsupported requirement must link to a reused or new unavailable candidate request/);
  assert.match(migration, /Every supported requirement must cite deployed support/);
  assert.match(migration, /Supported requirements may cite only implemented canonical capabilities/);
  assert.match(migration, /Every ambiguous requirement must retain an unresolved ambiguity/);
});

test("#524 v11 preserves the legacy analysis projection while adding normalized evidence", () => {
  assert.match(migration, /submit_structured_extension_closure_v11/);
  assert.match(migration, /revalidate_structured_extension_closure_v11/);
  assert.match(migration, /submit_structured_extension_closure_v8/);
  assert.match(migration, /revalidate_structured_extension_closure_v8/);
  assert.match(migration, /where req ->> 'classification' in \('unsupported', 'ambiguous'\)/);
  assert.match(migration, /capability_request_interface', 'vlab\.capability-request\/11'/);
});

test("#524 MCP classifies before request creation and resumes support evidence", () => {
  assert.match(mcp, /classification: z\.enum\(\['supported', 'unsupported', 'ambiguous'\]\)/);
  assert.match(mcp, /CLOSURE_SUPPORT_REFERENCE_INPUT/);
  assert.match(mcp, /supported_requirement_policy: 'record_support_without_request'/);
  assert.match(mcp, /unsupported_requirement_policy: 'candidate_request_required'/);
  assert.match(mcp, /ambiguous_requirement_policy: 'blocking_without_request'/);
  assert.match(mcp, /submit_structured_extension_closure_v11/);
  assert.match(mcp, /revalidate_structured_extension_closure_v11/);
  assert.match(mcp, /classified_requirement_history/);
  assert.match(mcp, /capability_closure_requirement_support/);
});

test("#524 versions the repaired closure protocol and documents exceptional Already Supported", () => {
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/11'/);
  assert.match(versions, /MCP_SERVER_VERSION = '3\.21\.0'/);
  assert.match(versions, /capability_request_interface: 'vlab\.capability-request\/11'/);
  assert.match(workflow, /Supported requirements create no request/i);
  assert.match(workflow, /Already Supported is reserved for exceptional false positives/i);
});
