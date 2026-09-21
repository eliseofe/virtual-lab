-- #472: expose Professor dispositions end-to-end and support same-candidate requester revision.
-- No request/candidate/evidence identity is recreated.

alter table public.capability_request_professor_reviews
  drop constraint if exists capability_request_professor_reviews_revise_guidance,
  add constraint capability_request_professor_reviews_revise_guidance
    check (disposition <> 'revise' or guidance is not null);

alter table public.capability_requests
  drop constraint if exists capability_requests_revise_guidance,
  add constraint capability_requests_revise_guidance
    check (professor_disposition <> 'revise' or professor_guidance is not null);

alter table public.candidate_generalization_revisions
  add column if not exists revision_source text not null default 'professor_generalization',
  add column if not exists requester_note text;

alter table public.candidate_generalization_revisions
  drop constraint if exists candidate_generalization_revisions_source,
  add constraint candidate_generalization_revisions_source
    check (revision_source in ('professor_generalization', 'requester_revision')),
  drop constraint if exists candidate_generalization_revisions_requester_note_nonempty,
  add constraint candidate_generalization_revisions_requester_note_nonempty
    check (requester_note is null or length(btrim(requester_note)) > 0);

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
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_request public.capability_requests;
  v_disposition text;
  v_next_status text;
  v_guidance text := nullif(btrim(coalesce(p_professor_notes, '')), '');
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

  v_disposition := case btrim(coalesce(p_decision, ''))
    when 'approved' then 'accepted'
    when 'accepted' then 'accepted'
    when 'declined' then 'rejected'
    when 'rejected' then 'rejected'
    when 'revise' then 'revise'
    when 'deferred' then 'deferred'
    when 'future' then 'future'
    else null
  end;

  if v_disposition is null then
    raise exception 'decision must be accepted, rejected, revise, deferred, or future.';
  end if;

  if v_disposition = 'revise' and v_guidance is null then
    raise exception 'Revise requires Professor guidance describing what must change.';
  end if;

  select r.* into v_request
  from public.capability_requests r
  where r.id = p_request_id
    and r.status = 'requested'
    and r.professor_disposition = 'pending'
  for update;

  if not found then
    raise exception 'Request is missing, not visible, or no longer pending Professor review.';
  end if;

  v_next_status := case v_disposition
    when 'accepted' then 'approved'
    when 'rejected' then 'declined'
    else 'requested'
  end;

  update public.capability_requests
  set status = v_next_status,
      professor_disposition = v_disposition,
      professor_guidance = v_guidance,
      professor_disposition_reviewed_by = v_user_id,
      professor_disposition_reviewed_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$function$;

