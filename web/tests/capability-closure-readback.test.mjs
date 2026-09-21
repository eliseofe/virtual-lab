import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClosureLinkedRequests } from '../../supabase/functions/experiment-mcp/closure-linked-requests.js';

test('closure readback retains shared candidate evidence when the private request is hidden', () => {
  const evidence = [
    { request_id: 'owned', closure_analysis_id: 'first', requirement_keys: ['a'], relationship: 'covered' },
    { request_id: 'shared', closure_analysis_id: 'first', requirement_keys: ['b'], relationship: 'generalization_needed', generalization_note: 'Need both 2D and 3D' },
    { request_id: 'shared', closure_analysis_id: 'second', requirement_keys: ['b', 'c'], relationship: 'covered' },
  ];
  const ownRequest = { id: 'owned', requester_id: 'me', draft_artifacts: ['my saved code'], status: 'requested' };
  const sharedCandidate = { request_id: 'shared', capability_key: 'test.shared', capability_domain: 'observation', capability_name: 'Target', canonical_definition: 'Observe targets', request_status: 'in_progress' };
  const result = buildClosureLinkedRequests(evidence, [ownRequest], [sharedCandidate], []);
  assert.deepEqual(result.map(row => row.id), ['owned', 'shared']);
  assert.deepEqual(result[0], { ...ownRequest, candidate_capability: null, candidate_contract_delta: null, evidence: [evidence[0]] });
  assert.equal(result[1].status, 'in_progress');
  assert.equal(result[1].request_class, 'semantic_capability');
  assert.equal(result[1].extension_key, 'test.shared');
  assert.deepEqual(result[1].evidence, evidence.slice(1));
  assert.deepEqual(result[1].candidate_capability, sharedCandidate);
  for (const field of ['requester_id', 'draft_artifacts', 'draft_description', 'context', 'origin_experiment_id']) {
    assert.equal(Object.hasOwn(result[1], field), false, `No private ${field} in fallback`);
  }
});

test('closure readback retains shared contract deltas and their lifecycle', () => {
  const delta = { request_id: 'delta', request_class: 'runtime_configuration', delta_key: 'test.dimensions', delta_name: 'Dimensions', requested_change: 'Support 3D', request_status: 'approved' };
  const evidence = [{ request_id: 'delta', requirement_keys: ['dimensions'] }];
  const [result] = buildClosureLinkedRequests(evidence, [], [], [delta]);
  assert.equal(result.request_class, 'runtime_configuration');
  assert.equal(result.status, 'approved');
  assert.equal(result.extension_domain, 'authoring_contract');
  assert.equal(result.extension_key, 'test.dimensions');
  assert.equal(result.extension_definition, 'Support 3D');
  assert.deepEqual(result.candidate_contract_delta, delta);
  assert.deepEqual(result.evidence, evidence);
});

test('closure readback retains evidence even without a readable candidate or request', () => {
  const evidence = [{ request_id: 'legacy', requirement_keys: ['a'] }];
  const [result] = buildClosureLinkedRequests(evidence, [], [], []);
  assert.equal(result.id, 'legacy');
  assert.equal(result.status, null);
  assert.equal(result.candidate_capability, null);
  assert.equal(result.candidate_contract_delta, null);
  assert.deepEqual(result.evidence, evidence);
});

test('closure readback only includes evidence-linked requests and accepts empty results', () => {
  assert.deepEqual(buildClosureLinkedRequests([], [{ id: 'unlinked' }], [], []), []);
  assert.deepEqual(buildClosureLinkedRequests([], [], [], []), []);
});
