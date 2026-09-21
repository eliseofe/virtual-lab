import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildClosureLinkedRequests } from '../../supabase/functions/experiment-mcp/closure-linked-requests.js'

const mcp = readFileSync(
  new URL('../../supabase/functions/experiment-mcp/index.ts', import.meta.url),
  'utf8',
)

test('#464 closure resume keeps shared semantic candidates when the private request row is hidden', () => {
  const evidence = [
    {
      request_id: 'owned',
      closure_analysis_id: 'analysis-1',
      requirement_keys: ['own'],
      relationship: 'covered',
      created_at: '2026-09-21T00:00:00Z',
    },
    {
      request_id: 'shared',
      closure_analysis_id: 'analysis-1',
      requirement_keys: ['target'],
      relationship: 'generalization_needed',
      generalization_note: 'Need the broader observable.',
      created_at: '2026-09-21T00:01:00Z',
    },
    {
      request_id: 'shared',
      closure_analysis_id: 'analysis-2',
      requirement_keys: ['target', 'metric'],
      relationship: 'covered',
      created_at: '2026-09-21T00:02:00Z',
    },
  ]

  const readableOwnRequest = {
    id: 'owned',
    requester_id: 'me',
    context: 'private own context is readable to its owner',
    draft_artifacts: [{ path: 'controller.py', content: 'own code' }],
    status: 'requested',
  }

  const sharedCandidate = {
    request_id: 'shared',
    capability_key: 'observation.shared_target',
    capability_domain: 'observation',
    capability_name: 'Shared target observable',
    canonical_definition: 'Observe an experiment-defined target.',
    target_artifact: 'controller',
    target_runtime_domain: 'observation',
    authoring_surfaces: [{ artifact: 'controller', kind: 'observation', symbol: 'obs.target' }],
    availability: 'candidate_unavailable',
    request_status: 'in_progress',
    request_created_at: '2026-09-20T00:00:00Z',
    request_updated_at: '2026-09-21T00:00:00Z',
    generalization_revision: 1,
    generalized_at: '2026-09-21T00:00:00Z',
    // These fields must never escape if a future query accidentally broadens.
    requester_id: 'somebody-else',
    context: 'private',
    draft_artifacts: ['private'],
    publication_identifier: 'private-source',
    generalized_by: 'professor-id',
  }

  const result = buildClosureLinkedRequests(
    evidence,
    [readableOwnRequest],
    [sharedCandidate],
    [],
  )

  assert.deepEqual(result.map(row => row.id), ['owned', 'shared'])
  assert.deepEqual(result[0], {
    ...readableOwnRequest,
    candidate_capability: null,
    candidate_contract_delta: null,
    evidence: [evidence[0]],
  })

  const shared = result[1]
  assert.equal(shared.request_class, 'semantic_capability')
  assert.equal(shared.status, 'in_progress')
  assert.equal(shared.extension_key, 'observation.shared_target')
  assert.equal(shared.extension_domain, 'observation')
  assert.equal(shared.extension_name, 'Shared target observable')
  assert.equal(shared.extension_definition, 'Observe an experiment-defined target.')
  assert.deepEqual(shared.evidence, evidence.slice(1))
  assert.equal(shared.candidate_capability.request_id, 'shared')

  for (const field of [
    'requester_id',
    'context',
    'draft_artifacts',
    'publication_identifier',
    'generalized_by',
    'professor_notes',
    'developer_notes',
  ]) {
    assert.equal(Object.hasOwn(shared, field), false, `fallback leaked private request field ${field}`)
    assert.equal(Object.hasOwn(shared.candidate_capability, field), false, `candidate leaked non-public field ${field}`)
  }
})

test('#464 closure resume keeps shared contract deltas with sanitized lifecycle metadata', () => {
  const evidence = [
    { request_id: 'delta', closure_analysis_id: 'analysis-1', requirement_keys: ['runtime'] },
  ]
  const candidate = {
    request_id: 'delta',
    request_class: 'runtime_configuration',
    delta_key: 'runtime.shared_setting',
    delta_name: 'Shared runtime setting',
    target_contract_path: 'runtime_contract',
    requested_change: 'Expose the setting.',
    availability: 'candidate_unavailable',
    request_status: 'approved',
    request_created_at: '2026-09-20T00:00:00Z',
    request_updated_at: '2026-09-21T00:00:00Z',
    generalization_revision: 0,
    generalized_at: null,
    requester_id: 'hidden-owner',
    professor_notes: 'hidden',
  }

  const [result] = buildClosureLinkedRequests(evidence, [], [], [candidate])

  assert.equal(result.id, 'delta')
  assert.equal(result.request_class, 'runtime_configuration')
  assert.equal(result.status, 'approved')
  assert.equal(result.extension_key, 'runtime.shared_setting')
  assert.equal(result.extension_domain, 'authoring_contract')
  assert.equal(result.extension_definition, 'Expose the setting.')
  assert.deepEqual(result.evidence, evidence)
  assert.equal(Object.hasOwn(result.candidate_contract_delta, 'requester_id'), false)
  assert.equal(Object.hasOwn(result.candidate_contract_delta, 'professor_notes'), false)
})

test('#464 evidence remains visible even if neither private request nor candidate metadata is readable', () => {
  const evidence = [
    { request_id: 'legacy', closure_analysis_id: 'analysis-1', requirement_keys: ['legacy'] },
  ]
  const [result] = buildClosureLinkedRequests(evidence, [], [], [])

  assert.deepEqual(result, {
    id: 'legacy',
    request_class: null,
    status: null,
    extension_key: null,
    extension_domain: null,
    extension_name: null,
    extension_definition: null,
    candidate_capability: null,
    candidate_contract_delta: null,
    evidence,
  })
})

test('#464 closure membership comes from visible evidence, not readable request rows', () => {
  assert.deepEqual(
    buildClosureLinkedRequests([], [{ id: 'readable-but-unlinked', requester_id: 'me' }], [], []),
    [],
  )
})

test('#464 MCP resume uses sanitized shared candidate queries and evidence-authoritative reconstruction', () => {
  assert.match(mcp, /buildClosureLinkedRequests/)
  assert.match(
    mcp,
    /candidate_capabilities'\)\s*\.select\('request_id, capability_key, capability_domain, capability_name, canonical_definition, target_artifact, target_runtime_domain, authoring_surfaces, availability, request_status, request_created_at, request_updated_at, generalization_revision, generalized_at'\)/,
  )
  assert.match(
    mcp,
    /candidate_contract_deltas'\)\s*\.select\('request_id, request_class, delta_key, delta_name, target_contract_path, requested_change, availability, request_status, request_created_at, request_updated_at, generalization_revision, generalized_at'\)/,
  )
  assert.doesNotMatch(mcp, /linkedRequests = \(requests \?\? \[\]\)\.map/)
})
