-- #346: typed extension-request workflow bound to canonical capability identity.
-- Requests remain workflow/history. Canonical capabilities remain product truth.

alter table public.canonical_capabilities
  alter column id set default gen_random_uuid();

alter table public.canonical_capabilities
  add column if not exists implementation_version text,
  add column if not exists github_issue_number bigint,
  add column if not exists github_issue_url text,
  add column if not exists development_started_at timestamptz;

alter table public.canonical_capabilities
  add constraint canonical_capabilities_implementation_version_nonempty
    check (implementation_version is null or length(btrim(implementation_version)) > 0),
  add constraint canonical_capabilities_github_issue_number_positive
    check (github_issue_number is null or github_issue_number > 0),
  add constraint canonical_capabilities_github_issue_pair
    check ((github_issue_number is null) = (github_issue_url is null));

create unique index canonical_capabilities_github_issue_number_unique
  on public.canonical_capabilities(github_issue_number)
  where github_issue_number is not null;

create unique index canonical_capabilities_github_issue_url_unique
  on public.canonical_capabilities(github_issue_url)
  where github_issue_url is not null;

alter table public.blocked_experiment_drafts
  add column if not exists publication_identifier text,
  add column if not exists publication_title text;

alter table public.blocked_experiment_drafts
  add constraint blocked_experiment_publication_pair
    check ((publication_identifier is null) = (publication_title is null)),
  add constraint blocked_experiment_publication_identifier_nonempty
    check (publication_identifier is null or length(btrim(publication_identifier)) > 0),
  add constraint blocked_experiment_publication_title_nonempty
    check (publication_title is null or length(btrim(publication_title)) > 0);

alter table public.capability_requests
  add column if not exists request_class text,
  add column if not exists extension_key text,
  add column if not exists extension_domain text,
  add column if not exists extension_name text,
  add column if not exists extension_definition text,
  add column if not exists canonical_capability_id uuid
    references public.canonical_capabilities(id) on delete restrict,
  add column if not exists publication_identifier text,
  add column if not exists publication_title text;

alter table public.capability_requests
  add constraint capability_requests_request_class
    check (
      request_class is null
      or request_class in (
        'semantic_capability',
        'authoring_language',
        'runtime_configuration',
        'artifact_workflow',
        'implementation_optimization',
        'security_boundary'
      )
    ),
  add constraint capability_requests_extension_key_nonempty
    check (extension_key is null or length(btrim(extension_key)) > 0),
  add constraint capability_requests_extension_domain_nonempty
    check (extension_domain is null or length(btrim(extension_domain)) > 0),
  add constraint capability_requests_extension_name_nonempty
    check (extension_name is null or length(btrim(extension_name)) > 0),
  add constraint capability_requests_extension_definition_nonempty
    check (extension_definition is null or length(btrim(extension_definition)) > 0),
  add constraint capability_requests_publication_pair_v4
    check ((publication_identifier is null) = (publication_title is null)),
  add constraint capability_requests_publication_identifier_nonempty_v4
    check (publication_identifier is null or length(btrim(publication_identifier)) > 0),
  add constraint capability_requests_publication_title_nonempty_v4
    check (publication_title is null or length(btrim(publication_title)) > 0),
  add constraint capability_requests_canonical_only_semantic
    check (canonical_capability_id is null or request_class = 'semantic_capability');

create index capability_requests_class_status_created_idx
  on public.capability_requests(request_class, status, created_at desc);

create index capability_requests_canonical_capability_idx
  on public.capability_requests(canonical_capability_id, status)
  where canonical_capability_id is not null;

comment on column public.capability_requests.request_class is
  'Owner-approved six-class unsupported-requirement taxonomy. Classification does not approve or reject the request.';

comment on column public.capability_requests.canonical_capability_id is
  'Stable canonical semantic-capability identity when the request is already resolved/bound. Non-semantic request classes never use this field.';

comment on column public.capability_requests.extension_key is
  'Generic proposed/request target key. For an unbound semantic request this is only a proposal until Professor triage binds or creates canonical identity.';

comment on column public.capability_requests.publication_identifier is
  'Minimal source-publication identifier for this request/task; separate from request reasoning.';

comment on column public.capability_requests.publication_title is
  'Minimal source-publication title for this request/task; separate from request reasoning.';

