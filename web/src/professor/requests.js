// Professor capability-request review rules (#139, #359, #373, #472, #473,
// #522, #523), as pure functions: no DOM, no Supabase. professor-inbox.js asks
// these for every decision; web/tests/professor-requests.test.mjs tests them
// directly.

export const REQUEST_CLASS_LABELS = Object.freeze({
  semantic_capability: "Semantic capability",
  authoring_language: "Authoring language",
  runtime_configuration: "Runtime / configuration",
  artifact_workflow: "Artifact / workflow",
  implementation_optimization: "Implementation / optimization",
  security_boundary: "Security / forbidden boundary",
});

export const CANDIDATE_ARTIFACTS = Object.freeze(["configuration", "initialization", "controller", "metrics", "environment", "runtime"]);

export const PROFESSOR_REVIEW_CONTRACT = "vlab.professor-review/3";

// [button label, decision, primary]
export const PROFESSOR_REVIEW_DECISIONS = Object.freeze([
  ["Accept", "accepted", true],
  ["Revise", "revise", false],
  ["Defer", "deferred", false],
  ["Future", "future", false],
  ["Reject", "rejected", false],
  ["Already supported", "already_supported", false],
]);

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export function artifactSummary(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return "no preserved draft artifacts";
  return artifacts.map((artifact) => {
    const id = typeof artifact?.id === "string" ? artifact.id : "artifact";
    const type = typeof artifact?.type === "string" ? artifact.type : null;
    return type && type !== id ? `${id} (${type})` : id;
  }).join(", ");
}

// The one current state of a request: the technical lifecycle once it has
// moved on, otherwise the Professor's disposition (#522).
export function requestCurrentState(request) {
  if (request.status === "implemented" || request.status === "in_progress") return request.status;
  if (request.status === "approved") return "accepted";
  if (request.status === "declined") return "rejected";
  if (request.status === "resolved") return "already_supported";
  return request.professor_disposition || "pending";
}

export function stateLabel(state) {
  return state.replaceAll("_", " ");
}

export function requestClassLabel(request) {
  return REQUEST_CLASS_LABELS[request.request_class] || "Extension request";
}

// The structured candidate (#374) names the request when one exists.
export function candidateName(request, candidate) {
  if (candidate?.kind === "semantic_capability") return candidate.data.capability_name;
  if (candidate?.kind === "contract_delta") return candidate.data.delta_name;
  return request.extension_name || request.capability_name;
}

export function candidateDomain(request, candidate) {
  if (candidate?.kind === "semantic_capability") return candidate.data.capability_domain;
  if (candidate?.kind === "contract_delta") return candidate.data.target_contract_path;
  return request.extension_domain || request.capability_domain;
}

export function candidateDefinition(request, candidate) {
  if (candidate?.kind === "semantic_capability") return candidate.data.canonical_definition;
  if (candidate?.kind === "contract_delta") return candidate.data.requested_change;
  return request.extension_definition || request.capability_name || "Scientific extension request";
}

// Evidence saying the candidate is too narrow and has not been generalized yet (#373).
export function unresolvedGeneralization(evidence) {
  return evidence.filter(
    (item) => item.relationship === "generalization_needed" && !item.generalization_resolved_at,
  );
}

export function evidenceBadge(evidenceCount) {
  return evidenceCount > 1 ? `${evidenceCount} linked sources` : null;
}

export function pendingCount(requests) {
  return requests.filter((request) => requestCurrentState(request) === "pending").length;
}

export function pendingCountLabel(pending) {
  return `${pending} pending extension request${pending === 1 ? "" : "s"}`;
}

export function pendingSummary(pending) {
  return `${pending} pending request${pending === 1 ? "" : "s"}.`;
}

// Pending requests first, then newest first.
export function orderedRequests(requests) {
  return [...requests].sort((left, right) => {
    const leftPending = requestCurrentState(left) === "pending" ? 0 : 1;
    const rightPending = requestCurrentState(right) === "pending" ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

// Only a Professor may review, and only a request that is still requested and pending.
export function canReview(role, request) {
  return role === "professor" && request.status === "requested" && request.professor_disposition === "pending";
}

// Validates a decision before it is sent. Returns { ok: true } or { ok: false, error }.
export function checkDecision({ decision, guidance, requestClass, capabilityIds = [], contractPaths = [] }) {
  if (decision === "already_supported") {
    if (requestClass === "semantic_capability" && capabilityIds.length === 0) {
      return { ok: false, error: "Already supported requires at least one implemented canonical capability for a semantic request." };
    }
    if (capabilityIds.length === 0 && contractPaths.length === 0) {
      return { ok: false, error: "Already supported requires machine-readable existing support." };
    }
    return { ok: true };
  }
  if (decision === "revise" && !guidance.trim()) {
    return { ok: false, error: "Revise requires Professor guidance describing what must change." };
  }
  return { ok: true };
}

export function parseContractPaths(text) {
  return (text || "").split(",").map((value) => value.trim()).filter(Boolean);
}

const PROGRESS = Object.freeze({
  accepted: "Accepting",
  rejected: "Rejecting",
  revise: "Sending back for revision",
  deferred: "Deferring",
  future: "Marking as future",
  already_supported: "Resolving as already supported",
});

export function progressMessage(decision) {
  return `${PROGRESS[decision] || "Reviewing"} request…`;
}

// The one-line review summary shown on a request that is no longer pending.
export function reviewSummary(request, support, format = formatDate) {
  const parts = [];
  if (request.professor_disposition && request.professor_disposition !== "pending") parts.push(`Professor decision: ${stateLabel(request.professor_disposition)}`);
  if (request.professor_disposition_reviewed_at || request.reviewed_at) parts.push(format(request.professor_disposition_reviewed_at || request.reviewed_at));
  if (request.professor_guidance || request.professor_notes) parts.push(`Professor guidance: ${request.professor_guidance || request.professor_notes}`);
  if (support.length > 0) {
    const labels = support.map((item) => item.support_kind === "canonical_capability"
      ? item.capability_key || item.canonical_capability_id
      : item.contract_path);
    parts.push(`Existing support: ${labels.join(", ")}`);
  }
  if (request.status !== "requested") parts.push(`Technical state: ${stateLabel(request.status)}`);
  return parts.join(" · ") || "No Professor note.";
}