create or replace function private.revise_candidate_extension_for_requester(
  p_request_id uuid,
  p_candidate_capability jsonb default null,
  p_candidate_contract_delta jsonb default null,
  p_requester_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.capability_requests;
  v_capability public.candidate_capabilities;
  v_delta public.candidate_contract_deltas;
  v_previous jsonb;
  v_revised jsonb;
  v_revision integer;
  v_spec jsonb;
  v_domain text;
  v_name text;
  v_definition text;
  v_target_artifact text;
  v_runtime_domain text;
  v_surfaces jsonb;
  v_key text;
  v_delta_name text;
  v_target_contract_path text;
  v_requested_change text;
  v_note text := nullif(btrim(coalesce(p_requester_note, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select r.* into v_request
  from public.capability_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Candidate request was not found.';
  end if;

  if v_request.requester_id <> v_user_id then
    raise exception 'Only the original requester may submit a candidate revision.';
  end if;

  if v_request.status <> 'requested' or v_request.professor_disposition <> 'revise' then
    raise exception 'Candidate revision requires a requested item with Professor disposition revise.';
  end if;

  if v_request.request_class = 'semantic_capability' then
    if p_candidate_capability is null or p_candidate_contract_delta is not null then
      raise exception 'Semantic candidate revision requires revised_candidate_capability only.';
    end if;

    select c.* into v_capability
    from public.candidate_capabilities c
    where c.request_id = p_request_id
      and c.availability = 'candidate_unavailable'
    for update;

    if not found then
      raise exception 'Unavailable semantic candidate was not found.';
    end if;

    v_spec := p_candidate_capability;
    if jsonb_typeof(v_spec) <> 'object' then
      raise exception 'revised_candidate_capability must be an object.';
    end if;

    v_key := nullif(btrim(v_spec ->> 'capability_key'), '');
    v_domain := nullif(btrim(v_spec ->> 'capability_domain'), '');
    v_name := nullif(btrim(v_spec ->> 'capability_name'), '');
    v_definition := nullif(btrim(v_spec ->> 'scientific_definition'), '');
    v_target_artifact := nullif(btrim(v_spec ->> 'target_artifact'), '');
    v_runtime_domain := nullif(btrim(v_spec ->> 'target_runtime_domain'), '');
    v_surfaces := v_spec -> 'authoring_surfaces';

    if v_key is null or v_domain is null or v_name is null or v_definition is null
       or v_target_artifact is null or v_runtime_domain is null
       or jsonb_typeof(v_surfaces) <> 'array'
       or jsonb_array_length(v_surfaces) = 0 then
      raise exception 'Revised semantic candidate requires key, domain, name, scientific definition, target artifact/runtime domain, and authoring surfaces.';
    end if;

    if v_target_artifact not in ('configuration', 'initialization', 'controller', 'metrics', 'environment', 'runtime') then
      raise exception 'revised candidate target_artifact is not a recognized Virtual Lab authoring/runtime domain.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_surfaces) surface
      where jsonb_typeof(surface) <> 'object'
         or nullif(btrim(surface ->> 'artifact'), '') is null
         or nullif(btrim(surface ->> 'kind'), '') is null
         or nullif(btrim(surface ->> 'symbol'), '') is null
    ) then
      raise exception 'Each revised authoring surface needs artifact, kind and symbol.';
    end if;

    if exists (
      select 1 from public.canonical_capabilities c
      where c.capability_key = v_key
    ) then
      raise exception 'Revised semantic key already has canonical capability identity; use implemented capability truth.';
    end if;

    if exists (
      select 1 from public.candidate_capabilities c
      where c.capability_key = v_key
        and c.request_id <> p_request_id
    ) then
      raise exception 'Revised semantic key already belongs to another candidate; reuse that candidate instead.';
    end if;

    v_previous := to_jsonb(v_capability);
    v_revision := v_capability.generalization_revision + 1;

    update public.candidate_capabilities
    set capability_key = v_key,
        capability_domain = v_domain,
        capability_name = v_name,
        canonical_definition = v_definition,
        target_artifact = v_target_artifact,
        target_runtime_domain = v_runtime_domain,
        authoring_surfaces = v_surfaces,
        generalization_revision = v_revision,
        generalized_by = v_user_id,
        generalized_at = now(),
        updated_at = now()
    where request_id = p_request_id
    returning * into v_capability;

    v_revised := to_jsonb(v_capability);

    update public.capability_requests
    set capability_domain = v_domain,
        capability_name = v_name,
        extension_key = v_key,
        extension_domain = v_domain,
        extension_name = v_name,
        extension_definition = v_definition,
        requested_artifact_type = v_target_artifact,
        professor_disposition = 'pending',
        professor_guidance = null,
        professor_disposition_reviewed_by = null,
        professor_disposition_reviewed_at = null
    where id = p_request_id
    returning * into v_request;

  else
    if p_candidate_contract_delta is null or p_candidate_capability is not null then
      raise exception 'Contract-delta revision requires revised_candidate_contract_delta only.';
    end if;

    select d.* into v_delta
    from public.candidate_contract_deltas d
    where d.request_id = p_request_id
      and d.availability = 'candidate_unavailable'
    for update;

    if not found then
      raise exception 'Unavailable candidate contract delta was not found.';
    end if;

    v_spec := p_candidate_contract_delta;
    if jsonb_typeof(v_spec) <> 'object' then
      raise exception 'revised_candidate_contract_delta must be an object.';
    end if;

    v_key := nullif(btrim(v_spec ->> 'delta_key'), '');
    v_delta_name := nullif(btrim(v_spec ->> 'delta_name'), '');
    v_target_contract_path := nullif(btrim(v_spec ->> 'target_contract_path'), '');
    v_requested_change := nullif(btrim(v_spec ->> 'requested_change'), '');

    if v_key is null or v_delta_name is null or v_target_contract_path is null or v_requested_change is null then
      raise exception 'Revised contract delta requires key, name, target contract path, and requested change.';
    end if;

    if v_target_contract_path !~
      '^(runtime_contract|artifacts\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\.|$)' then
      raise exception 'revised candidate_contract_delta target_contract_path does not reference the stable authoring/platform contract.';
    end if;

    if exists (
      select 1 from public.candidate_contract_deltas d
      where d.request_class = v_request.request_class
        and d.delta_key = v_key
        and d.request_id <> p_request_id
    ) then
      raise exception 'Revised contract-delta key already belongs to another candidate; reuse that candidate instead.';
    end if;

    v_previous := to_jsonb(v_delta);
    v_revision := v_delta.generalization_revision + 1;

    update public.candidate_contract_deltas
    set delta_key = v_key,
        delta_name = v_delta_name,
        target_contract_path = v_target_contract_path,
        requested_change = v_requested_change,
        generalization_revision = v_revision,
        generalized_by = v_user_id,
        generalized_at = now(),
        updated_at = now()
    where request_id = p_request_id
    returning * into v_delta;

    v_revised := to_jsonb(v_delta);

    update public.capability_requests
    set extension_key = v_key,
        extension_name = v_delta_name,
        extension_definition = v_requested_change,
        professor_disposition = 'pending',
        professor_guidance = null,
        professor_disposition_reviewed_by = null,
        professor_disposition_reviewed_at = null
    where id = p_request_id
    returning * into v_request;
  end if;

  insert into public.candidate_generalization_revisions (
    request_id,
    candidate_kind,
    revision,
    previous_candidate,
    generalized_candidate,
    generalized_by,
    professor_note,
    resolved_generalization_evidence_count,
    revision_source,
    requester_note
  )
  values (
    p_request_id,
    case when v_request.request_class = 'semantic_capability' then 'semantic_capability' else 'contract_delta' end,
    v_revision,
    v_previous,
    v_revised,
    v_user_id,
    null,
    0,
    'requester_revision',
    v_note
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'request_class', v_request.request_class,
    'generalization_revision', v_revision,
    'revision_source', 'requester_revision',
    'candidate', v_revised,
    'professor_disposition', v_request.professor_disposition
  );
end;
$function$;

revoke all on function private.revise_candidate_extension_for_requester(uuid, jsonb, jsonb, text) from public;
revoke all on function private.revise_candidate_extension_for_requester(uuid, jsonb, jsonb, text) from anon;
grant execute on function private.revise_candidate_extension_for_requester(uuid, jsonb, jsonb, text) to authenticated;

create or replace function public.submit_structured_extension_closure_v8(
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
set search_path = ''
as $function$
declare
  v_request jsonb;
  v_revision jsonb;
  v_revisions jsonb := '[]'::jsonb;
  v_submission jsonb;
begin
  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    if nullif(v_request ->> 'existing_request_id', '') is not null
       and (
         v_request ? 'revised_candidate_capability'
         or v_request ? 'revised_candidate_contract_delta'
       ) then
      v_revision := private.revise_candidate_extension_for_requester(
        (v_request ->> 'existing_request_id')::uuid,
        v_request -> 'revised_candidate_capability',
        v_request -> 'revised_candidate_contract_delta',
        v_request ->> 'revision_response'
      );
      v_revisions := v_revisions || jsonb_build_array(v_revision);
    end if;
  end loop;

  v_submission := public.submit_structured_extension_closure(
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
    p_requests => p_requests
  );

  return v_submission || jsonb_build_object(
    'candidate_revisions', v_revisions,
    'capability_request_interface', 'vlab.capability-request/8'
  );
end;
$function$;

create or replace function public.revalidate_structured_extension_closure_v8(
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
set search_path = ''
as $function$
declare
  v_request jsonb;
  v_revision jsonb;
  v_revisions jsonb := '[]'::jsonb;
  v_submission jsonb;
begin
  for v_request in select value from jsonb_array_elements(p_requests)
  loop
    if nullif(v_request ->> 'existing_request_id', '') is not null
       and (
         v_request ? 'revised_candidate_capability'
         or v_request ? 'revised_candidate_contract_delta'
       ) then
      v_revision := private.revise_candidate_extension_for_requester(
        (v_request ->> 'existing_request_id')::uuid,
        v_request -> 'revised_candidate_capability',
        v_request -> 'revised_candidate_contract_delta',
        v_request ->> 'revision_response'
      );
      v_revisions := v_revisions || jsonb_build_array(v_revision);
    end if;
  end loop;

  v_submission := public.revalidate_structured_extension_closure(
    p_blocked_experiment_id => p_blocked_experiment_id,
    p_base_analysis_sequence => p_base_analysis_sequence,
    p_contract_version => p_contract_version,
    p_analysis_status => p_analysis_status,
    p_identified_requirements => p_identified_requirements,
    p_unresolved_ambiguities => p_unresolved_ambiguities,
    p_requests => p_requests
  );

  return v_submission || jsonb_build_object(
    'candidate_revisions', v_revisions,
    'capability_request_interface', 'vlab.capability-request/8'
  );
end;
$function$;

revoke all on function public.submit_structured_extension_closure_v8(uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.submit_structured_extension_closure_v8(uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb) from anon;
grant execute on function public.submit_structured_extension_closure_v8(uuid, uuid, bigint, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.revalidate_structured_extension_closure_v8(uuid, bigint, text, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.revalidate_structured_extension_closure_v8(uuid, bigint, text, text, jsonb, jsonb, jsonb) from anon;
grant execute on function public.revalidate_structured_extension_closure_v8(uuid, bigint, text, text, jsonb, jsonb, jsonb) to authenticated;
