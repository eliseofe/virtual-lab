begin;
do $$
declare
  v_requirements jsonb := '[{"key":"a","summary":"Need A","evidence":"A unsupported","resolution_status":"clear"},{"key":"b","summary":"Need B","evidence":"B unsupported","resolution_status":"clear"}]';
  v_requests jsonb := '[{"request_class":"runtime_configuration","requirement_keys":["a"],"novelty_statement":"A is absent","candidate_contract_delta":{"delta_key":"test.coverage","delta_name":"A","target_contract_path":"runtime_contract","requested_change":"Support A"}}]';
  v_result jsonb;
  v_draft uuid;
  v_before bigint;
begin
  select count(*) into v_before from public.capability_closure_analyses;
  begin
    perform public.submit_structured_extension_closure(
      p_draft_title=>'Coverage',p_draft_description=>'Fixture',
      p_publication_identifier=>'test:coverage',p_publication_title=>'Fixture',
      p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
      p_identified_requirements=>v_requirements,p_requests=>v_requests);
    raise exception 'Expected uncovered requirement b to reject submission';
  exception when check_violation then
    assert sqlerrm like 'Unrequested clear requirements: b.%';
  end;
  assert (select count(*) from public.capability_closure_analyses) = v_before;
  assert not exists(select 1 from public.candidate_contract_deltas where delta_key='test.coverage');

  -- One request can cover multiple requirements; creation succeeds atomically.
  v_requests := jsonb_set(v_requests,'{0,requirement_keys}','["a","b"]');
  v_result := public.submit_structured_extension_closure(
    p_draft_title=>'Coverage',p_draft_description=>'Fixture',
    p_publication_identifier=>'test:coverage',p_publication_title=>'Fixture',
    p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
    p_identified_requirements=>v_requirements,p_requests=>v_requests);
  v_draft := (v_result->'blocked_experiment'->>'id')::uuid;

  -- Revalidation may retain existing links without making duplicate requests.
  v_result := public.revalidate_structured_extension_closure(
    v_draft,1,'test/1','best_effort_complete',v_requirements,'[]','[]');
  assert v_result->'analysis'->>'analysis_sequence' = '2';
  assert jsonb_array_length(v_result->'new_requests') = 0;

  begin
    perform public.revalidate_structured_extension_closure(
      v_draft,2,'test/1','best_effort_complete',
      '[{"key":"new","summary":"New gap","evidence":"New unsupported behavior","resolution_status":"clear"}]','[]','[]');
    raise exception 'Expected new unrequested requirement to reject revalidation';
  exception when check_violation then
    assert sqlerrm like 'Unrequested clear requirements: new.%';
  end;
  assert (select max(analysis_sequence) from public.capability_closure_analyses where blocked_experiment_id=v_draft)=2;

  -- Reusing a key for different science cannot inherit the old link silently.
  begin
    perform public.revalidate_structured_extension_closure(
      v_draft,2,'test/1','best_effort_complete',
      jsonb_set(v_requirements,'{0,summary}','"Different requirement"'),'[]','[]');
    raise exception 'Expected changed requirement to need an explicit link';
  exception when check_violation then
    assert sqlerrm like 'Unrequested clear requirements: a.%';
  end;

  -- Ambiguity-only preservation remains a supported operation with no requests.
  v_result := public.submit_structured_extension_closure(
    p_draft_title=>'Ambiguous',p_draft_description=>'Fixture',
    p_publication_identifier=>'test:ambiguous',p_publication_title=>'Fixture',
    p_contract_version=>'test/1',p_analysis_status=>'partial_due_to_ambiguity',
    p_identified_requirements=>'[{"key":"unknown","summary":"Unknown","evidence":"Needs clarification","resolution_status":"ambiguous"}]',
    p_unresolved_ambiguities=>'[{"key":"question","requirement_key":"unknown","question":"Which behavior?"}]');
  assert jsonb_array_length(v_result->'requests')=0;
end;
$$;
rollback;
