-- #466: make capability-request evidence complete and lossless.
-- Scientific decomposition is intentionally outside this migration. It only
-- enforces that clear unsupported requirements are routed without silent
-- evidence loss.

create or replace function private.require_extension_requirement_coverage(
  p_analysis_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_analysis public.capability_closure_analyses;
  v_missing text[];
begin
  select * into strict v_analysis
  from public.capability_closure_analyses
  where id = p_analysis_id;

  select array_agg(req ->> 'key' order by req ->> 'key')
  into v_missing
  from jsonb_array_elements(v_analysis.identified_requirements) req
  where req ->> 'resolution_status' = 'clear'
    and not exists (
      select 1
      from public.capability_request_evidence e
      join public.capability_closure_analyses source_analysis
        on source_analysis.id = e.closure_analysis_id
      join public.active_extension_request_catalog c
        on c.request_id = e.request_id
      where source_analysis.blocked_experiment_id = v_analysis.blocked_experiment_id
        and e.requirement_keys ? (req ->> 'key')
        and exists (
          select 1
          from jsonb_array_elements(source_analysis.identified_requirements) previous_req
          where previous_req ->> 'key' = req ->> 'key'
            and previous_req ->> 'summary' = req ->> 'summary'
            and previous_req ->> 'resolution_status' = 'clear'
        )
    );

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'Unrequested clear requirements: %. Attach a new or existing request for each.',
      array_to_string(v_missing, ', ')
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function private.require_extension_requirement_coverage(uuid)
  from public, anon;
grant execute on function private.require_extension_requirement_coverage(uuid)
  to authenticated;

create or replace function private.enforce_extension_requirement_coverage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_extension_requirement_coverage(new.id);
  return new;
end;
$$;

revoke all on function private.enforce_extension_requirement_coverage()
  from public, anon, authenticated;

drop trigger if exists enforce_extension_requirement_coverage
  on public.capability_closure_analyses;
create constraint trigger enforce_extension_requirement_coverage
after insert on public.capability_closure_analyses
deferrable initially deferred
for each row
execute function private.enforce_extension_requirement_coverage();

create or replace function private.legacy_extension_requests_from_candidates(
  p_requests jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_request jsonb;
  v_spec jsonb;
  v_class text;
  v_result jsonb := '[]'::jsonb;
  v_relation text;
begin
  if jsonb_typeof(p_requests) <> 'array' then
    raise exception 'requests must be a JSON array.';
  end if;

  -- One evidence row is keyed by (request_id, closure_analysis_id). A repeated
  -- reuse entry would otherwise silently discard requirement_keys in the
  -- lower-level insert and let the later structured pass overwrite the
  -- relationship/generalization note. Require one grouped link instead.
  if exists (
    select 1
    from jsonb_array_elements(p_requests) request
    where nullif(request ->> 'existing_request_id', '') is not null
    group by (request ->> 'existing_request_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'Each existing_request_id may appear only once. Combine requirement_keys and retain any generalization_needed evidence.'
      using errcode = '22023';
  end if;

  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    if jsonb_typeof(v_request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(v_request -> 'requirement_keys') = 0 then
      raise exception 'Each request link needs requirement_keys.';
    end if;

    if nullif(v_request ->> 'existing_request_id', '') is not null then
      if v_request ? 'candidate_capability' or v_request ? 'candidate_contract_delta' then
        raise exception 'A reused candidate cannot also define a new candidate.';
      end if;

      v_relation := coalesce(nullif(v_request ->> 'relationship', ''), 'covered');
      if v_relation not in ('covered', 'generalization_needed') then
        raise exception 'relationship must be covered or generalization_needed.';
      end if;
      if v_relation = 'generalization_needed'
         and nullif(btrim(coalesce(v_request ->> 'generalization_note', '')), '') is null then
        raise exception 'generalization_needed evidence requires generalization_note.';
      end if;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'existing_request_id', v_request ->> 'existing_request_id',
        'requirement_keys', v_request -> 'requirement_keys'
      ));
      continue;
    end if;

    v_class := nullif(btrim(v_request ->> 'request_class'), '');
    if v_class = 'semantic_capability' then
      v_spec := v_request -> 'candidate_capability';
      if jsonb_typeof(v_spec) <> 'object'
         or nullif(btrim(v_spec ->> 'capability_key'), '') is null
         or nullif(btrim(v_spec ->> 'capability_domain'), '') is null
         or nullif(btrim(v_spec ->> 'capability_name'), '') is null
         or nullif(btrim(v_spec ->> 'scientific_definition'), '') is null
         or nullif(btrim(v_spec ->> 'target_artifact'), '') is null
         or nullif(btrim(v_spec ->> 'target_runtime_domain'), '') is null
         or jsonb_typeof(v_spec -> 'authoring_surfaces') <> 'array'
         or jsonb_array_length(v_spec -> 'authoring_surfaces') = 0 then
        raise exception 'A semantic request requires one complete candidate_capability.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_spec -> 'authoring_surfaces') surface
        where jsonb_typeof(surface) <> 'object'
           or nullif(btrim(surface ->> 'artifact'), '') is null
           or nullif(btrim(surface ->> 'kind'), '') is null
           or nullif(btrim(surface ->> 'symbol'), '') is null
      ) then
        raise exception 'Each candidate capability authoring surface needs artifact, kind and symbol.';
      end if;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'request_class', v_class,
        'extension_key', btrim(v_spec ->> 'capability_key'),
        'extension_domain', btrim(v_spec ->> 'capability_domain'),
        'extension_name', btrim(v_spec ->> 'capability_name'),
        'extension_definition', btrim(v_spec ->> 'scientific_definition'),
        'novelty_statement', btrim(v_request ->> 'novelty_statement'),
        'requirement_keys', v_request -> 'requirement_keys',
        'context', coalesce(v_request ->> 'context', ''),
        'requested_artifact_type', btrim(v_spec ->> 'target_artifact'),
        'requested_lifecycle_hook', nullif(btrim(v_request ->> 'requested_lifecycle_hook'), '')
      ));
    elsif v_class in (
      'authoring_language',
      'runtime_configuration',
      'artifact_workflow',
      'implementation_optimization',
      'security_boundary'
    ) then
      v_spec := v_request -> 'candidate_contract_delta';
      if jsonb_typeof(v_spec) <> 'object'
         or nullif(btrim(v_spec ->> 'delta_key'), '') is null
         or nullif(btrim(v_spec ->> 'delta_name'), '') is null
         or nullif(btrim(v_spec ->> 'target_contract_path'), '') is null
         or nullif(btrim(v_spec ->> 'requested_change'), '') is null then
        raise exception 'A non-semantic request requires one complete candidate_contract_delta.';
      end if;
      if (v_spec ->> 'target_contract_path') !~
        '^(runtime_contract|artifacts\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\.|$)' then
        raise exception 'candidate_contract_delta target_contract_path does not reference the stable authoring/platform contract.';
      end if;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'request_class', v_class,
        'extension_key', btrim(v_spec ->> 'delta_key'),
        'extension_domain', 'authoring_contract',
        'extension_name', btrim(v_spec ->> 'delta_name'),
        'extension_definition', btrim(v_spec ->> 'requested_change'),
        'novelty_statement', btrim(v_request ->> 'novelty_statement'),
        'requirement_keys', v_request -> 'requirement_keys',
        'context', coalesce(v_request ->> 'context', ''),
        'requested_lifecycle_hook', nullif(btrim(v_request ->> 'requested_lifecycle_hook'), '')
      ));
    else
      raise exception 'A new request needs one valid request_class.';
    end if;

    if nullif(btrim(coalesce(v_request ->> 'novelty_statement', '')), '') is null then
      raise exception 'A genuinely new candidate requires novelty_statement.';
    end if;
  end loop;

  return v_result;
end;
$$;
