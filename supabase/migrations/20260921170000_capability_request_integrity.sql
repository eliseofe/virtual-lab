-- Capability request integrity: every clear unsupported requirement must be routed.
-- An unchanged requirement may retain its previously linked unavailable request.
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
  from public.capability_closure_analyses where id = p_analysis_id;

  select array_agg(req ->> 'key' order by req ->> 'key') into v_missing
  from jsonb_array_elements(v_analysis.identified_requirements) req
  where req ->> 'resolution_status' = 'clear'
    and not exists (
      select 1
      from public.capability_request_evidence e
      join public.capability_closure_analyses source_analysis
        on source_analysis.id = e.closure_analysis_id
      join public.active_extension_request_catalog c on c.request_id = e.request_id
      where source_analysis.blocked_experiment_id = v_analysis.blocked_experiment_id
        and e.requirement_keys ? (req ->> 'key')
        and exists (
          select 1 from jsonb_array_elements(source_analysis.identified_requirements) previous_req
          where previous_req ->> 'key' = req ->> 'key'
            and previous_req ->> 'summary' = req ->> 'summary'
            and previous_req ->> 'resolution_status' = 'clear'
        )
    );

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'Unrequested clear requirements: %. Attach a new or existing request for each.',
      array_to_string(v_missing, ', ') using errcode = '23514';
  end if;
end;
$$;

revoke all on function private.require_extension_requirement_coverage(uuid) from public, anon;
grant execute on function private.require_extension_requirement_coverage(uuid) to authenticated;

