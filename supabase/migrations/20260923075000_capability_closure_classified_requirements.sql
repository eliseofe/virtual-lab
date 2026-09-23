-- #524: classify closure requirements before request creation.
-- v11 stores all scientific/product requirements in normalized requirement rows.
-- capability_closure_analyses.identified_requirements remains a compatibility
-- projection containing only unsupported/ambiguous requirements for older readers.

create table if not exists public.capability_closure_requirements (
  closure_analysis_id uuid not null
    references public.capability_closure_analyses(id) on delete cascade,
  requirement_key text not null
    check (length(btrim(requirement_key)) > 0),
  summary text not null
    check (length(btrim(summary)) > 0),
  evidence text not null
    check (length(btrim(evidence)) > 0),
  classification text not null
    check (classification in ('supported', 'unsupported', 'ambiguous')),
  created_at timestamptz not null default now(),
  primary key (closure_analysis_id, requirement_key)
);

create table if not exists public.capability_closure_requirement_support (
  id uuid primary key default gen_random_uuid(),
  closure_analysis_id uuid not null,
  requirement_key text not null,
  support_kind text not null
    check (support_kind in ('canonical_capability', 'contract_path')),
  canonical_capability_id uuid
    references public.canonical_capabilities(id) on delete restrict,
  contract_path text,
  created_at timestamptz not null default now(),
  foreign key (closure_analysis_id, requirement_key)
    references public.capability_closure_requirements(closure_analysis_id, requirement_key)
    on delete cascade,
  check (
    (support_kind = 'canonical_capability'
      and canonical_capability_id is not null
      and contract_path is null)
    or
    (support_kind = 'contract_path'
      and canonical_capability_id is null
      and length(btrim(contract_path)) > 0)
  ),
  check (
    contract_path is null
    or contract_path ~ '^(runtime_contract|artifacts\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\.|$)'
  )
);

create unique index if not exists capability_closure_requirement_support_capability_unique
  on public.capability_closure_requirement_support(
    closure_analysis_id, requirement_key, canonical_capability_id
  )
  where canonical_capability_id is not null;

create unique index if not exists capability_closure_requirement_support_contract_unique
  on public.capability_closure_requirement_support(
    closure_analysis_id, requirement_key, contract_path
  )
  where contract_path is not null;

alter table public.capability_closure_requirements enable row level security;
alter table public.capability_closure_requirement_support enable row level security;

grant select, insert on public.capability_closure_requirements to authenticated;
grant select, insert on public.capability_closure_requirement_support to authenticated;

drop policy if exists "capability_closure_requirements_select_visible"
  on public.capability_closure_requirements;
create policy "capability_closure_requirements_select_visible"
on public.capability_closure_requirements
for select to authenticated
using (
  exists (
    select 1
    from public.capability_closure_analyses a
    where a.id = closure_analysis_id
  )
);

drop policy if exists "capability_closure_requirements_insert_analyst"
  on public.capability_closure_requirements;
create policy "capability_closure_requirements_insert_analyst"
on public.capability_closure_requirements
for insert to authenticated
with check (
  exists (
    select 1
    from public.capability_closure_analyses a
    where a.id = closure_analysis_id
      and a.analyst_id = (select auth.uid())
  )
);

drop policy if exists "capability_closure_requirement_support_select_visible"
  on public.capability_closure_requirement_support;
create policy "capability_closure_requirement_support_select_visible"
on public.capability_closure_requirement_support
for select to authenticated
using (
  exists (
    select 1
    from public.capability_closure_analyses a
    where a.id = closure_analysis_id
  )
);

drop policy if exists "capability_closure_requirement_support_insert_analyst"
  on public.capability_closure_requirement_support;
create policy "capability_closure_requirement_support_insert_analyst"
on public.capability_closure_requirement_support
for insert to authenticated
with check (
  exists (
    select 1
    from public.capability_closure_analyses a
    where a.id = closure_analysis_id
      and a.analyst_id = (select auth.uid())
  )
);

-- Historical rows stay historically truthful: the old format only knew
-- unsupported clear requirements and ambiguous requirements.
insert into public.capability_closure_requirements (
  closure_analysis_id,
  requirement_key,
  summary,
  evidence,
  classification
)
select
  a.id,
  req ->> 'key',
  req ->> 'summary',
  req ->> 'evidence',
  case
    when req ->> 'resolution_status' = 'ambiguous' then 'ambiguous'
    else 'unsupported'
  end
