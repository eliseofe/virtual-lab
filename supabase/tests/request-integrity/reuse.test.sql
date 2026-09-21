begin;
do $$
declare
  v_requirements jsonb := '[{"key":"a","summary":"A","evidence":"A missing","resolution_status":"clear"},{"key":"b","summary":"B","evidence":"B missing","resolution_status":"clear"}]';
  v_result jsonb;
  v_candidate uuid;
  v_draft uuid;
  v_links jsonb;
  v_before bigint;
begin
  v_result := public.submit_structured_extension_closure(
    p_draft_title=>'Reuse',p_draft_description=>'Fixture',
    p_publication_identifier=>'test:reuse',p_publication_title=>'Fixture',
    p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
    p_identified_requirements=>v_requirements,
    p_requests=>'[{"request_class":"runtime_configuration","requirement_keys":["a","b"],"novelty_statement":"Absent","candidate_contract_delta":{"delta_key":"test.reuse","delta_name":"AB","target_contract_path":"runtime_contract","requested_change":"Support AB"}}]');
  v_candidate := (v_result->'requests'->0->>'id')::uuid;
  v_draft := (v_result->'blocked_experiment'->>'id')::uuid;
  v_links := jsonb_build_array(
    jsonb_build_object('existing_request_id',v_candidate,'requirement_keys',jsonb_build_array('a'),
      'relationship','generalization_needed','generalization_note','Broaden A'),
    jsonb_build_object('existing_request_id',upper(v_candidate::text),'requirement_keys',jsonb_build_array('b'),
      'relationship','covered'));
  select count(*) into v_before from public.capability_closure_analyses;

  begin
    perform public.submit_structured_extension_closure(
      p_draft_title=>'Repeated reuse',p_draft_description=>'Fixture',
      p_publication_identifier=>'test:reuse-second',p_publication_title=>'Fixture',
      p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
      p_identified_requirements=>v_requirements,p_requests=>v_links);
    raise exception 'Repeated reuse must reject submission before losing evidence';
  exception when invalid_parameter_value then
    assert sqlerrm like 'Each existing_request_id may appear only once.%';
  end;
  begin
    perform public.revalidate_structured_extension_closure(
      v_draft,1,'test/1','best_effort_complete',v_requirements,'[]',v_links);
    raise exception 'Repeated reuse must reject revalidation before losing evidence';
  exception when invalid_parameter_value then
    assert sqlerrm like 'Each existing_request_id may appear only once.%';
  end;
  assert (select count(*) from public.capability_closure_analyses)=v_before;

  -- One grouped link preserves both keys and the stricter relationship.
  v_links := jsonb_build_array(jsonb_build_object('existing_request_id',v_candidate,
    'requirement_keys',jsonb_build_array('a','b'),'relationship','generalization_needed',
    'generalization_note','Broaden A; B already covered'));
  v_result := public.revalidate_structured_extension_closure(
    v_draft,1,'test/1','best_effort_complete',v_requirements,'[]',v_links);
  assert exists (
    select 1 from public.capability_request_evidence
    where closure_analysis_id=(v_result->'analysis'->>'id')::uuid
      and request_id=v_candidate and requirement_keys='["a","b"]'::jsonb
      and relationship='generalization_needed' and generalization_note='Broaden A; B already covered'
  );
end;
$$;
rollback;
