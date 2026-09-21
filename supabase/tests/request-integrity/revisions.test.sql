begin;
do $$
declare
  v_origin uuid := gen_random_uuid();
  v_requirements jsonb := '[{"key":"a","summary":"Need A","evidence":"A unsupported","resolution_status":"clear"}]';
  v_requests jsonb := '[{"request_class":"runtime_configuration","requirement_keys":["a"],"novelty_statement":"A is absent","candidate_contract_delta":{"delta_key":"test.revision1","delta_name":"A","target_contract_path":"runtime_contract","requested_change":"Support A"}}]';
  v_result jsonb;
  v_draft1 uuid;
  v_draft2 uuid;
  v_before bigint;
begin
  insert into public.experiments values(v_origin,1,'Revision fixture','Fixture','[{"path":"main","content":"revision one"}]');
  v_result := public.submit_structured_extension_closure(
    p_origin_experiment_id=>v_origin,p_origin_experiment_revision=>1,
    p_publication_identifier=>'test:revision',p_publication_title=>'Fixture',
    p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
    p_identified_requirements=>v_requirements,p_requests=>v_requests);
  v_draft1 := (v_result->'blocked_experiment'->>'id')::uuid;

  -- Same revision continues the existing immutable snapshot.
  v_requests := jsonb_build_array(jsonb_build_object(
    'existing_request_id',v_result->'requests'->0->>'id','requirement_keys','["a"]'::jsonb));
  v_result := public.submit_structured_extension_closure(
    p_origin_experiment_id=>v_origin,p_origin_experiment_revision=>1,
    p_publication_identifier=>'test:revision',p_publication_title=>'Fixture',
    p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
    p_identified_requirements=>v_requirements,p_requests=>v_requests);
  assert (v_result->'blocked_experiment'->>'id')::uuid = v_draft1;

  update public.experiments set revision=2,artifacts='[{"path":"main","content":"revision two"}]' where id=v_origin;
  select count(*) into v_before from public.capability_closure_analyses;
  begin
    perform public.submit_structured_extension_closure(
      p_blocked_experiment_id=>v_draft1,p_origin_experiment_id=>v_origin,p_origin_experiment_revision=>2,
      p_publication_identifier=>'test:revision',p_publication_title=>'Fixture',
      p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
      p_identified_requirements=>v_requirements,p_requests=>v_requests);
    raise exception 'Expected explicit stale draft to reject revision two';
  exception when invalid_parameter_value then
    assert sqlerrm like 'Blocked Experiment origin revision conflict.%';
  end;
  assert (select count(*) from public.capability_closure_analyses)=v_before;

  v_requests := '[{"request_class":"runtime_configuration","requirement_keys":["a"],"novelty_statement":"A second gap","candidate_contract_delta":{"delta_key":"test.revision2","delta_name":"A2","target_contract_path":"runtime_contract","requested_change":"Support A2"}}]';
  v_result := public.submit_structured_extension_closure(
    p_origin_experiment_id=>v_origin,p_origin_experiment_revision=>2,
    p_publication_identifier=>'test:revision',p_publication_title=>'Fixture',
    p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
    p_identified_requirements=>v_requirements,p_requests=>v_requests);
  v_draft2 := (v_result->'blocked_experiment'->>'id')::uuid;
  assert v_draft2 <> v_draft1;
  assert (v_result->'blocked_experiment'->>'origin_experiment_revision')::int=2;
  assert (select origin_experiment_revision=2 and draft_artifacts='[{"path":"main","content":"revision two"}]'::jsonb
    from public.capability_requests where id=(v_result->'requests'->0->>'id')::uuid);

  -- A blocked-ID-only continuation retains the saved origin instead of writing NULL.
  v_requests := jsonb_set(v_requests,'{0,candidate_contract_delta,delta_key}','"test.revision1.continuation"');
  v_result := public.submit_structured_extension_closure(
    p_blocked_experiment_id=>v_draft1,
    p_publication_identifier=>'test:revision',p_publication_title=>'Fixture',
    p_contract_version=>'test/1',p_analysis_status=>'best_effort_complete',
    p_identified_requirements=>v_requirements,p_requests=>v_requests);
  assert (select origin_experiment_id=v_origin and origin_experiment_revision=1
    and draft_artifacts='[{"path":"main","content":"revision one"}]'::jsonb
    from public.capability_requests where id=(v_result->'requests'->0->>'id')::uuid);
end;
$$;
rollback;