from public.capability_closure_analyses a
cross join lateral jsonb_array_elements(a.identified_requirements) req
where nullif(btrim(req ->> 'key'), '') is not null
  and nullif(btrim(req ->> 'summary'), '') is not null
  and nullif(btrim(req ->> 'evidence'), '') is not null
on conflict (closure_analysis_id, requirement_key) do nothing;

create or replace function public.submit_structured_extension_closure_v11(
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
  p_classified_requirements jsonb default '[]'::jsonb,
  p_unresolved_ambiguities jsonb default '[]'::jsonb,
  p_requests jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission jsonb;
  v_analysis_id uuid;
  v_legacy_requirements jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_classified_requirements) <> 'array'
     or jsonb_array_length(p_classified_requirements) = 0 then
    raise exception 'classified_requirements must contain the paper/Experiment requirements.';
  end if;
  if jsonb_typeof(p_unresolved_ambiguities) <> 'array' then
    raise exception 'unresolved_ambiguities must be a JSON array.';
  end if;
  if jsonb_typeof(p_requests) <> 'array' then
    raise exception 'requests must be a JSON array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where nullif(btrim(req ->> 'key'), '') is null
       or nullif(btrim(req ->> 'summary'), '') is null
       or nullif(btrim(req ->> 'evidence'), '') is null
       or coalesce(req ->> 'classification', '') not in ('supported', 'unsupported', 'ambiguous')
       or (req ? 'support' and jsonb_typeof(req -> 'support') <> 'array')
  ) then
    raise exception 'Each classified requirement needs key, summary, evidence, supported|unsupported|ambiguous classification, and optional support array.';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_classified_requirements)
  ) <> (
    select count(distinct req ->> 'key')
    from jsonb_array_elements(p_classified_requirements) req
  ) then
    raise exception 'classified_requirements keys must be unique.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' = 'supported'
      and (
        jsonb_typeof(req -> 'support') <> 'array'
        or jsonb_array_length(req -> 'support') = 0
      )
  ) then
    raise exception 'Every supported requirement must cite deployed support.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' in ('unsupported', 'ambiguous')
      and req ? 'support'
      and jsonb_array_length(req -> 'support') > 0
  ) then
    raise exception 'Unsupported or ambiguous requirements cannot cite deployed support.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    cross join lateral jsonb_array_elements(coalesce(req -> 'support', '[]'::jsonb)) support
    where req ->> 'classification' = 'supported'
      and (
        support ->> 'kind' not in ('canonical_capability', 'contract_path')
        or (
          support ->> 'kind' = 'canonical_capability'
          and (
            nullif(btrim(support ->> 'canonical_capability_id'), '') is null
            or support ->> 'canonical_capability_id'
               !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or support ? 'contract_path'
          )
        )
        or (
          support ->> 'kind' = 'contract_path'
          and (
            nullif(btrim(support ->> 'contract_path'), '') is null
            or support ? 'canonical_capability_id'
            or support ->> 'contract_path'
               !~ '^(runtime_contract|artifacts\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\.|$)'
          )
        )
      )
  ) then
    raise exception 'Supported requirement evidence must be an implemented canonical capability or stable contract path.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    cross join lateral jsonb_array_elements(coalesce(req -> 'support', '[]'::jsonb)) support
    where req ->> 'classification' = 'supported'
      and support ->> 'kind' = 'canonical_capability'
      and not exists (
        select 1
        from public.canonical_capabilities c
        where c.id::text = support ->> 'canonical_capability_id'
          and c.implementation_state = 'implemented'
      )
  ) then
    raise exception 'Supported requirements may cite only implemented canonical capabilities.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_requests) request
    where jsonb_typeof(request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(request -> 'requirement_keys') = 0
  ) then
    raise exception 'Every reused or new request must name at least one unsupported requirement key.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_requests) request
    cross join lateral jsonb_array_elements_text(request -> 'requirement_keys') requirement_key
    where not exists (
      select 1
      from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'key' = requirement_key
        and req ->> 'classification' = 'unsupported'
    )
  ) then
    raise exception 'Requests may reference only requirements classified as unsupported.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' = 'unsupported'
      and not exists (
        select 1
        from jsonb_array_elements(p_requests) request
        cross join lateral jsonb_array_elements_text(request -> 'requirement_keys') requirement_key
        where requirement_key = req ->> 'key'
      )
  ) then
    raise exception 'Every unsupported requirement must link to a reused or new unavailable candidate request.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_unresolved_ambiguities) amb
    where nullif(btrim(amb ->> 'key'), '') is null
       or nullif(btrim(amb ->> 'requirement_key'), '') is null
       or nullif(btrim(amb ->> 'question'), '') is null
       or not exists (
         select 1
         from jsonb_array_elements(p_classified_requirements) req
         where req ->> 'key' = amb ->> 'requirement_key'
           and req ->> 'classification' = 'ambiguous'
       )
  ) then
    raise exception 'Every ambiguity must reference a requirement classified as ambiguous.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' = 'ambiguous'
      and not exists (
        select 1
        from jsonb_array_elements(p_unresolved_ambiguities) amb
        where amb ->> 'requirement_key' = req ->> 'key'
      )
  ) then
    raise exception 'Every ambiguous requirement must retain an unresolved ambiguity.';
  end if;

  if p_analysis_status = 'best_effort_complete' then
    if exists (
      select 1 from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'classification' = 'ambiguous'
    ) or jsonb_array_length(p_unresolved_ambiguities) <> 0 then
      raise exception 'best_effort_complete cannot contain ambiguous requirements.';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'classification' = 'unsupported'
    ) then
      raise exception 'best_effort_complete blocked analysis requires at least one unsupported requirement.';
    end if;
  elsif p_analysis_status = 'partial_due_to_ambiguity' then
    if not exists (
      select 1 from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'classification' = 'ambiguous'
    ) or jsonb_array_length(p_unresolved_ambiguities) = 0 then
      raise exception 'partial_due_to_ambiguity requires an ambiguous requirement and unresolved ambiguity.';
    end if;
  else
    raise exception 'Initial closure analysis must be best_effort_complete or partial_due_to_ambiguity.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', req ->> 'key',
        'summary', req ->> 'summary',
        'evidence', req ->> 'evidence',
        'resolution_status',
          case when req ->> 'classification' = 'ambiguous' then 'ambiguous' else 'clear' end
      )
      order by req ->> 'key'
    ),
    '[]'::jsonb
  )
  into v_legacy_requirements
  from jsonb_array_elements(p_classified_requirements) req
  where req ->> 'classification' in ('unsupported', 'ambiguous');

  v_submission := public.submit_structured_extension_closure_v8(
    p_blocked_experiment_id => p_blocked_experiment_id,
    p_origin_experiment_id => p_origin_experiment_id,
    p_origin_experiment_revision => p_origin_experiment_revision,
    p_draft_title => p_draft_title,
    p_draft_description => p_draft_description,
    p_draft_artifacts => p_draft_artifacts,
    p_source_context => p_source_context,
    p_publication_identifier => p_publication_identifier,
    p_publication_title => p_publication_title,
    p_contract_version => p_contract_version,
    p_analysis_status => p_analysis_status,
    p_identified_requirements => v_legacy_requirements,
    p_unresolved_ambiguities => p_unresolved_ambiguities,
    p_requests => p_requests
  );

  v_analysis_id := (v_submission -> 'analysis' ->> 'id')::uuid;

  insert into public.capability_closure_requirements (
    closure_analysis_id, requirement_key, summary, evidence, classification
  )
  select
    v_analysis_id,
    req ->> 'key',
    req ->> 'summary',
    req ->> 'evidence',
    req ->> 'classification'
  from jsonb_array_elements(p_classified_requirements) req;

  insert into public.capability_closure_requirement_support (
    closure_analysis_id,
    requirement_key,
    support_kind,
    canonical_capability_id,
    contract_path
  )
  select
    v_analysis_id,
    req ->> 'key',
    support ->> 'kind',
    case
      when support ->> 'kind' = 'canonical_capability'
        then (support ->> 'canonical_capability_id')::uuid
      else null
    end,
    case
      when support ->> 'kind' = 'contract_path'
        then btrim(support ->> 'contract_path')
      else null
    end
  from jsonb_array_elements(p_classified_requirements) req
  cross join lateral jsonb_array_elements(coalesce(req -> 'support', '[]'::jsonb)) support
  where req ->> 'classification' = 'supported';

  return v_submission || jsonb_build_object(
    'capability_request_interface', 'vlab.capability-request/11',
    'classified_requirements', p_classified_requirements
  );
