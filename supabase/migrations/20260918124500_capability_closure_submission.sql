-- Virtual Lab comprehensive capability-closure submission for #311 / #58.6.
-- Student and Professor research-AI clients may submit blocked Experiment analyses.
-- Only Professor retains inbox triage authority.

alter table public.capability_requests
  add column if not exists requirement_keys jsonb not null default '[]'::jsonb
    check (jsonb_typeof(requirement_keys) = 'array');

alter table public.capability_requests
  drop constraint if exists capability_requests_requested_lifecycle_hook_check;

alter table public.capability_requests
  add constraint capability_requests_requested_lifecycle_hook_check
  check (
    requested_lifecycle_hook is null
    or requested_lifecycle_hook in ('setup', 'initialize', 'control', 'measure', 'finalize')
  );

grant select, insert on table public.blocked_experiment_drafts to authenticated;
grant select, insert on table public.capability_closure_analyses to authenticated;

drop policy if exists "blocked_experiment_drafts_select_own" on public.blocked_experiment_drafts;
create policy "blocked_experiment_drafts_select_own"
on public.blocked_experiment_drafts for select
to authenticated
using (requester_id = (select auth.uid()));

drop policy if exists "blocked_experiment_drafts_insert_own" on public.blocked_experiment_drafts;
create policy "blocked_experiment_drafts_insert_own"
on public.blocked_experiment_drafts for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_role = (
    select p.role
    from public.profiles p
    where p.id = (select auth.uid())
  )
);

drop policy if exists "capability_closure_analyses_select_own" on public.capability_closure_analyses;
create policy "capability_closure_analyses_select_own"
on public.capability_closure_analyses for select
to authenticated
using (
  analyst_id = (select auth.uid())
  and exists (
    select 1
    from public.blocked_experiment_drafts d
    where d.id = blocked_experiment_id
      and d.requester_id = (select auth.uid())
  )
);

drop policy if exists "capability_closure_analyses_insert_own" on public.capability_closure_analyses;
create policy "capability_closure_analyses_insert_own"
on public.capability_closure_analyses for insert
to authenticated
with check (
  analyst_id = (select auth.uid())
  and exists (
    select 1
    from public.blocked_experiment_drafts d
    where d.id = blocked_experiment_id
      and d.requester_id = (select auth.uid())
  )
);

drop policy if exists "capability_requests_insert_own_professor"
  on public.capability_requests;
drop policy if exists "capability_requests_insert_own_researcher"
  on public.capability_requests;
create policy "capability_requests_insert_own_researcher"
on public.capability_requests for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_role = (
    select p.role
    from public.profiles p
    where p.id = (select auth.uid())
  )
  and status = 'requested'
  and closure_analysis_id is not null
  and professor_notes is null
  and developer_notes is null
  and github_issue_url is null
  and github_pr_url is null
  and implemented_contract_version is null
  and implemented_capability_version is null
  and implemented_at is null
  and exists (
    select 1
    from public.capability_closure_analyses a
    join public.blocked_experiment_drafts d
      on d.id = a.blocked_experiment_id
    where a.id = closure_analysis_id
      and a.analyst_id = (select auth.uid())
      and d.requester_id = (select auth.uid())
  )
  and (
    origin_experiment_id is null
    or exists (
      select 1
      from public.experiments e
      where e.id = origin_experiment_id
    )
  )
);

drop policy if exists "capability_requests_select_own_researcher"
  on public.capability_requests;
create policy "capability_requests_select_own_researcher"
on public.capability_requests for select
to authenticated
using (requester_id = (select auth.uid()));

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
  v_analysis public.capability_closure_analyses;
  v_request jsonb;
  v_request_row public.capability_requests;
  v_request_rows jsonb := '[]'::jsonb;
  v_requirement_key text;
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
    1,
    btrim(p_contract_version),
    p_analysis_status,
    p_identified_requirements,
    p_unresolved_ambiguities
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
      v_title,
      v_description,
      v_artifacts,
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

    v_request_rows := v_request_rows || jsonb_build_array(to_jsonb(v_request_row));
  end loop;

  return jsonb_build_object(
    'blocked_experiment', to_jsonb(v_draft),
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
