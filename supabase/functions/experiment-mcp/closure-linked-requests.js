// Evidence is the authority for which requests belong to a visible closure.
// Private request rows may be hidden by RLS even when their shared candidates
// and this caller's evidence are readable. Do not require those private rows.
export function buildClosureLinkedRequests(evidence, requests, candidateCapabilities, candidateContractDeltas) {
  const requestsById = new Map(requests.map(request => [request.id, request]))
  const capabilitiesByRequest = new Map(candidateCapabilities.map(candidate => [candidate.request_id, candidate]))
  const deltasByRequest = new Map(candidateContractDeltas.map(candidate => [candidate.request_id, candidate]))
  const evidenceByRequest = new Map()
  for (const link of evidence) {
    if (!evidenceByRequest.has(link.request_id)) evidenceByRequest.set(link.request_id, [])
    evidenceByRequest.get(link.request_id).push(link)
  }

  return [...evidenceByRequest].map(([id, links]) => {
    const capability = capabilitiesByRequest.get(id) ?? null
    const delta = deltasByRequest.get(id) ?? null
    // Fallback metadata comes only from the already readable candidate. Draft
    // artifacts, requester identity and private context are never synthesized.
    const request = requestsById.get(id) ?? {
      id,
      request_class: capability ? 'semantic_capability' : delta?.request_class ?? null,
      status: capability?.request_status ?? delta?.request_status ?? null,
      extension_key: capability?.capability_key ?? delta?.delta_key ?? null,
      extension_domain: capability?.capability_domain ?? (delta ? 'authoring_contract' : null),
      extension_name: capability?.capability_name ?? delta?.delta_name ?? null,
      extension_definition: capability?.canonical_definition ?? delta?.requested_change ?? null,
    }
    return {
      ...request,
      candidate_capability: capability,
      candidate_contract_delta: delta,
      evidence: links,
    }
  })
}
