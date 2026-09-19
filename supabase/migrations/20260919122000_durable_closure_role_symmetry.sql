-- #360: make durable unsupported-science closure symmetric for Student and Professor research AI.
-- Students may resume/revalidate their own blocked Experiments; Professors retain supervision access
-- to visible blocked Experiments. The six request classes and implementation authority are unchanged.

drop policy if exists "blocked_experiment_drafts_revalidate_professor"
  on public.blocked_experiment_drafts;
drop policy if exists "blocked_experiment_drafts_revalidate_researcher_or_professor"
  on public.blocked_experiment_drafts;

create policy "blocked_experiment_drafts_revalidate_researcher_or_professor"
on public.blocked_experiment_drafts for update
to authenticated
using (
  requester_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
)
with check (
  requester_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

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

revoke all on function public.revalidate_extension_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.revalidate_extension_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) to authenticated;
