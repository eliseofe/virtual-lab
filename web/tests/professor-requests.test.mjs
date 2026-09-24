// Behaviour tests for the Professor capability-request review rules, covering
// #139, #346, #359, #373, #472, #473, #522 and #523.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDIDATE_ARTIFACTS,
  PROFESSOR_REVIEW_CONTRACT,
  PROFESSOR_REVIEW_DECISIONS,
  REQUEST_CLASS_LABELS,
  artifactSummary,
  candidateDefinition,
  candidateDomain,
  candidateName,
  canReview,
  checkDecision,
  evidenceBadge,
  orderedRequests,
  parseContractPaths,
  pendingCount,
  pendingCountLabel,
  pendingSummary,
  progressMessage,
  requestClassLabel,
  requestCurrentState,
  reviewSummary,
  stateLabel,
  unresolvedGeneralization,
} from "../src/professor/requests.js";

const pending = { id: "r1", status: "requested", professor_disposition: "pending", created_at: "2026-09-20T10:00:00Z", request_class: "semantic_capability", extension_name: "Population identity", extension_domain: "perception", extension_definition: "Agents carry a population id." };

test("#472/#523 the Professor has exactly six decisions, Accept first", () => {
  assert.equal(PROFESSOR_REVIEW_CONTRACT, "vlab.professor-review/3");
  assert.deepEqual(PROFESSOR_REVIEW_DECISIONS.map(([label, decision, primary]) => [label, decision, primary]), [
    ["Accept", "accepted", true],
    ["Revise", "revise", false],
    ["Defer", "deferred", false],
    ["Future", "future", false],
    ["Reject", "rejected", false],
    ["Already supported", "already_supported", false],
  ]);
});

test("#346 the six request classes are labelled, with a neutral fallback", () => {
  assert.deepEqual(Object.keys(REQUEST_CLASS_LABELS), [
    "semantic_capability", "authoring_language", "runtime_configuration",
    "artifact_workflow", "implementation_optimization", "security_boundary",
  ]);
  assert.equal(requestClassLabel({ request_class: "security_boundary" }), "Security / forbidden boundary");
  assert.equal(requestClassLabel({ request_class: "unknown" }), "Extension request");
  assert.deepEqual([...CANDIDATE_ARTIFACTS], ["configuration", "initialization", "controller", "metrics", "environment", "runtime"]);
});

test("#522 each request shows one current state: technical lifecycle first, else the Professor's disposition", () => {
  assert.equal(requestCurrentState(pending), "pending");
  assert.equal(requestCurrentState({ status: "requested", professor_disposition: "revise" }), "revise");
  assert.equal(requestCurrentState({ status: "requested", professor_disposition: null }), "pending");
  assert.equal(requestCurrentState({ status: "approved", professor_disposition: "accepted" }), "accepted");
  assert.equal(requestCurrentState({ status: "declined" }), "rejected");
  assert.equal(requestCurrentState({ status: "resolved" }), "already_supported");
  assert.equal(requestCurrentState({ status: "in_progress", professor_disposition: "accepted" }), "in_progress");
  assert.equal(requestCurrentState({ status: "implemented" }), "implemented");
  assert.equal(stateLabel("already_supported"), "already supported");
});

test("#473 only a Professor reviews, and only requests still requested and pending", () => {
  assert.equal(canReview("professor", pending), true);
  assert.equal(canReview("student", pending), false);
  assert.equal(canReview(undefined, pending), false);
  assert.equal(canReview("professor", { ...pending, professor_disposition: "deferred" }), false);
  assert.equal(canReview("professor", { ...pending, status: "approved" }), false);
});

test("#473 pending requests come first, newest first, and are counted", () => {
  const older = { ...pending, id: "old", created_at: "2026-09-01T00:00:00Z" };
  const done = { id: "done", status: "approved", created_at: "2026-09-25T00:00:00Z" };
  assert.deepEqual(orderedRequests([older, done, pending]).map((request) => request.id), ["r1", "old", "done"]);
  assert.equal(pendingCount([older, done, pending]), 2);
  assert.equal(pendingCountLabel(1), "1 pending extension request");
  assert.equal(pendingCountLabel(2), "2 pending extension requests");
  assert.equal(pendingSummary(0), "0 pending requests.");
});