end;
$function$;

create or replace function public.revalidate_structured_extension_closure_v11(
  p_blocked_experiment_id uuid,
  p_base_analysis_sequence bigint,
  p_contract_version text,
  p_analysis_status text,
  p_classified_requirements jsonb default '[]'::jsonb,
  p_unresolved_ambiguities jsonb default '[]'::jsonb,
  p_requests jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission jsonb;
  v_analysis_id uuid;
  v_legacy_requirements jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_classified_requirements) <> 'array' then
    raise exception 'classified_requirements must be a JSON array.';
  end if;
  if jsonb_typeof(p_unresolved_ambiguities) <> 'array' then
    raise exception 'unresolved_ambiguities must be a JSON array.';
  end if;
  if jsonb_typeof(p_requests) <> 'array' then
    raise exception 'requests must be a JSON array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where nullif(btrim(req ->> 'key'), '') is null
       or nullif(btrim(req ->> 'summary'), '') is null
       or nullif(btrim(req ->> 'evidence'), '') is null
       or coalesce(req ->> 'classification', '') not in ('supported', 'unsupported', 'ambiguous')
       or (req ? 'support' and jsonb_typeof(req -> 'support') <> 'array')
  ) then
    raise exception 'Each classified requirement needs key, summary, evidence, supported|unsupported|ambiguous classification, and optional support array.';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_classified_requirements)
  ) <> (
    select count(distinct req ->> 'key')
    from jsonb_array_elements(p_classified_requirements) req
  ) then
    raise exception 'classified_requirements keys must be unique.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' = 'supported'
      and (
        jsonb_typeof(req -> 'support') <> 'array'
        or jsonb_array_length(req -> 'support') = 0
      )
  ) then
    raise exception 'Every supported requirement must cite deployed support.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' in ('unsupported', 'ambiguous')
      and req ? 'support'
      and jsonb_array_length(req -> 'support') > 0
  ) then
    raise exception 'Unsupported or ambiguous requirements cannot cite deployed support.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    cross join lateral jsonb_array_elements(coalesce(req -> 'support', '[]'::jsonb)) support
    where req ->> 'classification' = 'supported'
      and (
        support ->> 'kind' not in ('canonical_capability', 'contract_path')
        or (
          support ->> 'kind' = 'canonical_capability'
          and (
            nullif(btrim(support ->> 'canonical_capability_id'), '') is null
            or support ->> 'canonical_capability_id'
               !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or support ? 'contract_path'
          )
        )
        or (
          support ->> 'kind' = 'contract_path'
          and (
            nullif(btrim(support ->> 'contract_path'), '') is null
            or support ? 'canonical_capability_id'
            or support ->> 'contract_path'
               !~ '^(runtime_contract|artifacts\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\.|$)'
          )
        )
      )
  ) then
    raise exception 'Supported requirement evidence must be an implemented canonical capability or stable contract path.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    cross join lateral jsonb_array_elements(coalesce(req -> 'support', '[]'::jsonb)) support
    where req ->> 'classification' = 'supported'
      and support ->> 'kind' = 'canonical_capability'
      and not exists (
        select 1
        from public.canonical_capabilities c
        where c.id::text = support ->> 'canonical_capability_id'
          and c.implementation_state = 'implemented'
      )
  ) then
    raise exception 'Supported requirements may cite only implemented canonical capabilities.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_requests) request
    where jsonb_typeof(request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(request -> 'requirement_keys') = 0
  ) then
    raise exception 'Every reused or new request must name at least one unsupported requirement key.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_requests) request
    cross join lateral jsonb_array_elements_text(request -> 'requirement_keys') requirement_key
    where not exists (
      select 1
      from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'key' = requirement_key
        and req ->> 'classification' = 'unsupported'
    )
  ) then
    raise exception 'Requests may reference only requirements classified as unsupported.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' = 'unsupported'
      and not exists (
        select 1
        from jsonb_array_elements(p_requests) request
        cross join lateral jsonb_array_elements_text(request -> 'requirement_keys') requirement_key
        where requirement_key = req ->> 'key'
      )
  ) then
    raise exception 'Every unsupported requirement must link to a reused or new unavailable candidate request.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_unresolved_ambiguities) amb
    where nullif(btrim(amb ->> 'key'), '') is null
       or nullif(btrim(amb ->> 'requirement_key'), '') is null
       or nullif(btrim(amb ->> 'question'), '') is null
       or not exists (
         select 1
         from jsonb_array_elements(p_classified_requirements) req
         where req ->> 'key' = amb ->> 'requirement_key'
           and req ->> 'classification' = 'ambiguous'
       )
  ) then
    raise exception 'Every ambiguity must reference a requirement classified as ambiguous.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classified_requirements) req
    where req ->> 'classification' = 'ambiguous'
      and not exists (
        select 1
        from jsonb_array_elements(p_unresolved_ambiguities) amb
        where amb ->> 'requirement_key' = req ->> 'key'
      )
  ) then
    raise exception 'Every ambiguous requirement must retain an unresolved ambiguity.';
  end if;

  if p_analysis_status = 'unblocked' then
    if exists (
      select 1 from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'classification' in ('unsupported', 'ambiguous')
    ) or jsonb_array_length(p_unresolved_ambiguities) <> 0
       or jsonb_array_length(p_requests) <> 0 then
      raise exception 'unblocked requires zero unsupported requirements, zero ambiguity, and zero requests.';
    end if;
  elsif p_analysis_status = 'best_effort_complete' then
    if exists (
      select 1 from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'classification' = 'ambiguous'
    ) or jsonb_array_length(p_unresolved_ambiguities) <> 0 then
      raise exception 'best_effort_complete cannot contain ambiguous requirements.';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'classification' = 'unsupported'
    ) then
      raise exception 'best_effort_complete revalidation must retain at least one unsupported requirement.';
    end if;
  elsif p_analysis_status = 'partial_due_to_ambiguity' then
    if not exists (
      select 1 from jsonb_array_elements(p_classified_requirements) req
      where req ->> 'classification' = 'ambiguous'
    ) or jsonb_array_length(p_unresolved_ambiguities) = 0 then
      raise exception 'partial_due_to_ambiguity requires an ambiguous requirement and unresolved ambiguity.';
    end if;
  else
    raise exception 'analysis_status must be best_effort_complete, partial_due_to_ambiguity, or unblocked.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', req ->> 'key',
        'summary', req ->> 'summary',
        'evidence', req ->> 'evidence',
        'resolution_status',
          case when req ->> 'classification' = 'ambiguous' then 'ambiguous' else 'clear' end
      )
      order by req ->> 'key'
    ),
    '[]'::jsonb
  )
  into v_legacy_requirements
  from jsonb_array_elements(p_classified_requirements) req
  where req ->> 'classification' in ('unsupported', 'ambiguous');

  v_submission := public.revalidate_structured_extension_closure_v8(
    p_blocked_experiment_id => p_blocked_experiment_id,
    p_base_analysis_sequence => p_base_analysis_sequence,
    p_contract_version => p_contract_version,
    p_analysis_status => p_analysis_status,
    p_identified_requirements => v_legacy_requirements,
    p_unresolved_ambiguities => p_unresolved_ambiguities,
    p_requests => p_requests
  );

  v_analysis_id := (v_submission -> 'analysis' ->> 'id')::uuid;

  insert into public.capability_closure_requirements (
    closure_analysis_id, requirement_key, summary, evidence, classification
  )
  select
    v_analysis_id,
    req ->> 'key',
    req ->> 'summary',
    req ->> 'evidence',
    req ->> 'classification'
  from jsonb_array_elements(p_classified_requirements) req;

  insert into public.capability_closure_requirement_support (
    closure_analysis_id,
    requirement_key,
    support_kind,
    canonical_capability_id,
    contract_path
  )
  select
    v_analysis_id,
    req ->> 'key',
    support ->> 'kind',
    case
      when support ->> 'kind' = 'canonical_capability'
        then (support ->> 'canonical_capability_id')::uuid
      else null
    end,
    case
      when support ->> 'kind' = 'contract_path'
        then btrim(support ->> 'contract_path')
      else null
    end
  from jsonb_array_elements(p_classified_requirements) req
  cross join lateral jsonb_array_elements(coalesce(req -> 'support', '[]'::jsonb)) support
  where req ->> 'classification' = 'supported';

  return v_submission || jsonb_build_object(
    'capability_request_interface', 'vlab.capability-request/11',
    'classified_requirements', p_classified_requirements
  );
end;
$function$;

revoke all on function public.submit_structured_extension_closure_v11(
  uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.submit_structured_extension_closure_v11(
  uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;

revoke all on function public.revalidate_structured_extension_closure_v11(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.revalidate_structured_extension_closure_v11(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) to authenticated;
