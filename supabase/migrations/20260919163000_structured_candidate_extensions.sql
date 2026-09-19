-- #374: structured candidate capabilities and contract deltas at request creation.
-- Candidates are durable unavailable design truth. They never participate in compiler acceptance.

alter table public.capability_request_evidence
  add column if not exists relationship text not null default 'covered',
  add column if not exists generalization_note text;

alter table public.capability_request_evidence
  drop constraint if exists capability_request_evidence_relationship,
  add constraint capability_request_evidence_relationship
    check (relationship in ('covered', 'generalization_needed')),
  drop constraint if exists capability_request_evidence_generalization_note,
  add constraint capability_request_evidence_generalization_note
    check (
      (relationship = 'covered' and generalization_note is null)
      or (
        relationship = 'generalization_needed'
        and nullif(btrim(coalesce(generalization_note, '')), '') is not null
      )
    );

comment on column public.capability_request_evidence.relationship is
  'How this closure evidence relates to the durable candidate: covered or generalization_needed.';
comment on column public.capability_request_evidence.generalization_note is
  'Professor-visible scientific/model explanation when later evidence is plausibly related but the existing candidate is too narrow or ambiguous.';

grant update (relationship, generalization_note)
  on public.capability_request_evidence to authenticated;

drop policy if exists "capability_request_evidence_update_owned"
  on public.capability_request_evidence;
create policy "capability_request_evidence_update_owned"
on public.capability_request_evidence
for update
to authenticated
using (linked_by = (select auth.uid()))
with check (linked_by = (select auth.uid()));

create table public.candidate_capabilities (
  request_id uuid primary key references public.capability_requests(id) on delete cascade,
  capability_key text not null unique,
  capability_domain text not null,
  capability_name text not null,
  canonical_definition text not null,
  target_artifact text not null,
  target_runtime_domain text not null,
  authoring_surfaces jsonb not null,
  availability text not null default 'candidate_unavailable',
  request_status text not null,
  request_created_at timestamptz not null,
  request_updated_at timestamptz not null,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint candidate_capabilities_text_nonempty check (
    length(btrim(capability_key)) > 0
    and length(btrim(capability_domain)) > 0
    and length(btrim(capability_name)) > 0
    and length(btrim(canonical_definition)) > 0
    and length(btrim(target_artifact)) > 0
    and length(btrim(target_runtime_domain)) > 0
  ),
  constraint candidate_capabilities_surfaces_array check (
    jsonb_typeof(authoring_surfaces) = 'array'
    and jsonb_array_length(authoring_surfaces) > 0
  ),
  constraint candidate_capabilities_availability check (
    availability in ('candidate_unavailable', 'superseded_implemented', 'resolved_by_owner')
  ),
  constraint candidate_capabilities_request_status check (
    request_status in ('requested', 'approved', 'declined', 'in_progress', 'implemented')
  )
);

comment on table public.candidate_capabilities is
  'Durable unavailable semantic candidate identity created with an extension request. Same conceptual scientific capability shape as implemented capability truth, plus the concrete authoring surfaces required to express it, but with no implementation/version evidence.';

alter table public.candidate_capabilities enable row level security;
revoke all on table public.candidate_capabilities from public, anon, authenticated;
grant select, insert on table public.candidate_capabilities to authenticated;

create policy "candidate_capabilities_authenticated_read"
on public.candidate_capabilities
for select
to authenticated
using (true);

create policy "candidate_capabilities_insert_own_request"
on public.candidate_capabilities
for insert
to authenticated
with check (
  exists (
    select 1
    from public.capability_requests r
    where r.id = candidate_capabilities.request_id
      and r.requester_id = (select auth.uid())
      and r.request_class = 'semantic_capability'
  )
);

