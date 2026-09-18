-- Virtual Lab capability-closure reconciliation repair for #313 / #58.8.
-- Live Grok acceptance showed that repeated request_capability calls created
-- separate blocked Experiments and duplicate requested rows. This repair makes
-- initial submission convergent while preserving existing request lifecycle state.

create or replace function private.reconcile_capability_request(
  p_request_id uuid,
  p_closure_analysis_id uuid,
  p_requirement_keys jsonb
)
returns public.capability_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.capability_requests;
  v_keys jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_request_id is null or p_closure_analysis_id is null then
    raise exception 'request_id and closure_analysis_id are required.';
  end if;

  if jsonb_typeof(p_requirement_keys) <> 'array'
     or jsonb_array_length(p_requirement_keys) = 0 then
    raise exception 'requirement_keys must be a non-empty JSON array.';
  end if;

  select r.* into v_request
  from public.capability_requests r
  where r.id = p_request_id
    and r.requester_id = v_user_id
    and r.status in ('requested', 'approved', 'in_progress')
  for update;

  if not found then
    raise exception 'Capability request was not found, is not owned by the caller, or is terminal.';
  end if;

  if not exists (
    select 1
    from public.capability_closure_analyses a
    join public.blocked_experiment_drafts d
      on d.id = a.blocked_experiment_id
    where a.id = p_closure_analysis_id
      and d.requester_id = v_user_id
  ) then
    raise exception 'Closure analysis does not belong to the caller.';
  end if;

  select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
  into v_keys
  from (
    select distinct value as k
    from (
      select value
      from jsonb_array_elements_text(coalesce(v_request.requirement_keys, '[]'::jsonb))
      union all
      select value
      from jsonb_array_elements_text(p_requirement_keys)
    ) all_keys
  ) deduplicated;

  update public.capability_requests
  set closure_analysis_id = p_closure_analysis_id,
      requirement_keys = v_keys,
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function private.reconcile_capability_request(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.reconcile_capability_request(uuid, uuid, jsonb)
  to authenticated;

create or replace function public.submit_capability_closure(
  p_origin_experiment_id uuid default null,
  p_origin_experiment_revision bigint default null,
  p_draft_title text default null,
  p_draft_description text default null,
  p_draft_artifacts jsonb default null,
  p_source_context text default '',
  p_contract_version text default null,
  p_analysis_status text default null,
  p_identified_requirements jsonb default '[]'::jsonb,
  p_unresolved_ambiguities jsonb default '[]'::jsonb,
  p_requests jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_origin public.experiments;
  v_title text;
  v_description text;
  v_artifacts jsonb;
  v_draft public.blocked_experiment_drafts;
  v_previous public.capability_closure_analyses;
  v_analysis public.capability_closure_analyses;
  v_request jsonb;
  v_request_row public.capability_requests;
  v_request_rows jsonb := '[]'::jsonb;
  v_requirement_key text;
  v_next_sequence bigint := 1;
  v_reused_draft boolean := false;
  v_identified_requirements jsonb := p_identified_requirements;
  v_unresolved_ambiguities jsonb := p_unresolved_ambiguities;
  v_effective_analysis_status text := p_analysis_status;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role not in ('student', 'professor') then
    raise exception 'Capability closure submission requires a Student or Professor profile.';
  end if;

  if p_origin_experiment_revision is not null and p_origin_experiment_id is null then
    raise exception 'origin_experiment_revision requires origin_experiment_id.';
  end if;

  if p_origin_experiment_id is not null then
    select * into v_origin
    from public.experiments e
    where e.id = p_origin_experiment_id;

    if not found then
      raise exception 'Originating Experiment was not found or is not visible.';
    end if;

    if p_origin_experiment_revision is not null
       and v_origin.revision <> p_origin_experiment_revision then
      raise exception
        'Originating Experiment revision conflict: current %, requested %.',
        v_origin.revision,
        p_origin_experiment_revision;
    end if;
  end if;

  v_title := nullif(btrim(coalesce(p_draft_title, v_origin.title)), '');
  v_description := coalesce(p_draft_description, v_origin.description, '');
  v_artifacts := coalesce(p_draft_artifacts, v_origin.artifacts, '[]'::jsonb);

  if v_title is null then
    raise exception 'Blocked Experiment title is required.';
  end if;
  if jsonb_typeof(v_artifacts) <> 'array' then
    raise exception 'draft_artifacts must be a JSON array.';
  end if;
  if jsonb_array_length(v_artifacts) = 0
     and length(btrim(v_description)) = 0
     and length(btrim(coalesce(p_source_context, ''))) = 0 then
    raise exception 'A title alone is not enough to preserve a blocked Experiment.';
  end if;

  if nullif(btrim(coalesce(p_contract_version, '')), '') is null then
    raise exception 'contract_version is required.';
  end if;
  if p_analysis_status not in ('best_effort_complete', 'partial_due_to_ambiguity') then
    raise exception 'analysis_status must be best_effort_complete or partial_due_to_ambiguity.';
  end if;
  if jsonb_typeof(p_identified_requirements) <> 'array'
     or jsonb_array_length(p_identified_requirements) = 0 then
    raise exception 'identified_requirements must contain the known unsupported scientific requirements.';
  end if;
  if jsonb_typeof(p_unresolved_ambiguities) <> 'array' then
    raise exception 'unresolved_ambiguities must be a JSON array.';
  end if;
  if jsonb_typeof(p_requests) <> 'array' then
    raise exception 'requests must be a JSON array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_identified_requirements) req
    where nullif(btrim(req ->> 'key'), '') is null
       or nullif(btrim(req ->> 'summary'), '') is null
       or nullif(btrim(req ->> 'evidence'), '') is null
       or coalesce(req ->> 'resolution_status', '') not in ('clear', 'ambiguous')
  ) then
    raise exception 'Each identified requirement needs key, summary, evidence and clear|ambiguous resolution_status.';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_identified_requirements)
  ) <> (
    select count(distinct req ->> 'key')
    from jsonb_array_elements(p_identified_requirements) req
  ) then
    raise exception 'identified_requirements keys must be unique.';
  end if;

  if p_analysis_status = 'best_effort_complete' then
    if jsonb_array_length(p_unresolved_ambiguities) <> 0
       or exists (
         select 1
         from jsonb_array_elements(p_identified_requirements) req
         where req ->> 'resolution_status' = 'ambiguous'
       ) then
      raise exception 'best_effort_complete cannot contain unresolved scientific ambiguity.';
    end if;
    if jsonb_array_length(p_requests) = 0 then
      raise exception 'best_effort_complete blocked analysis must contain at least one grouped capability request.';
    end if;
  else
    if jsonb_array_length(p_unresolved_ambiguities) = 0 then
      raise exception 'partial_due_to_ambiguity requires at least one unresolved ambiguity.';
    end if;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_unresolved_ambiguities) amb
    where nullif(btrim(amb ->> 'key'), '') is null
       or nullif(btrim(amb ->> 'requirement_key'), '') is null
       or nullif(btrim(amb ->> 'question'), '') is null
       or not exists (
         select 1
         from jsonb_array_elements(p_identified_requirements) req
         where req ->> 'key' = amb ->> 'requirement_key'
           and req ->> 'resolution_status' = 'ambiguous'
       )
  ) then
    raise exception 'Every ambiguity must reference an identified ambiguous requirement.';
  end if;

  if p_origin_experiment_id is not null then
    select d.* into v_draft
    from public.blocked_experiment_drafts d
    where d.requester_id = v_user_id
      and d.lifecycle = 'blocked'
      and d.origin_experiment_id = p_origin_experiment_id
    order by d.created_at asc
    limit 1
    for update;
  else
    select d.* into v_draft
    from public.blocked_experiment_drafts d
    where d.requester_id = v_user_id
      and d.lifecycle = 'blocked'
      and d.origin_experiment_id is null
      and lower(btrim(d.title)) = lower(v_title)
    order by d.created_at asc
    limit 1
    for update;
  end if;

  if found then
    v_reused_draft := true;

    select a.* into v_previous
    from public.capability_closure_analyses a
    where a.blocked_experiment_id = v_draft.id
    order by a.analysis_sequence desc
    limit 1;

    if found then
      v_next_sequence := v_previous.analysis_sequence + 1;

      select coalesce(jsonb_agg(m.item order by m.key), '[]'::jsonb)
      into v_identified_requirements
      from (
        select distinct on (s.key) s.key, s.item
        from (
          select req ->> 'key' as key, req as item, 0 as precedence
          from jsonb_array_elements(v_previous.identified_requirements) req
          union all
          select req ->> 'key' as key, req as item, 1 as precedence
          from jsonb_array_elements(p_identified_requirements) req
        ) s
        order by s.key, s.precedence desc
      ) m;

      select coalesce(jsonb_agg(m.item order by m.key), '[]'::jsonb)
      into v_unresolved_ambiguities
      from (
        select distinct on (s.key) s.key, s.item
        from (
          select amb ->> 'key' as key, amb as item, 0 as precedence
          from jsonb_array_elements(v_previous.unresolved_ambiguities) amb
          union all
          select amb ->> 'key' as key, amb as item, 1 as precedence
          from jsonb_array_elements(p_unresolved_ambiguities) amb
        ) s
        order by s.key, s.precedence desc
      ) m;

      if jsonb_array_length(v_unresolved_ambiguities) > 0
         or exists (
           select 1
           from jsonb_array_elements(v_identified_requirements) req
           where req ->> 'resolution_status' = 'ambiguous'
         ) then
        v_effective_analysis_status := 'partial_due_to_ambiguity';
      else
        v_effective_analysis_status := 'best_effort_complete';
      end if;
    end if;
  else
    insert into public.blocked_experiment_drafts (
      requester_id,
      requester_role,
      origin_experiment_id,
      origin_experiment_revision,
      title,
      description,
      artifacts,
      source_context
    )
    values (
      v_user_id,
      v_role,
      v_origin.id,
      v_origin.revision,
      v_title,
      v_description,
      v_artifacts,
      coalesce(p_source_context, '')
    )
    returning * into v_draft;
  end if;

  insert into public.capability_closure_analyses (
    blocked_experiment_id,
    analyst_id,
    analysis_sequence,
    contract_version,
    analysis_status,
    identified_requirements,
    unresolved_ambiguities
  )
  values (
    v_draft.id,
    v_user_id,
    v_next_sequence,
    btrim(p_contract_version),
    v_effective_analysis_status,
    v_identified_requirements,
    v_unresolved_ambiguities
  )
  returning * into v_analysis;

  for v_request in
    select value
    from jsonb_array_elements(p_requests)
  loop
    if nullif(btrim(v_request ->> 'capability_domain'), '') is null
       or nullif(btrim(v_request ->> 'capability_name'), '') is null
       or jsonb_typeof(v_request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(v_request -> 'requirement_keys') = 0 then
      raise exception 'Each grouped request needs capability_domain, capability_name and requirement_keys.';
    end if;

    for v_requirement_key in
      select value
      from jsonb_array_elements_text(v_request -> 'requirement_keys')
    loop
      if not exists (
        select 1
        from jsonb_array_elements(p_identified_requirements) req
        where req ->> 'key' = v_requirement_key
          and req ->> 'resolution_status' = 'clear'
      ) then
        raise exception
          'Grouped request references requirement % that is absent or scientifically ambiguous.',
          v_requirement_key;
      end if;
    end loop;

    select r.* into v_request_row
    from public.capability_requests r
    where r.requester_id = v_user_id
      and lower(btrim(r.capability_domain)) = lower(btrim(v_request ->> 'capability_domain'))
      and lower(btrim(r.capability_name)) = lower(btrim(v_request ->> 'capability_name'))
      and r.status in ('requested', 'approved', 'in_progress')
      and (
        r.closure_analysis_id is null
        or exists (
          select 1
          from public.capability_closure_analyses linked_analysis
          where linked_analysis.id = r.closure_analysis_id
            and linked_analysis.blocked_experiment_id = v_draft.id
        )
      )
    order by
      case r.status
        when 'in_progress' then 3
        when 'approved' then 2
        when 'requested' then 1
        else 0
      end desc,
      r.created_at asc
    limit 1;

    if found then
      select * into v_request_row
      from private.reconcile_capability_request(
        v_request_row.id,
        v_analysis.id,
        v_request -> 'requirement_keys'
      );

      v_request_rows := v_request_rows || jsonb_build_array(
        to_jsonb(v_request_row) || jsonb_build_object('reused_existing', true)
      );
    else
      insert into public.capability_requests (
        requester_id,
        requester_role,
        origin_experiment_id,
        origin_experiment_revision,
        draft_title,
        draft_description,
        draft_artifacts,
        capability_domain,
        capability_name,
        context,
        requested_artifact_type,
        requested_lifecycle_hook,
        status,
        closure_analysis_id,
        requirement_keys
      )
      values (
        v_user_id,
        v_role,
        v_origin.id,
        v_origin.revision,
        v_draft.title,
        v_draft.description,
        v_draft.artifacts,
        btrim(v_request ->> 'capability_domain'),
        btrim(v_request ->> 'capability_name'),
        coalesce(v_request ->> 'context', ''),
        nullif(btrim(v_request ->> 'requested_artifact_type'), ''),
        nullif(btrim(v_request ->> 'requested_lifecycle_hook'), ''),
        'requested',
        v_analysis.id,
        v_request -> 'requirement_keys'
      )
      returning * into v_request_row;

      v_request_rows := v_request_rows || jsonb_build_array(
        to_jsonb(v_request_row) || jsonb_build_object('reused_existing', false)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'blocked_experiment', to_jsonb(v_draft),
    'reused_blocked_experiment', v_reused_draft,
    'analysis', to_jsonb(v_analysis),
    'requests', v_request_rows
  );
end;
$$;

revoke all on function public.submit_capability_closure(
  uuid, bigint, text, text, jsonb, text, text, text, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.submit_capability_closure(
  uuid, bigint, text, text, jsonb, text, text, text, jsonb, jsonb, jsonb
) to authenticated;