-- Professors may create canonical identity/provenance only as part of reviewed triage.
grant insert (
  capability_key,
  capability_domain,
  capability_name,
  canonical_definition,
  implementation_state,
  implementation_contracts
) on public.canonical_capabilities to authenticated;

grant insert (
  capability_id,
  publication_identifier,
  publication_title
) on public.capability_publication_provenance to authenticated;

drop policy if exists "canonical_capabilities_professor_insert" on public.canonical_capabilities;
create policy "canonical_capabilities_professor_insert"
on public.canonical_capabilities
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

drop policy if exists "capability_publication_provenance_professor_insert"
  on public.capability_publication_provenance;
create policy "capability_publication_provenance_professor_insert"
on public.capability_publication_provenance
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

grant update (status, professor_notes, canonical_capability_id)
  on public.capability_requests to authenticated;

create or replace function private.stamp_capability_request_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'requested' and new.status in ('approved', 'declined') then
    if new.status = 'approved'
       and new.request_class = 'semantic_capability'
       and new.canonical_capability_id is null then
      raise exception 'Approved semantic-capability requests must be bound to canonical capability identity.';
    end if;

    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

-- Professor triage is the only product-side operation that may convert a
-- proposed semantic target into canonical capability truth.
create or replace function public.triage_extension_request(
  p_request_id uuid,
  p_decision text,
  p_professor_notes text default null,
  p_bind_canonical_capability_id uuid default null,
  p_canonical_key text default null,
  p_canonical_domain text default null,
  p_canonical_name text default null,
  p_canonical_definition text default null
)
returns public.capability_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_request public.capability_requests;
  v_capability public.canonical_capabilities;
  v_existing public.canonical_capabilities;
  v_capability_id uuid;
  v_key text;
  v_domain text;
  v_name text;
  v_definition text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role <> 'professor' then
    raise exception 'Only a Professor may triage extension requests.';
  end if;

  if p_decision not in ('approved', 'declined') then
    raise exception 'decision must be approved or declined.';
  end if;

  select r.* into v_request
  from public.capability_requests r
  where r.id = p_request_id
    and r.status = 'requested'
  for update;

  if not found then
    raise exception 'Request is missing, not visible, or no longer pending.';
  end if;

  if p_decision = 'declined' then
    update public.capability_requests
    set status = 'declined',
        professor_notes = nullif(btrim(coalesce(p_professor_notes, '')), '')
    where id = v_request.id
    returning * into v_request;

    return v_request;
  end if;

  if v_request.request_class = 'semantic_capability' then
    v_capability_id := coalesce(p_bind_canonical_capability_id, v_request.canonical_capability_id);

    if v_request.canonical_capability_id is not null
       and p_bind_canonical_capability_id is not null
       and p_bind_canonical_capability_id <> v_request.canonical_capability_id then
      raise exception 'Request is already bound to a different canonical capability.';
    end if;

    if v_capability_id is not null then
      select c.* into v_capability
      from public.canonical_capabilities c
      where c.id = v_capability_id;

      if not found then
        raise exception 'Selected canonical capability does not exist.';
      end if;
    else
      v_key := nullif(btrim(coalesce(p_canonical_key, v_request.extension_key)), '');
      v_domain := nullif(btrim(coalesce(p_canonical_domain, v_request.extension_domain)), '');
      v_name := nullif(btrim(coalesce(p_canonical_name, v_request.extension_name)), '');
      v_definition := nullif(btrim(coalesce(p_canonical_definition, v_request.extension_definition)), '');

      if v_key is null or v_domain is null or v_name is null or v_definition is null then
        raise exception 'Approving a new semantic capability requires canonical key, domain, name and generic definition.';
      end if;

      select c.* into v_existing
      from public.canonical_capabilities c
      where c.capability_key = v_key;

      if found then
        raise exception
          'Canonical capability key % already exists; explicitly bind this request to that capability instead.',
          v_key;
      end if;

      insert into public.canonical_capabilities (
        capability_key,
        capability_domain,
        capability_name,
        canonical_definition,
        implementation_state,
        implementation_contracts
      )
      values (
        v_key,
        v_domain,
        v_name,
        v_definition,
        'not_implemented',
        '{}'::text[]
      )
      returning * into v_capability;

      v_capability_id := v_capability.id;
    end if;

    if v_request.publication_identifier is not null then
      insert into public.capability_publication_provenance (
        capability_id,
        publication_identifier,
        publication_title
      )
      values (
        v_capability_id,
        v_request.publication_identifier,
        v_request.publication_title
      )
      on conflict (capability_id, publication_identifier) do nothing;
    end if;

    update public.capability_requests
    set canonical_capability_id = v_capability_id,
        status = 'approved',
        professor_notes = nullif(btrim(coalesce(p_professor_notes, '')), '')
    where id = v_request.id
    returning * into v_request;

    return v_request;
  end if;

  if p_bind_canonical_capability_id is not null
     or p_canonical_key is not null
     or p_canonical_domain is not null
     or p_canonical_name is not null
     or p_canonical_definition is not null then
    raise exception 'Only semantic-capability requests may bind or create canonical capability identity.';
  end if;

  update public.capability_requests
  set status = 'approved',
      professor_notes = nullif(btrim(coalesce(p_professor_notes, '')), '')
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.triage_extension_request(
  uuid, text, text, uuid, text, text, text, text
) from public, anon;
grant execute on function public.triage_extension_request(
  uuid, text, text, uuid, text, text, text, text
) to authenticated;