create or replace function public.submit_extension_closure(
  p_blocked_experiment_id uuid default null,
  p_origin_experiment_id uuid default null,
  p_origin_experiment_revision bigint default null,
  p_draft_title text default null,
  p_draft_description text default null,
  p_draft_artifacts jsonb default null,
  p_source_context text default '',
  p_publication_identifier text default null,
  p_publication_title text default null,
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
  v_catalog public.active_extension_request_catalog;
  v_request_rows jsonb := '[]'::jsonb;
  v_requirement_key text;
  v_existing_request_id uuid;
  v_canonical_id uuid;
  v_canonical public.canonical_capabilities;
  v_class text;
  v_next_sequence bigint := 1;
  v_reused_draft boolean := false;
  v_identified_requirements jsonb := p_identified_requirements;
  v_unresolved_ambiguities jsonb := p_unresolved_ambiguities;
  v_effective_analysis_status text := p_analysis_status;
  v_keys jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role not in ('student', 'professor') then
    raise exception 'Extension submission requires a Student or Professor profile.';
  end if;

  if nullif(btrim(coalesce(p_publication_identifier, '')), '') is null
     or nullif(btrim(coalesce(p_publication_title, '')), '') is null then
    raise exception 'A source publication identifier and title are required.';
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

  if nullif(btrim(coalesce(p_contract_version, '')), '') is null then
    raise exception 'contract_version is required.';
  end if;
  if p_analysis_status not in ('best_effort_complete', 'partial_due_to_ambiguity') then
    raise exception 'analysis_status must be best_effort_complete or partial_due_to_ambiguity.';
  end if;
  if jsonb_typeof(p_identified_requirements) <> 'array'
     or jsonb_array_length(p_identified_requirements) = 0 then
    raise exception 'identified_requirements must contain the known unsupported requirements.';
  end if;
  if jsonb_typeof(p_unresolved_ambiguities) <> 'array'
     or jsonb_typeof(p_requests) <> 'array' then
    raise exception 'ambiguities and requests must be JSON arrays.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_identified_requirements) req
    where nullif(btrim(req ->> 'key'), '') is null
       or nullif(btrim(req ->> 'summary'), '') is null
       or nullif(btrim(req ->> 'evidence'), '') is null
       or coalesce(req ->> 'resolution_status', '') not in ('clear', 'ambiguous')
  ) then
    raise exception 'Each identified requirement needs key, summary, evidence and clear|ambiguous resolution_status.';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_identified_requirements)
  ) <> (
    select count(distinct req ->> 'key')
    from jsonb_array_elements(p_identified_requirements) req
  ) then
    raise exception 'identified_requirements keys must be unique.';
  end if;

  if p_analysis_status = 'best_effort_complete' then
    if jsonb_array_length(p_unresolved_ambiguities) <> 0
       or exists (
         select 1 from jsonb_array_elements(p_identified_requirements) req
         where req ->> 'resolution_status' = 'ambiguous'
       ) then
      raise exception 'best_effort_complete cannot contain unresolved ambiguity.';
    end if;
    if jsonb_array_length(p_requests) = 0 then
      raise exception 'best_effort_complete blocked analysis must contain at least one extension request.';
    end if;
  elsif jsonb_array_length(p_unresolved_ambiguities) = 0 then
    raise exception 'partial_due_to_ambiguity requires at least one unresolved ambiguity.';
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

  if p_blocked_experiment_id is not null then
    select d.* into v_draft
    from public.blocked_experiment_drafts d
    where d.id = p_blocked_experiment_id
      and d.requester_id = v_user_id
      and d.lifecycle = 'blocked'
    for update;

    if not found then
      raise exception 'Blocked Experiment was not found, is not owned by the caller, or is no longer blocked.';
    end if;

    if v_draft.publication_identifier is distinct from btrim(p_publication_identifier)
       or v_draft.publication_title is distinct from btrim(p_publication_title) then
      raise exception 'A blocked Experiment keeps one stable source publication identity.';
    end if;

    v_reused_draft := true;
  elsif p_origin_experiment_id is not null then
    select d.* into v_draft
    from public.blocked_experiment_drafts d
    where d.requester_id = v_user_id
      and d.lifecycle = 'blocked'
      and d.origin_experiment_id = p_origin_experiment_id
      and d.publication_identifier = btrim(p_publication_identifier)
    order by d.created_at asc
    limit 1
    for update;

    if found then
      v_reused_draft := true;
    end if;
  end if;

  if not v_reused_draft then
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

    insert into public.blocked_experiment_drafts (
      requester_id,
      requester_role,
      origin_experiment_id,
      origin_experiment_revision,
      title,
      description,
      artifacts,
      source_context,
      publication_identifier,
      publication_title
    )
    values (
      v_user_id,
      v_role,
      v_origin.id,
      v_origin.revision,
      v_title,
      v_description,
      v_artifacts,
      coalesce(p_source_context, ''),
      btrim(p_publication_identifier),
      btrim(p_publication_title)
    )
    returning * into v_draft;
  end if;

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
         select 1 from jsonb_array_elements(v_identified_requirements) req
         where req ->> 'resolution_status' = 'ambiguous'
       ) then
      v_effective_analysis_status := 'partial_due_to_ambiguity';
    else
      v_effective_analysis_status := 'best_effort_complete';
    end if;
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

  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    if jsonb_typeof(v_request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(v_request -> 'requirement_keys') = 0 then
      raise exception 'Each request link needs requirement_keys.';
    end if;

    for v_requirement_key in
      select value from jsonb_array_elements_text(v_request -> 'requirement_keys')
    loop
      if not exists (
        select 1 from jsonb_array_elements(p_identified_requirements) req
        where req ->> 'key' = v_requirement_key
          and req ->> 'resolution_status' = 'clear'
      ) then
        raise exception 'Request link references requirement % that is absent or ambiguous.', v_requirement_key;
      end if;
    end loop;

    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;

    if v_existing_request_id is not null then
      select c.* into v_catalog
      from public.active_extension_request_catalog c
      where c.request_id = v_existing_request_id;

      if not found then
        raise exception 'existing_request_id must reference an active extension request.';
      end if;

      insert into public.capability_request_evidence (
        request_id,
        closure_analysis_id,
        linked_by,
        requirement_keys
      )
      values (
        v_catalog.request_id,
        v_analysis.id,
        v_user_id,
        v_request -> 'requirement_keys'
      )
      on conflict (request_id, closure_analysis_id) do nothing;

      v_request_rows := v_request_rows || jsonb_build_array(
        to_jsonb(v_catalog) || jsonb_build_object('reused_existing', true)
      );
    else
      v_class := nullif(btrim(v_request ->> 'request_class'), '');
      if v_class not in (
        'semantic_capability',
        'authoring_language',
        'runtime_configuration',
        'artifact_workflow',
        'implementation_optimization',
        'security_boundary'
      ) then
        raise exception 'A new request needs one valid request_class.';
      end if;

      if nullif(btrim(v_request ->> 'extension_key'), '') is null
         or nullif(btrim(v_request ->> 'extension_domain'), '') is null
         or nullif(btrim(v_request ->> 'extension_name'), '') is null
         or nullif(btrim(v_request ->> 'extension_definition'), '') is null
         or nullif(btrim(v_request ->> 'novelty_statement'), '') is null then
        raise exception 'A new request needs key, domain, scientific name, scientific definition and novelty_statement.';
      end if;

      if v_class = 'semantic_capability' then
        select c.* into v_canonical
        from public.canonical_capabilities c
        where c.capability_key = btrim(v_request ->> 'extension_key');

        if found then
          raise exception 'The proposed semantic key already has canonical capability identity; use the current capability/request state.';
        end if;
      end if;

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
        requirement_keys,
        request_class,
        extension_key,
        extension_domain,
        extension_name,
        extension_definition,
        novelty_statement,
        canonical_capability_id,
        publication_identifier,
        publication_title
      )
      values (
        v_user_id,
        v_role,
        v_origin.id,
        v_origin.revision,
        v_draft.title,
        v_draft.description,
        v_draft.artifacts,
        btrim(v_request ->> 'extension_domain'),
        btrim(v_request ->> 'extension_name'),
        coalesce(v_request ->> 'context', ''),
        nullif(btrim(v_request ->> 'requested_artifact_type'), ''),
        nullif(btrim(v_request ->> 'requested_lifecycle_hook'), ''),
        'requested',
        v_analysis.id,
        v_request -> 'requirement_keys',
        v_class,
        btrim(v_request ->> 'extension_key'),
        btrim(v_request ->> 'extension_domain'),
        btrim(v_request ->> 'extension_name'),
        btrim(v_request ->> 'extension_definition'),
        btrim(v_request ->> 'novelty_statement'),
        null,
        btrim(p_publication_identifier),
        btrim(p_publication_title)
      )
      returning * into v_request_row;

      insert into public.capability_request_evidence (
        request_id,
        closure_analysis_id,
        linked_by,
        requirement_keys
      )
      values (
        v_request_row.id,
        v_analysis.id,
        v_user_id,
        v_request -> 'requirement_keys'
      )
      on conflict (request_id, closure_analysis_id) do nothing;

      v_request_rows := v_request_rows || jsonb_build_array(
        to_jsonb(v_request_row) || jsonb_build_object('reused_existing', false)
      );
    end if;
  end loop;

  perform private.require_extension_requirement_coverage(v_analysis.id);

  return jsonb_build_object(
    'blocked_experiment', to_jsonb(v_draft),
    'reused_blocked_experiment', v_reused_draft,
    'analysis', to_jsonb(v_analysis),
    'requests', v_request_rows
  );
