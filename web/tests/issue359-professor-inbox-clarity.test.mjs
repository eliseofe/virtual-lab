import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");

test("#359 keeps the default Professor card compact and science-oriented", () => {
  assert.match(inbox, /title\.textContent = request\.extension_name \|\| request\.capability_name/);
  assert.match(inbox, /REQUEST_CLASS_LABELS\[request\.request_class\]/);
  assert.match(inbox, /status\.textContent = request\.status\.replaceAll/);
  assert.match(inbox, /definition\.textContent = request\.extension_definition/);
  assert.match(inbox, /Professor note/);
  assert.match(inbox, /approve\.textContent = "Approve"/);
  assert.match(inbox, /decline\.textContent = "Decline"/);
  assert.doesNotMatch(inbox, /professor-semantic-editor|Create new canonical capability|Bind existing:/);
});

test("#359 nests durable multi-source evidence beneath one request card", () => {
  assert.match(inbox, /\.from\("capability_request_evidence"\)/);
  assert.match(inbox, /\.from\("capability_closure_analyses"\)/);
  assert.match(inbox, /\.from\("blocked_experiment_drafts"\)/);
  assert.match(inbox, /document\.createElement\("details"\)/);
  assert.match(inbox, /summary\.textContent = "Evidence and details"/);
  assert.match(inbox, /if \(evidenceCount > 1\)/);
  assert.match(inbox, /\$\{evidenceCount\} linked sources/);

  const render = inbox.match(/function render\(\)[\s\S]*?async function loadRequestEvidence/)?.[0] ?? "";
  assert.equal((render.match(/document\.createElement\("article"\)/g) ?? []).length, 1);
  assert.match(render, /for \(const request of ordered\)/);
  assert.doesNotMatch(render, /for \(const .* of evidence\)[\s\S]*document\.createElement\("article"\)/);
});

test("#359 moves use-case and secondary metadata out of the default decision surface", () => {
  const render = inbox.match(/function render\(\)[\s\S]*?async function loadRequestEvidence/)?.[0] ?? "";
  assert.doesNotMatch(render, /request\.publication_identifier/);
  assert.doesNotMatch(render, /request\.draft_artifacts/);
  assert.doesNotMatch(render, /request\.context/);
  assert.match(inbox, /buildEvidenceDetails\(request\)/);
  assert.match(inbox, /addDetailLine\(metadata, "Use-case context", request\.context\)/);
  assert.match(inbox, /addDetailLine\(metadata, "Preserved artifacts", artifactSummary\(request\.draft_artifacts\)\)/);
});

test("#359 preserves full linked paper and Experiment evidence on demand", () => {
  assert.match(inbox, /source\.publication_title/);
  assert.match(inbox, /source\.publication_identifier/);
  assert.match(inbox, /source\.title/);
  assert.match(inbox, /analysis\.analysis_sequence/);
  assert.match(inbox, /item\.requirement_keys/);
  assert.match(inbox, /source\.description/);
  assert.match(inbox, /source\.source_context/);
});

test("#359 keeps Professor-only authorization and existing triage lifecycle", () => {
  assert.match(inbox, /profile\?\.role !== "professor"/);
  assert.match(inbox, /ui\.panel\.hidden = !isProfessor/);
  assert.match(inbox, /triage_extension_request/);
  assert.match(inbox, /p_decision: status/);
  assert.match(inbox, /p_professor_notes: note\.trim\(\) \|\| null/);
  assert.match(inbox, /p_bind_canonical_capability_id: null/);
});

test("#359 keeps implementation machinery out of the default inbox flow", () => {
  const links = readFileSync(new URL("../src/professor-development-links.js", import.meta.url), "utf8");
  assert.match(inbox, /card\.dataset\.requestId = request\.id/);
  assert.match(inbox, /vlab:professor-requests-rendered/);
  assert.match(links, /professor-request-detail-grid/);
  assert.match(links, /professor-request-development/);
  assert.doesNotMatch(links, /summary\.insertAdjacentElement|section\.className = "professor-development-links"/);
});