-- New v4 submission path. It does not reuse requests by free-text labels.
-- Stable reconciliation is only by explicit request UUID or canonical capability ID.
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

    if v_draft.publication_identifier is distinct from p_publication_identifier
       or v_draft.publication_title is distinct from p_publication_title then
      raise exception 'A blocked Experiment keeps one stable source publication identity.';
    end if;

    v_reused_draft := true;
  elsif p_origin_experiment_id is not null then
    select d.* into v_draft
    from public.blocked_experiment_drafts d
    where d.requester_id = v_user_id
      and d.lifecycle = 'blocked'
      and d.origin_experiment_id = p_origin_experiment_id
      and d.publication_identifier = p_publication_identifier
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
    v_class := nullif(btrim(v_request ->> 'request_class'), '');
    if v_class not in (
      'semantic_capability',
      'authoring_language',
      'runtime_configuration',
      'artifact_workflow',
      'implementation_optimization',
      'security_boundary'
    ) then
      raise exception 'Each request needs one valid request_class.';
    end if;

    if nullif(btrim(v_request ->> 'extension_key'), '') is null
       or nullif(btrim(v_request ->> 'extension_domain'), '') is null
       or nullif(btrim(v_request ->> 'extension_name'), '') is null
       or nullif(btrim(v_request ->> 'extension_definition'), '') is null
       or jsonb_typeof(v_request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(v_request -> 'requirement_keys') = 0 then
      raise exception 'Each request needs extension_key/domain/name/definition and requirement_keys.';
    end if;

    for v_requirement_key in
      select value from jsonb_array_elements_text(v_request -> 'requirement_keys')
    loop
      if not exists (
        select 1 from jsonb_array_elements(p_identified_requirements) req
        where req ->> 'key' = v_requirement_key
          and req ->> 'resolution_status' = 'clear'
      ) then
        raise exception 'Request references requirement % that is absent or ambiguous.', v_requirement_key;
      end if;
    end loop;

    v_canonical_id := nullif(v_request ->> 'canonical_capability_id', '')::uuid;

    if v_class = 'semantic_capability' then
      if v_canonical_id is not null then
        select c.* into v_canonical
        from public.canonical_capabilities c
        where c.id = v_canonical_id;

        if not found then
          raise exception 'Referenced canonical capability does not exist.';
        end if;

        if v_canonical.implementation_state = 'implemented' then
          raise exception
            'Canonical capability % is already implemented; classify the actual remaining gap instead.',
            v_canonical.capability_key;
        end if;
      elsif exists (
        select 1 from public.canonical_capabilities c
        where c.capability_key = btrim(v_request ->> 'extension_key')
      ) then
        raise exception
          'Canonical capability key % already exists; reference its canonical_capability_id instead of proposing it again.',
          btrim(v_request ->> 'extension_key');
      end if;
    elsif v_canonical_id is not null then
      raise exception 'Only semantic-capability requests may reference canonical capability identity.';
    end if;

    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;

    if v_existing_request_id is not null then
      select r.* into v_request_row
      from public.capability_requests r
      where r.id = v_existing_request_id
        and r.requester_id = v_user_id
        and r.status in ('requested', 'approved', 'in_progress')
      for update;

      if not found then
        raise exception 'existing_request_id is missing, not owned by the caller, or terminal.';
      end if;

      if v_request_row.request_class is distinct from v_class
         or v_request_row.canonical_capability_id is distinct from v_canonical_id then
        raise exception 'existing_request_id does not match the submitted stable extension identity.';
      end if;

      if v_request_row.publication_identifier is distinct from p_publication_identifier then
        raise exception 'One request record belongs to one source publication; create a new request for another paper.';
      end if;

      select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
      into v_keys
      from (
        select distinct value as k
        from (
          select value
          from jsonb_array_elements_text(coalesce(v_request_row.requirement_keys, '[]'::jsonb))
          union all
          select value
          from jsonb_array_elements_text(v_request -> 'requirement_keys')
        ) all_keys
      ) deduplicated;

      update public.capability_requests
      set closure_analysis_id = v_analysis.id,
          requirement_keys = v_keys,
          updated_at = now()
      where id = v_request_row.id
      returning * into v_request_row;

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
        requirement_keys,
        request_class,
        extension_key,
        extension_domain,
        extension_name,
        extension_definition,
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
        v_canonical_id,
        btrim(p_publication_identifier),
        btrim(p_publication_title)
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

revoke all on function public.submit_extension_closure(
  uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.submit_extension_closure(
  uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;

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
  v_request_rows jsonb := '[]'::jsonb;
  v_requirement_key text;
  v_class text;
  v_canonical_id uuid;
  v_canonical public.canonical_capabilities;
  v_existing_request_id uuid;
  v_keys jsonb;
  v_next_sequence bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role <> 'professor' then
    raise exception 'Extension-closure revalidation requires a Professor profile.';
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

  if p_analysis_status = 'unblocked' then
    if jsonb_array_length(p_identified_requirements) <> 0
       or jsonb_array_length(p_unresolved_ambiguities) <> 0
       or jsonb_array_length(p_new_requests) <> 0 then
      raise exception 'unblocked requires zero requirements, ambiguities and new requests.';
    end if;
  elsif p_analysis_status = 'best_effort_complete' then
    if jsonb_array_length(p_identified_requirements) = 0
       or jsonb_array_length(p_unresolved_ambiguities) <> 0 then
      raise exception 'best_effort_complete requires remaining requirements and no ambiguity.';
    end if;
  elsif jsonb_array_length(p_unresolved_ambiguities) = 0 then
    raise exception 'partial_due_to_ambiguity requires unresolved ambiguity.';
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
    v_class := nullif(btrim(v_request ->> 'request_class'), '');
    if v_class not in (
      'semantic_capability',
      'authoring_language',
      'runtime_configuration',
      'artifact_workflow',
      'implementation_optimization',
      'security_boundary'
    ) then
      raise exception 'Each request needs one valid request_class.';
    end if;

    if nullif(btrim(v_request ->> 'extension_key'), '') is null
       or nullif(btrim(v_request ->> 'extension_domain'), '') is null
       or nullif(btrim(v_request ->> 'extension_name'), '') is null
       or nullif(btrim(v_request ->> 'extension_definition'), '') is null
       or jsonb_typeof(v_request -> 'requirement_keys') <> 'array'
       or jsonb_array_length(v_request -> 'requirement_keys') = 0 then
      raise exception 'Each request needs extension_key/domain/name/definition and requirement_keys.';
    end if;

    for v_requirement_key in
      select value from jsonb_array_elements_text(v_request -> 'requirement_keys')
    loop
      if not exists (
        select 1 from jsonb_array_elements(p_identified_requirements) req
        where req ->> 'key' = v_requirement_key
          and req ->> 'resolution_status' = 'clear'
      ) then
        raise exception 'Request references requirement % that is absent or ambiguous.', v_requirement_key;
      end if;
    end loop;

    v_canonical_id := nullif(v_request ->> 'canonical_capability_id', '')::uuid;

    if v_class = 'semantic_capability' then
      if v_canonical_id is not null then
        select c.* into v_canonical
        from public.canonical_capabilities c
        where c.id = v_canonical_id;
        if not found then
          raise exception 'Referenced canonical capability does not exist.';
        end if;
        if v_canonical.implementation_state = 'implemented' then
          raise exception 'Referenced canonical capability is already implemented.';
        end if;
      elsif exists (
        select 1 from public.canonical_capabilities c
        where c.capability_key = btrim(v_request ->> 'extension_key')
      ) then
        raise exception 'Existing canonical capability key must be referenced by ID.';
      end if;
    elsif v_canonical_id is not null then
      raise exception 'Only semantic-capability requests may reference canonical capability identity.';
    end if;

    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;

    if v_existing_request_id is not null then
      select r.* into v_request_row
      from public.capability_requests r
      where r.id = v_existing_request_id
        and r.status in ('requested', 'approved', 'in_progress')
      for update;

      if not found then
        raise exception 'existing_request_id is missing or terminal.';
      end if;

      if v_request_row.request_class is distinct from v_class
         or v_request_row.canonical_capability_id is distinct from v_canonical_id
         or v_request_row.publication_identifier is distinct from v_draft.publication_identifier then
        raise exception 'existing_request_id does not match this stable extension task identity.';
      end if;

      select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
      into v_keys
      from (
        select distinct value as k
        from (
          select value
          from jsonb_array_elements_text(coalesce(v_request_row.requirement_keys, '[]'::jsonb))
          union all
          select value
          from jsonb_array_elements_text(v_request -> 'requirement_keys')
        ) all_keys
      ) deduplicated;

      update public.capability_requests
      set closure_analysis_id = v_analysis.id,
          requirement_keys = v_keys,
          updated_at = now()
      where id = v_request_row.id
      returning * into v_request_row;
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
        requirement_keys,
        request_class,
        extension_key,
        extension_domain,
        extension_name,
        extension_definition,
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
        v_canonical_id,
        v_draft.publication_identifier,
        v_draft.publication_title
      )
      returning * into v_request_row;
    end if;

    v_request_rows := v_request_rows || jsonb_build_array(to_jsonb(v_request_row));
  end loop;

  if p_analysis_status = 'unblocked' then
    update public.blocked_experiment_drafts
    set lifecycle = 'unblocked'
    where id = v_draft.id
    returning * into v_draft;
  end if;

  return jsonb_build_object(
    'blocked_experiment', to_jsonb(v_draft),
    'analysis', to_jsonb(v_analysis),
    'requests', v_request_rows
  );
end;
$$;

revoke all on function public.revalidate_extension_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.revalidate_extension_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) to authenticated;

-- Semantic development is now anchored to canonical capability identity.
drop index if exists public.capability_requests_github_issue_number_unique;
drop index if exists public.capability_requests_github_issue_url_unique;

create index if not exists capability_requests_github_issue_number_idx
  on public.capability_requests(github_issue_number)
  where github_issue_number is not null;

create index if not exists capability_requests_github_issue_url_idx
  on public.capability_requests(github_issue_url)
  where github_issue_url is not null;

create or replace function private.claim_capability_request_for_development(
  p_request_id uuid,
  p_github_issue_number bigint,
  p_github_issue_url text,
  p_developer_notes text default null
)
returns public.capability_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_request public.capability_requests;
  expected_issue_url text;
begin
  select * into current_request
  from public.capability_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Extension request % does not exist.', p_request_id;
  end if;

  if current_request.request_class = 'semantic_capability' then
    raise exception 'Semantic requests are developed through canonical capability identity.';
  end if;

  if p_github_issue_number is null or p_github_issue_number <= 0 then
    raise exception 'GitHub issue number must be positive.';
  end if;

  expected_issue_url := format(
    'https://github.com/eliseofe/virtual-lab/issues/%s',
    p_github_issue_number
  );

  if btrim(coalesce(p_github_issue_url, '')) <> expected_issue_url then
    raise exception 'GitHub issue URL must be canonical for issue %.', p_github_issue_number;
  end if;

  if current_request.status = 'approved' then
    update public.capability_requests
    set status = 'in_progress',
        github_issue_number = p_github_issue_number,
        github_issue_url = expected_issue_url,
        development_started_at = now(),
        developer_notes = nullif(btrim(coalesce(p_developer_notes, '')), '')
    where id = p_request_id
    returning * into current_request;
    return current_request;
  end if;

  if current_request.status = 'in_progress'
     and current_request.github_issue_number = p_github_issue_number
     and current_request.github_issue_url = expected_issue_url then
    return current_request;
  end if;

  raise exception 'Extension request % cannot be claimed from status %.', p_request_id, current_request.status;
end;
$$;

revoke execute on function private.claim_capability_request_for_development(
  uuid, bigint, text, text
) from public, anon, authenticated, service_role;

create or replace function private.claim_canonical_capability_for_development(
  p_capability_id uuid,
  p_github_issue_number bigint,
  p_github_issue_url text,
  p_developer_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capability public.canonical_capabilities;
  v_expected_url text;
  v_requests jsonb;
begin
  if p_github_issue_number is null or p_github_issue_number <= 0 then
    raise exception 'GitHub issue number must be positive.';
  end if;

  v_expected_url := format(
    'https://github.com/eliseofe/virtual-lab/issues/%s',
    p_github_issue_number
  );

  if btrim(coalesce(p_github_issue_url, '')) <> v_expected_url then
    raise exception 'GitHub issue URL must be canonical for issue %.', p_github_issue_number;
  end if;

  select c.* into v_capability
  from public.canonical_capabilities c
  where c.id = p_capability_id
  for update;

  if not found then
    raise exception 'Canonical capability does not exist.';
  end if;
  if v_capability.implementation_state = 'implemented' then
    raise exception 'Canonical capability % is already implemented.', v_capability.capability_key;
  end if;

  if v_capability.github_issue_number is null then
    update public.canonical_capabilities
    set github_issue_number = p_github_issue_number,
        github_issue_url = v_expected_url,
        development_started_at = now()
    where id = p_capability_id
    returning * into v_capability;
  elsif v_capability.github_issue_number <> p_github_issue_number
     or v_capability.github_issue_url <> v_expected_url then
    raise exception 'Canonical capability is already linked to different engineering work.';
  end if;

  update public.capability_requests
  set status = 'in_progress',
      github_issue_number = p_github_issue_number,
      github_issue_url = v_expected_url,
      development_started_at = coalesce(development_started_at, now()),
      developer_notes = case
        when p_developer_notes is null then developer_notes
        else nullif(btrim(p_developer_notes), '')
      end
  where canonical_capability_id = p_capability_id
    and status = 'approved';

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb)
  into v_requests
  from public.capability_requests r
  where r.canonical_capability_id = p_capability_id
    and r.status = 'in_progress'
    and r.github_issue_number = p_github_issue_number;

  if jsonb_array_length(v_requests) = 0 then
    raise exception 'No Professor-approved request is available to authorize development of this canonical capability.';
  end if;

  return jsonb_build_object(
    'canonical_capability', to_jsonb(v_capability),
    'requests', v_requests
  );
end;
$$;

revoke execute on function private.claim_canonical_capability_for_development(
  uuid, bigint, text, text
) from public, anon, authenticated, service_role;

create or replace function private.complete_canonical_capability_development(
  p_capability_id uuid,
  p_implementation_contracts text[],
  p_implementation_version text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capability public.canonical_capabilities;
  v_requests jsonb;
begin
  if coalesce(array_length(p_implementation_contracts, 1), 0) = 0 then
    raise exception 'At least one deployed implementation contract/version is required.';
  end if;
  if nullif(btrim(coalesce(p_implementation_version, '')), '') is null then
    raise exception 'implementation_version is required.';
  end if;

  select c.* into v_capability
  from public.canonical_capabilities c
  where c.id = p_capability_id
  for update;

  if not found then
    raise exception 'Canonical capability does not exist.';
  end if;
  if v_capability.github_issue_number is null then
    raise exception 'Canonical capability has no authorized development handoff.';
  end if;

  update public.canonical_capabilities
  set implementation_state = 'implemented',
      implementation_contracts = p_implementation_contracts,
      implementation_version = btrim(p_implementation_version),
      implemented_at = now(),
      updated_at = now()
  where id = p_capability_id
  returning * into v_capability;

  update public.capability_requests
  set status = 'implemented',
      implemented_contract_version = array_to_string(p_implementation_contracts, ','),
      implemented_capability_version = btrim(p_implementation_version),
      implemented_at = v_capability.implemented_at
  where canonical_capability_id = p_capability_id
    and status in ('approved', 'in_progress');

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb)
  into v_requests
  from public.capability_requests r
  where r.canonical_capability_id = p_capability_id
    and r.status = 'implemented';

  return jsonb_build_object(
    'canonical_capability', to_jsonb(v_capability),
    'fulfilled_requests', v_requests
  );
end;
$$;

revoke execute on function private.complete_canonical_capability_development(
  uuid, text[], text
) from public, anon, authenticated, service_role;