end;
$$;

create or replace function public.revalidate_extension_closure(
  p_blocked_experiment_id uuid,
  p_base_analysis_sequence bigint,
  p_contract_version text,
  p_analysis_status text,
  p_identified_requirements jsonb default '[]'::jsonb,
  p_unresolved_ambiguities jsonb default '[]'::jsonb,
  p_new_requests jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_draft public.blocked_experiment_drafts;
  v_previous public.capability_closure_analyses;
  v_analysis public.capability_closure_analyses;
  v_request jsonb;
  v_request_row public.capability_requests;
  v_catalog public.active_extension_request_catalog;
  v_request_rows jsonb := '[]'::jsonb;
  v_requirement_key text;
  v_class text;
  v_canonical_id uuid;
  v_canonical public.canonical_capabilities;
  v_existing_request_id uuid;
  v_keys jsonb;
  v_next_sequence bigint;
  v_resolved_keys jsonb := '[]'::jsonb;
  v_remaining_keys jsonb := '[]'::jsonb;
  v_new_keys jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role not in ('student', 'professor') then
    raise exception 'Extension-closure revalidation requires a Student or Professor profile.';
  end if;

  if p_analysis_status not in ('best_effort_complete', 'partial_due_to_ambiguity', 'unblocked') then
    raise exception 'Invalid analysis_status.';
  end if;
  if jsonb_typeof(p_identified_requirements) <> 'array'
     or jsonb_typeof(p_unresolved_ambiguities) <> 'array'
     or jsonb_typeof(p_new_requests) <> 'array' then
    raise exception 'Requirements, ambiguities and new_requests must be arrays.';
  end if;

  select d.* into v_draft
  from public.blocked_experiment_drafts d
  where d.id = p_blocked_experiment_id
    and (
      d.requester_id = v_user_id
      or v_role = 'professor'
    )
  for update;

  if not found then
    raise exception 'Blocked Experiment was not found or is not visible.';
  end if;

  select a.* into v_previous
  from public.capability_closure_analyses a
  where a.blocked_experiment_id = v_draft.id
  order by a.analysis_sequence desc
  limit 1;

  if not found or v_previous.analysis_sequence <> p_base_analysis_sequence then
    raise exception 'Closure analysis conflict.';
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
    select count(*) from jsonb_array_elements(p_identified_requirements)
  ) <> (
    select count(distinct req ->> 'key')
    from jsonb_array_elements(p_identified_requirements) req
  ) then
    raise exception 'identified_requirements keys must be unique.';
  end if;

  if p_analysis_status = 'unblocked' then
    if jsonb_array_length(p_identified_requirements) <> 0
       or jsonb_array_length(p_unresolved_ambiguities) <> 0
       or jsonb_array_length(p_new_requests) <> 0 then
      raise exception 'unblocked requires zero unsupported requirements, zero ambiguity, and zero new requests.';
    end if;
  elsif p_analysis_status = 'best_effort_complete' then
    if jsonb_array_length(p_identified_requirements) = 0 then
      raise exception 'best_effort_complete revalidation must retain at least one unsupported requirement.';
    end if;
    if jsonb_array_length(p_unresolved_ambiguities) <> 0
       or exists (
         select 1
         from jsonb_array_elements(p_identified_requirements) req
         where req ->> 'resolution_status' = 'ambiguous'
       ) then
      raise exception 'best_effort_complete cannot contain unresolved ambiguity.';
    end if;
  else
    if jsonb_array_length(p_unresolved_ambiguities) = 0
       or not exists (
         select 1
         from jsonb_array_elements(p_identified_requirements) req
         where req ->> 'resolution_status' = 'ambiguous'
       ) then
      raise exception 'partial_due_to_ambiguity requires an ambiguous requirement and unresolved ambiguity.';
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

  v_next_sequence := v_previous.analysis_sequence + 1;

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
    p_analysis_status,
    p_identified_requirements,
    p_unresolved_ambiguities
  )
  returning * into v_analysis;

  for v_request in select value from jsonb_array_elements(p_new_requests)
  loop
    if jsonb_typeof(v_request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(v_request -> 'requirement_keys') = 0 then
      raise exception 'Each request link needs requirement_keys.';
    end if;

    for v_requirement_key in
      select value from jsonb_array_elements_text(v_request -> 'requirement_keys')
    loop
      if not exists (
        select 1 from jsonb_array_elements(p_identified_requirements) req
        where req ->> 'key' = v_requirement_key
          and req ->> 'resolution_status' = 'clear'
      ) then
        raise exception 'Request link references requirement % that is absent or ambiguous.', v_requirement_key;
      end if;
    end loop;

    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;

    if v_existing_request_id is not null then
      select c.* into v_catalog
      from public.active_extension_request_catalog c
      where c.request_id = v_existing_request_id;

      if not found then
        raise exception 'existing_request_id must reference an active extension request.';
      end if;

      insert into public.capability_request_evidence (
        request_id,
        closure_analysis_id,
        linked_by,
        requirement_keys
      )
      values (
        v_catalog.request_id,
        v_analysis.id,
        v_user_id,
        v_request -> 'requirement_keys'
      )
      on conflict (request_id, closure_analysis_id) do nothing;

      v_request_rows := v_request_rows || jsonb_build_array(
        to_jsonb(v_catalog) || jsonb_build_object('reused_existing', true)
      );
    else
      v_class := nullif(btrim(v_request ->> 'request_class'), '');
      if v_class not in (
        'semantic_capability',
        'authoring_language',
        'runtime_configuration',
        'artifact_workflow',
        'implementation_optimization',
        'security_boundary'
      ) then
        raise exception 'A new request needs one valid request_class.';
      end if;

      if nullif(btrim(v_request ->> 'extension_key'), '') is null
         or nullif(btrim(v_request ->> 'extension_domain'), '') is null
         or nullif(btrim(v_request ->> 'extension_name'), '') is null
         or nullif(btrim(v_request ->> 'extension_definition'), '') is null
         or nullif(btrim(v_request ->> 'novelty_statement'), '') is null then
        raise exception 'A new request needs key, domain, scientific name, scientific definition and novelty_statement.';
      end if;

      if v_class = 'semantic_capability' then
        select c.* into v_canonical
        from public.canonical_capabilities c
        where c.capability_key = btrim(v_request ->> 'extension_key');

        if found then
          raise exception 'The proposed semantic key already has canonical capability identity; use the current capability/request state.';
        end if;
      end if;

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
        requirement_keys,
        request_class,
        extension_key,
        extension_domain,
        extension_name,
        extension_definition,
        novelty_statement,
        canonical_capability_id,
        publication_identifier,
        publication_title
      )
      values (
        v_user_id,
        v_role,
        v_draft.origin_experiment_id,
        v_draft.origin_experiment_revision,
        v_draft.title,
        v_draft.description,
        v_draft.artifacts,
        btrim(v_request ->> 'extension_domain'),
        btrim(v_request ->> 'extension_name'),
        coalesce(v_request ->> 'context', ''),
        nullif(btrim(v_request ->> 'requested_artifact_type'), ''),
        nullif(btrim(v_request ->> 'requested_lifecycle_hook'), ''),
        'requested',
        v_analysis.id,
        v_request -> 'requirement_keys',
        v_class,
        btrim(v_request ->> 'extension_key'),
        btrim(v_request ->> 'extension_domain'),
        btrim(v_request ->> 'extension_name'),
        btrim(v_request ->> 'extension_definition'),
        btrim(v_request ->> 'novelty_statement'),
        null,
        v_draft.publication_identifier,
        v_draft.publication_title
      )
      returning * into v_request_row;

      insert into public.capability_request_evidence (
        request_id,
        closure_analysis_id,
        linked_by,
        requirement_keys
      )
      values (
        v_request_row.id,
        v_analysis.id,
        v_user_id,
        v_request -> 'requirement_keys'
      )
      on conflict (request_id, closure_analysis_id) do nothing;

      v_request_rows := v_request_rows || jsonb_build_array(
        to_jsonb(v_request_row) || jsonb_build_object('reused_existing', false)
      );
    end if;
  end loop;

  perform private.require_extension_requirement_coverage(v_analysis.id);

  update public.blocked_experiment_drafts
  set lifecycle = case when p_analysis_status = 'unblocked' then 'unblocked' else 'blocked' end
  where id = v_draft.id
  returning * into v_draft;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into v_resolved_keys
  from (
    select req ->> 'key' as key
    from jsonb_array_elements(v_previous.identified_requirements) req
    except
    select req ->> 'key' as key
    from jsonb_array_elements(p_identified_requirements) req
  ) resolved;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into v_remaining_keys
  from (
    select req ->> 'key' as key
    from jsonb_array_elements(v_previous.identified_requirements) req
    intersect
    select req ->> 'key' as key
    from jsonb_array_elements(p_identified_requirements) req
  ) remaining;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into v_new_keys
  from (
    select req ->> 'key' as key
    from jsonb_array_elements(p_identified_requirements) req
    except
    select req ->> 'key' as key
    from jsonb_array_elements(v_previous.identified_requirements) req
  ) added;

  return jsonb_build_object(
    'blocked_experiment', to_jsonb(v_draft),
    'previous_analysis', to_jsonb(v_previous),
    'analysis', to_jsonb(v_analysis),
    'resolved_requirement_keys', v_resolved_keys,
    'remaining_requirement_keys', v_remaining_keys,
    'new_requirement_keys', v_new_keys,
    'new_requests', v_request_rows
  );
end;
$$;
