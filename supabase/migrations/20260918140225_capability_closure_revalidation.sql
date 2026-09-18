-- Virtual Lab Professor resume / whole-Experiment revalidation for #312 / #58.7.
-- This migration exposes blocked closure history to Professor research-AI sessions and
-- adds an atomic append-only revalidation RPC. Existing capability request rows and
-- lifecycle states are never rewritten by revalidation.

grant update (lifecycle) on table public.blocked_experiment_drafts to authenticated;

drop policy if exists "blocked_experiment_drafts_select_own" on public.blocked_experiment_drafts;
drop policy if exists "blocked_experiment_drafts_select_visible" on public.blocked_experiment_drafts;
create policy "blocked_experiment_drafts_select_visible"
on public.blocked_experiment_drafts for select
to authenticated
using (
  requester_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

drop policy if exists "blocked_experiment_drafts_revalidate_professor" on public.blocked_experiment_drafts;
create policy "blocked_experiment_drafts_revalidate_professor"
on public.blocked_experiment_drafts for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

drop policy if exists "capability_closure_analyses_select_own" on public.capability_closure_analyses;
drop policy if exists "capability_closure_analyses_select_visible" on public.capability_closure_analyses;
create policy "capability_closure_analyses_select_visible"
on public.capability_closure_analyses for select
to authenticated
using (
  exists (
    select 1
    from public.blocked_experiment_drafts d
    where d.id = blocked_experiment_id
      and (
        d.requester_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'professor'
        )
      )
  )
);

drop policy if exists "capability_closure_analyses_insert_professor_revalidation"
  on public.capability_closure_analyses;
create policy "capability_closure_analyses_insert_professor_revalidation"
on public.capability_closure_analyses for insert
to authenticated
with check (
  analyst_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
  and exists (
    select 1
    from public.blocked_experiment_drafts d
    where d.id = blocked_experiment_id
  )
);

drop policy if exists "capability_requests_insert_professor_revalidation"
  on public.capability_requests;
create policy "capability_requests_insert_professor_revalidation"
on public.capability_requests for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_role = 'professor'
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
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
  and exists (
    select 1
    from public.capability_closure_analyses a
    where a.id = closure_analysis_id
      and a.analyst_id = (select auth.uid())
  )
  and (
    origin_experiment_id is null
    or exists (
      select 1 from public.experiments e
      where e.id = origin_experiment_id
    )
  )
);

create or replace function public.revalidate_capability_closure(
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
  v_request_rows jsonb := '[]'::jsonb;
  v_requirement_key text;
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

  if v_role <> 'professor' then
    raise exception 'Capability-closure resume/revalidation requires a Professor profile.';
  end if;

  if p_blocked_experiment_id is null then
    raise exception 'blocked_experiment_id is required.';
  end if;
  if p_base_analysis_sequence is null or p_base_analysis_sequence < 1 then
    raise exception 'base_analysis_sequence must be a positive integer.';
  end if;
  if nullif(btrim(coalesce(p_contract_version, '')), '') is null then
    raise exception 'contract_version is required.';
  end if;
  if p_analysis_status not in ('best_effort_complete', 'partial_due_to_ambiguity', 'unblocked') then
    raise exception 'analysis_status must be best_effort_complete, partial_due_to_ambiguity, or unblocked.';
  end if;
  if jsonb_typeof(p_identified_requirements) <> 'array' then
    raise exception 'identified_requirements must be a JSON array.';
  end if;
  if jsonb_typeof(p_unresolved_ambiguities) <> 'array' then
    raise exception 'unresolved_ambiguities must be a JSON array.';
  end if;
  if jsonb_typeof(p_new_requests) <> 'array' then
    raise exception 'new_requests must be a JSON array.';
  end if;

  select d.* into v_draft
  from public.blocked_experiment_drafts d
  where d.id = p_blocked_experiment_id
  for update;

  if not found then
    raise exception 'Blocked Experiment was not found or is not visible.';
  end if;

  select a.* into v_previous
  from public.capability_closure_analyses a
  where a.blocked_experiment_id = p_blocked_experiment_id
  order by a.analysis_sequence desc
  limit 1;

  if not found then
    raise exception 'Blocked Experiment has no closure analysis to resume.';
  end if;

  if v_previous.analysis_sequence <> p_base_analysis_sequence then
    raise exception
      'Closure analysis conflict: latest sequence %, supplied base %.',
      v_previous.analysis_sequence,
      p_base_analysis_sequence;
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
      raise exception 'best_effort_complete cannot contain unresolved scientific ambiguity.';
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
    p_blocked_experiment_id,
    v_user_id,
    v_next_sequence,
    btrim(p_contract_version),
    p_analysis_status,
    p_identified_requirements,
    p_unresolved_ambiguities
  )
  returning * into v_analysis;

  for v_request in
    select value from jsonb_array_elements(p_new_requests)
  loop
    if nullif(btrim(v_request ->> 'capability_domain'), '') is null
       or nullif(btrim(v_request ->> 'capability_name'), '') is null
       or jsonb_typeof(v_request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(v_request -> 'requirement_keys') = 0 then
      raise exception 'Each new grouped request needs capability_domain, capability_name and requirement_keys.';
    end if;

    for v_requirement_key in
      select value from jsonb_array_elements_text(v_request -> 'requirement_keys')
    loop
      if not exists (
        select 1
        from jsonb_array_elements(p_identified_requirements) req
        where req ->> 'key' = v_requirement_key
          and req ->> 'resolution_status' = 'clear'
      ) then
        raise exception
          'New grouped request references requirement % that is absent or scientifically ambiguous.',
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
      'professor',
      v_draft.origin_experiment_id,
      v_draft.origin_experiment_revision,
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

    v_request_rows := v_request_rows || jsonb_build_array(to_jsonb(v_request_row));
  end loop;

  update public.blocked_experiment_drafts
  set lifecycle = case when p_analysis_status = 'unblocked' then 'unblocked' else 'blocked' end
  where id = p_blocked_experiment_id
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

revoke all on function public.revalidate_capability_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.revalidate_capability_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) to authenticated;