create table public.candidate_contract_deltas (
  request_id uuid primary key references public.capability_requests(id) on delete cascade,
  request_class text not null,
  delta_key text not null,
  delta_name text not null,
  target_contract_path text not null,
  requested_change text not null,
  availability text not null default 'candidate_unavailable',
  request_status text not null,
  request_created_at timestamptz not null,
  request_updated_at timestamptz not null,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (request_class, delta_key),

  constraint candidate_contract_deltas_class check (
    request_class in (
      'authoring_language',
      'runtime_configuration',
      'artifact_workflow',
      'implementation_optimization',
      'security_boundary'
    )
  ),
  constraint candidate_contract_deltas_text_nonempty check (
    length(btrim(delta_key)) > 0
    and length(btrim(delta_name)) > 0
    and length(btrim(target_contract_path)) > 0
    and length(btrim(requested_change)) > 0
  ),
  constraint candidate_contract_deltas_target_root check (
    target_contract_path ~ '^(runtime_contract|artifacts\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\.|$)'
  ),
  constraint candidate_contract_deltas_availability check (
    availability in ('candidate_unavailable', 'superseded_implemented', 'resolved_by_owner')
  ),
  constraint candidate_contract_deltas_request_status check (
    request_status in ('requested', 'approved', 'declined', 'in_progress', 'implemented')
  )
);

comment on table public.candidate_contract_deltas is
  'Durable unavailable non-semantic candidate extension stated directly against a precise stable authoring/platform-contract path.';

alter table public.candidate_contract_deltas enable row level security;
revoke all on table public.candidate_contract_deltas from public, anon, authenticated;
grant select, insert on table public.candidate_contract_deltas to authenticated;

create policy "candidate_contract_deltas_authenticated_read"
on public.candidate_contract_deltas
for select
to authenticated
using (true);

create policy "candidate_contract_deltas_insert_own_request"
on public.candidate_contract_deltas
for insert
to authenticated
with check (
  exists (
    select 1
    from public.capability_requests r
    where r.id = candidate_contract_deltas.request_id
      and r.requester_id = (select auth.uid())
      and r.request_class = candidate_contract_deltas.request_class
      and r.request_class <> 'semantic_capability'
  )
);

create or replace function private.validate_candidate_capability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target_artifact not in ('configuration', 'initialization', 'controller', 'metrics', 'environment', 'runtime') then
    raise exception 'candidate capability target_artifact is not a recognized Virtual Lab authoring/runtime domain.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.authoring_surfaces) surface
    where jsonb_typeof(surface) <> 'object'
       or nullif(btrim(surface ->> 'artifact'), '') is null
       or nullif(btrim(surface ->> 'kind'), '') is null
       or nullif(btrim(surface ->> 'symbol'), '') is null
  ) then
    raise exception 'Each candidate capability authoring surface needs artifact, kind and symbol.';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_candidate_capability()
  from public, anon, authenticated;

drop trigger if exists validate_candidate_capability
  on public.candidate_capabilities;
create trigger validate_candidate_capability
before insert or update
on public.candidate_capabilities
for each row execute function private.validate_candidate_capability();

create or replace function private.sync_candidate_request_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_availability text;
  v_superseded_at timestamptz;
begin
  v_availability := case
    when new.status = 'implemented' then 'superseded_implemented'
    else 'candidate_unavailable'
  end;
  v_superseded_at := case when new.status = 'implemented' then coalesce(new.implemented_at, now()) else null end;

  update public.candidate_capabilities
  set request_status = new.status,
      request_updated_at = new.updated_at,
      availability = v_availability,
      superseded_at = v_superseded_at,
      updated_at = now()
  where request_id = new.id;

  update public.candidate_contract_deltas
  set request_status = new.status,
      request_updated_at = new.updated_at,
      availability = v_availability,
      superseded_at = v_superseded_at,
      updated_at = now()
  where request_id = new.id;

  return new;
end;
$$;

revoke execute on function private.sync_candidate_request_lifecycle()
  from public, anon, authenticated;

drop trigger if exists sync_candidate_request_lifecycle
  on public.capability_requests;
create trigger sync_candidate_request_lifecycle
after update of status, updated_at, implemented_at
on public.capability_requests
for each row execute function private.sync_candidate_request_lifecycle();

-- Keep the old internal request lookup usable for declined historical candidates.
alter table public.active_extension_request_catalog
  drop constraint if exists active_extension_request_catalog_status,
  add constraint active_extension_request_catalog_status
    check (status in ('requested', 'approved', 'declined', 'in_progress'));