test("#472 Revise needs guidance; the other decisions do not", () => {
  assert.deepEqual(checkDecision({ decision: "revise", guidance: "  " }), {
    ok: false, error: "Revise requires Professor guidance describing what must change.",
  });
  assert.deepEqual(checkDecision({ decision: "revise", guidance: "Split into two primitives." }), { ok: true });
  for (const decision of ["accepted", "deferred", "future", "rejected"]) {
    assert.deepEqual(checkDecision({ decision, guidance: "" }), { ok: true });
  }
  assert.equal(progressMessage("revise"), "Sending back for revision request…");
  assert.equal(progressMessage("accepted"), "Accepting request…");
  assert.equal(progressMessage("unknown"), "Reviewing request…");
});

test("#523 Already supported requires machine-readable existing support", () => {
  assert.deepEqual(checkDecision({ decision: "already_supported", guidance: "", requestClass: "semantic_capability", contractPaths: ["a.b"] }), {
    ok: false, error: "Already supported requires at least one implemented canonical capability for a semantic request.",
  });
  assert.deepEqual(checkDecision({ decision: "already_supported", guidance: "", requestClass: "authoring_language" }), {
    ok: false, error: "Already supported requires machine-readable existing support.",
  });
  assert.deepEqual(checkDecision({ decision: "already_supported", guidance: "", requestClass: "authoring_language", contractPaths: ["controller.language"] }), { ok: true });
  assert.deepEqual(checkDecision({ decision: "already_supported", guidance: "", requestClass: "semantic_capability", capabilityIds: ["cap-1"] }), { ok: true });
  assert.deepEqual(parseContractPaths(" a.b , ,c.d "), ["a.b", "c.d"]);
  assert.deepEqual(parseContractPaths(undefined), []);
});

test("#374 a structured candidate names the request; otherwise the request's own fields do", () => {
  const semantic = { kind: "semantic_capability", data: { capability_name: "Population", capability_domain: "identity", canonical_definition: "Defn" } };
  const delta = { kind: "contract_delta", data: { delta_name: "Modulo", target_contract_path: "controller.operators", requested_change: "Allow %" } };
  assert.deepEqual([candidateName(pending, semantic), candidateDomain(pending, semantic), candidateDefinition(pending, semantic)], ["Population", "identity", "Defn"]);
  assert.deepEqual([candidateName(pending, delta), candidateDomain(pending, delta), candidateDefinition(pending, delta)], ["Modulo", "controller.operators", "Allow %"]);
  assert.deepEqual([candidateName(pending, null), candidateDomain(pending, null), candidateDefinition(pending, null)], ["Population identity", "perception", "Agents carry a population id."]);
  assert.equal(candidateDefinition({ capability_name: "Legacy" }, null), "Legacy");
  assert.equal(candidateDefinition({}, null), "Scientific extension request");
});

test("#359/#373 evidence: several sources are counted and unresolved generalization is flagged", () => {
  assert.equal(evidenceBadge(1), null);
  assert.equal(evidenceBadge(3), "3 linked sources");
  const evidence = [
    { relationship: "generalization_needed", generalization_resolved_at: null },
    { relationship: "generalization_needed", generalization_resolved_at: "2026-09-21" },
    { relationship: "covered" },
  ];
  assert.equal(unresolvedGeneralization(evidence).length, 1);
  assert.equal(artifactSummary([]), "no preserved draft artifacts");
  assert.equal(artifactSummary([{ id: "controller", type: "controller" }, { id: "extra", type: "metrics" }]), "controller, extra (metrics)");
});

test("#473/#523 a reviewed request shows one summary line", () => {
  const format = (value) => `[${value}]`;
  assert.equal(reviewSummary({ status: "requested", professor_disposition: "revise", professor_disposition_reviewed_at: "t1", professor_guidance: "Split it" }, [], format),
    "Professor decision: revise · [t1] · Professor guidance: Split it");
  assert.equal(reviewSummary({ status: "resolved", professor_disposition: "already_supported" }, [
    { support_kind: "canonical_capability", capability_key: "motion.forward_turning" },
    { support_kind: "contract_path", contract_path: "controller.language" },
  ], format), "Professor decision: already supported · Existing support: motion.forward_turning, controller.language · Technical state: resolved");
  assert.equal(reviewSummary({ status: "requested", professor_disposition: "pending" }, [], format), "No Professor note.");
});
