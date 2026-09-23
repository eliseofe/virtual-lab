const CAPABILITY_FIELDS = Object.freeze([
  'request_id',
  'capability_key',
  'capability_domain',
  'capability_name',
  'canonical_definition',
  'target_artifact',
  'target_runtime_domain',
  'authoring_surfaces',
  'availability',
  'request_status',
  'professor_disposition',
  'professor_guidance',
  'request_created_at',
  'request_updated_at',
  'generalization_revision',
  'generalized_at',
])

const CONTRACT_DELTA_FIELDS = Object.freeze([
  'request_id',
  'request_class',
  'delta_key',
  'delta_name',
  'target_contract_path',
  'requested_change',
  'availability',
  'request_status',
  'professor_disposition',
  'professor_guidance',
  'request_created_at',
  'request_updated_at',
  'generalization_revision',
  'generalized_at',
])

function pickFields(value, fields) {
  if (!value) return null
  return Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]))
}

// Closure evidence is authoritative for membership. A request row can be
// legitimately hidden by RLS while the caller can still read their evidence
// link and the globally shared candidate surface. Reconstruct only from those
// already-readable sanitized surfaces; never synthesize private request data.
export function buildClosureLinkedRequests(evidence, requests, candidateCapabilities, candidateContractDeltas, supportResolutions = []) {
  const requestsById = new Map(requests.map(request => [request.id, request]))
  const capabilitiesByRequest = new Map(
    candidateCapabilities.map(candidate => [candidate.request_id, pickFields(candidate, CAPABILITY_FIELDS)]),
  )
  const deltasByRequest = new Map(
    candidateContractDeltas.map(delta => [delta.request_id, pickFields(delta, CONTRACT_DELTA_FIELDS)]),
  )

  const supportByRequest = new Map()
  for (const resolution of supportResolutions) {
    if (!supportByRequest.has(resolution.request_id)) supportByRequest.set(resolution.request_id, [])
    supportByRequest.get(resolution.request_id).push(resolution)
  }

  const evidenceByRequest = new Map()
  for (const link of evidence) {
    if (!evidenceByRequest.has(link.request_id)) evidenceByRequest.set(link.request_id, [])
    evidenceByRequest.get(link.request_id).push(link)
  }

  return [...evidenceByRequest.entries()].map(([requestId, links]) => {
    const readableRequest = requestsById.get(requestId) ?? null
    const candidateCapability = capabilitiesByRequest.get(requestId) ?? null
    const candidateContractDelta = deltasByRequest.get(requestId) ?? null

    const sharedFallback = {
      id: requestId,
      request_class: candidateCapability
        ? 'semantic_capability'
        : candidateContractDelta?.request_class ?? null,
      status: candidateCapability?.request_status ?? candidateContractDelta?.request_status ?? null,
      professor_disposition: candidateCapability?.professor_disposition ?? candidateContractDelta?.professor_disposition ?? null,
      professor_guidance: candidateCapability?.professor_guidance ?? candidateContractDelta?.professor_guidance ?? null,
      extension_key: candidateCapability?.capability_key ?? candidateContractDelta?.delta_key ?? null,
      extension_domain: candidateCapability?.capability_domain
        ?? (candidateContractDelta ? 'authoring_contract' : null),
      extension_name: candidateCapability?.capability_name ?? candidateContractDelta?.delta_name ?? null,
      extension_definition:
        candidateCapability?.canonical_definition ?? candidateContractDelta?.requested_change ?? null,
    }

    return {
      ...(readableRequest ?? sharedFallback),
      candidate_capability: candidateCapability,
      candidate_contract_delta: candidateContractDelta,
      support_resolution: supportByRequest.get(requestId) ?? [],
      evidence: links,
    }
  })
}