create or replace function private.sync_active_extension_request_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.active_extension_request_catalog
    where request_id = old.id;
    return old;
  end if;

  if new.status in ('requested', 'approved', 'declined', 'in_progress')
     and new.request_class is not null
     and nullif(btrim(coalesce(new.extension_key, '')), '') is not null
     and nullif(btrim(coalesce(new.extension_domain, '')), '') is not null
     and nullif(btrim(coalesce(new.extension_name, '')), '') is not null
     and nullif(btrim(coalesce(new.extension_definition, '')), '') is not null then
    insert into public.active_extension_request_catalog (
      request_id,
      request_class,
      extension_key,
      extension_domain,
      extension_name,
      extension_definition,
      status,
      updated_at
    )
    values (
      new.id,
      new.request_class,
      btrim(new.extension_key),
      btrim(new.extension_domain),
      btrim(new.extension_name),
      btrim(new.extension_definition),
      new.status,
      now()
    )
    on conflict (request_id) do update
    set request_class = excluded.request_class,
        extension_key = excluded.extension_key,
        extension_domain = excluded.extension_domain,
        extension_name = excluded.extension_name,
        extension_definition = excluded.extension_definition,
        status = excluded.status,
        updated_at = excluded.updated_at;
  else
    delete from public.active_extension_request_catalog
    where request_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function private.sync_active_extension_request_catalog()
  from public, anon, authenticated;

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
        'requested_artifact_type', btrim(v_spec ->> 'target_artifact')
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
        'context', coalesce(v_request ->> 'context', '')
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

revoke all on function private.legacy_extension_requests_from_candidates(jsonb)
  from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.legacy_extension_requests_from_candidates(jsonb)
  to authenticated;

create or replace function public.submit_structured_extension_closure(
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
  v_request jsonb;
  v_spec jsonb;
  v_existing_request_id uuid;
  v_new_request public.capability_requests;
  v_analysis_id uuid;
  v_submission jsonb;
  v_legacy_requests jsonb;
  v_relation text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;
    if v_existing_request_id is not null then
      if not exists (
        select 1 from public.candidate_capabilities c
        where c.request_id = v_existing_request_id
          and c.availability = 'candidate_unavailable'
        union all
        select 1 from public.candidate_contract_deltas d
        where d.request_id = v_existing_request_id
          and d.availability = 'candidate_unavailable'
      ) then
        raise exception 'existing_request_id must reference a visible unavailable candidate.';
      end if;
    elsif v_request ->> 'request_class' = 'semantic_capability' then
      v_spec := v_request -> 'candidate_capability';
      if exists (
        select 1 from public.candidate_capabilities c
        where c.capability_key = btrim(v_spec ->> 'capability_key')
      ) then
        raise exception 'Candidate capability identity already exists; reuse its request_id instead of creating a duplicate.';
      end if;
    else
      v_spec := v_request -> 'candidate_contract_delta';
      if exists (
        select 1 from public.candidate_contract_deltas d
        where d.request_class = v_request ->> 'request_class'
          and d.delta_key = btrim(v_spec ->> 'delta_key')
      ) then
        raise exception 'Candidate contract-delta identity already exists; reuse its request_id instead of creating a duplicate.';
      end if;
    end if;
  end loop;

  v_legacy_requests := private.legacy_extension_requests_from_candidates(p_requests);

  v_submission := public.submit_extension_closure(
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
    p_identified_requirements => p_identified_requirements,
    p_unresolved_ambiguities => p_unresolved_ambiguities,
    p_requests => v_legacy_requests
  );

  v_analysis_id := (v_submission -> 'analysis' ->> 'id')::uuid;

  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;
    if v_existing_request_id is not null then
      v_relation := coalesce(nullif(v_request ->> 'relationship', ''), 'covered');
      update public.capability_request_evidence
      set relationship = v_relation,
          generalization_note = case
            when v_relation = 'generalization_needed'
              then btrim(v_request ->> 'generalization_note')
            else null
          end
      where request_id = v_existing_request_id
        and closure_analysis_id = v_analysis_id;
      continue;
    end if;

    if v_request ->> 'request_class' = 'semantic_capability' then
      v_spec := v_request -> 'candidate_capability';
      select r.* into v_new_request
      from public.capability_requests r
      where r.closure_analysis_id = v_analysis_id
        and r.request_class = 'semantic_capability'
        and r.extension_key = btrim(v_spec ->> 'capability_key')
      order by r.created_at desc
      limit 1;

      if not found then
        raise exception 'Structured semantic request row was not created.';
      end if;

      insert into public.candidate_capabilities (
        request_id,
        capability_key,
        capability_domain,
        capability_name,
        canonical_definition,
        target_artifact,
        target_runtime_domain,
        authoring_surfaces,
        availability,
        request_status,
        request_created_at,
        request_updated_at
      )
      values (
        v_new_request.id,
        btrim(v_spec ->> 'capability_key'),
        btrim(v_spec ->> 'capability_domain'),
        btrim(v_spec ->> 'capability_name'),
        btrim(v_spec ->> 'scientific_definition'),
        btrim(v_spec ->> 'target_artifact'),
        btrim(v_spec ->> 'target_runtime_domain'),
        v_spec -> 'authoring_surfaces',
        'candidate_unavailable',
        v_new_request.status,
        v_new_request.created_at,
        v_new_request.updated_at
      );
    else
      v_spec := v_request -> 'candidate_contract_delta';
      select r.* into v_new_request
      from public.capability_requests r
      where r.closure_analysis_id = v_analysis_id
        and r.request_class = v_request ->> 'request_class'
        and r.extension_key = btrim(v_spec ->> 'delta_key')
      order by r.created_at desc
      limit 1;

      if not found then
        raise exception 'Structured contract-delta request row was not created.';
      end if;

      insert into public.candidate_contract_deltas (
        request_id,
        request_class,
        delta_key,
        delta_name,
        target_contract_path,
        requested_change,
        availability,
        request_status,
        request_created_at,
        request_updated_at
      )
      values (
        v_new_request.id,
        v_new_request.request_class,
        btrim(v_spec ->> 'delta_key'),
        btrim(v_spec ->> 'delta_name'),
        btrim(v_spec ->> 'target_contract_path'),
        btrim(v_spec ->> 'requested_change'),
        'candidate_unavailable',
        v_new_request.status,
        v_new_request.created_at,
        v_new_request.updated_at
      );
    end if;
  end loop;

  return v_submission || jsonb_build_object(
    'candidate_capability_interface', 'vlab.candidate-capability/1',
    'candidate_contract_delta_interface', 'vlab.candidate-contract-delta/1'
  );
end;
$$;

revoke all on function public.submit_structured_extension_closure(
  uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.submit_structured_extension_closure(
  uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;

create or replace function public.revalidate_structured_extension_closure(
  p_blocked_experiment_id uuid,
  p_base_analysis_sequence bigint,
  p_contract_version text,
  p_analysis_status text,
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
  v_request jsonb;
  v_spec jsonb;
  v_existing_request_id uuid;
  v_new_request public.capability_requests;
  v_analysis_id uuid;
  v_submission jsonb;
  v_legacy_requests jsonb;
  v_relation text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;
    if v_existing_request_id is not null then
      if not exists (
        select 1 from public.candidate_capabilities c
        where c.request_id = v_existing_request_id
          and c.availability = 'candidate_unavailable'
        union all
        select 1 from public.candidate_contract_deltas d
        where d.request_id = v_existing_request_id
          and d.availability = 'candidate_unavailable'
      ) then
        raise exception 'existing_request_id must reference a visible unavailable candidate.';
      end if;
    elsif v_request ->> 'request_class' = 'semantic_capability' then
      v_spec := v_request -> 'candidate_capability';
      if exists (
        select 1 from public.candidate_capabilities c
        where c.capability_key = btrim(v_spec ->> 'capability_key')
      ) then
        raise exception 'Candidate capability identity already exists; reuse its request_id instead of creating a duplicate.';
      end if;
    else
      v_spec := v_request -> 'candidate_contract_delta';
      if exists (
        select 1 from public.candidate_contract_deltas d
        where d.request_class = v_request ->> 'request_class'
          and d.delta_key = btrim(v_spec ->> 'delta_key')
      ) then
        raise exception 'Candidate contract-delta identity already exists; reuse its request_id instead of creating a duplicate.';
      end if;
    end if;
  end loop;

  v_legacy_requests := private.legacy_extension_requests_from_candidates(p_requests);

  v_submission := public.revalidate_extension_closure(
    p_blocked_experiment_id => p_blocked_experiment_id,
    p_base_analysis_sequence => p_base_analysis_sequence,
    p_contract_version => p_contract_version,
    p_analysis_status => p_analysis_status,
    p_identified_requirements => p_identified_requirements,
    p_unresolved_ambiguities => p_unresolved_ambiguities,
    p_new_requests => v_legacy_requests
  );

  v_analysis_id := (v_submission -> 'analysis' ->> 'id')::uuid;

  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    v_existing_request_id := nullif(v_request ->> 'existing_request_id', '')::uuid;
    if v_existing_request_id is not null then
      v_relation := coalesce(nullif(v_request ->> 'relationship', ''), 'covered');
      update public.capability_request_evidence
      set relationship = v_relation,
          generalization_note = case
            when v_relation = 'generalization_needed'
              then btrim(v_request ->> 'generalization_note')
            else null
          end
      where request_id = v_existing_request_id
        and closure_analysis_id = v_analysis_id;
      continue;
    end if;

    if v_request ->> 'request_class' = 'semantic_capability' then
      v_spec := v_request -> 'candidate_capability';
      select r.* into v_new_request
      from public.capability_requests r
      where r.closure_analysis_id = v_analysis_id
        and r.request_class = 'semantic_capability'
        and r.extension_key = btrim(v_spec ->> 'capability_key')
      order by r.created_at desc
      limit 1;

      if not found then
        raise exception 'Structured semantic request row was not created.';
      end if;

      insert into public.candidate_capabilities (
        request_id, capability_key, capability_domain, capability_name,
        canonical_definition, target_artifact, target_runtime_domain,
        authoring_surfaces, availability, request_status,
        request_created_at, request_updated_at
      )
      values (
        v_new_request.id,
        btrim(v_spec ->> 'capability_key'),
        btrim(v_spec ->> 'capability_domain'),
        btrim(v_spec ->> 'capability_name'),
        btrim(v_spec ->> 'scientific_definition'),
        btrim(v_spec ->> 'target_artifact'),
        btrim(v_spec ->> 'target_runtime_domain'),
        v_spec -> 'authoring_surfaces',
        'candidate_unavailable',
        v_new_request.status,
        v_new_request.created_at,
        v_new_request.updated_at
      );
    else
      v_spec := v_request -> 'candidate_contract_delta';
      select r.* into v_new_request
      from public.capability_requests r
      where r.closure_analysis_id = v_analysis_id
        and r.request_class = v_request ->> 'request_class'
        and r.extension_key = btrim(v_spec ->> 'delta_key')
      order by r.created_at desc
      limit 1;

      if not found then
        raise exception 'Structured contract-delta request row was not created.';
      end if;

      insert into public.candidate_contract_deltas (
        request_id, request_class, delta_key, delta_name,
        target_contract_path, requested_change, availability, request_status,
        request_created_at, request_updated_at
      )
      values (
        v_new_request.id,
        v_new_request.request_class,
        btrim(v_spec ->> 'delta_key'),
        btrim(v_spec ->> 'delta_name'),
        btrim(v_spec ->> 'target_contract_path'),
        btrim(v_spec ->> 'requested_change'),
        'candidate_unavailable',
        v_new_request.status,
        v_new_request.created_at,
        v_new_request.updated_at
      );
    end if;
  end loop;

  return v_submission || jsonb_build_object(
    'candidate_capability_interface', 'vlab.candidate-capability/1',
    'candidate_contract_delta_interface', 'vlab.candidate-contract-delta/1'
  );
end;
$$;

revoke all on function public.revalidate_structured_extension_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.revalidate_structured_extension_closure(
  uuid, bigint, text, text, jsonb, jsonb, jsonb
) to authenticated;
