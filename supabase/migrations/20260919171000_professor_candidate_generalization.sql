-- #373: Professor generalization of structured unavailable candidates.
-- Generalization edits candidate coverage only. It never makes a candidate implemented.

alter table public.candidate_capabilities
  add column if not exists generalization_revision integer not null default 0,
  add column if not exists generalized_by uuid references auth.users(id) on delete set null,
  add column if not exists generalized_at timestamptz;

alter table public.candidate_contract_deltas
  add column if not exists generalization_revision integer not null default 0,
  add column if not exists generalized_by uuid references auth.users(id) on delete set null,
  add column if not exists generalized_at timestamptz;

alter table public.candidate_capabilities
  drop constraint if exists candidate_capabilities_generalization_revision,
  add constraint candidate_capabilities_generalization_revision
    check (generalization_revision >= 0);

alter table public.candidate_contract_deltas
  drop constraint if exists candidate_contract_deltas_generalization_revision,
  add constraint candidate_contract_deltas_generalization_revision
    check (generalization_revision >= 0);

alter table public.capability_request_evidence
  add column if not exists generalization_resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists generalization_resolved_at timestamptz,
  add column if not exists generalization_resolution_revision integer,
  add column if not exists generalization_resolution_note text;

alter table public.capability_request_evidence
  drop constraint if exists capability_request_evidence_generalization_resolution,
  add constraint capability_request_evidence_generalization_resolution
    check (
      (
        generalization_resolved_at is null
        and generalization_resolved_by is null
        and generalization_resolution_revision is null
      )
      or (
        relationship = 'generalization_needed'
        and generalization_resolved_at is not null
        and generalization_resolved_by is not null
        and generalization_resolution_revision is not null
        and generalization_resolution_revision > 0
      )
    );

comment on column public.capability_request_evidence.generalization_resolved_at is
  'Professor resolution timestamp after a deliberate candidate generalization. The original generalization_needed relationship remains as historical evidence.';
comment on column public.capability_request_evidence.generalization_resolution_revision is
  'Candidate generalization revision that the Professor judged sufficient to cover this evidence.';

create table public.candidate_generalization_revisions (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.capability_requests(id) on delete cascade,
  candidate_kind text not null,
  revision integer not null,
  previous_candidate jsonb not null,
  generalized_candidate jsonb not null,
  generalized_by uuid not null references auth.users(id) on delete restrict,
  generalized_at timestamptz not null default now(),
  professor_note text,
  resolved_generalization_evidence_count integer not null default 0,

  unique (request_id, revision),

  constraint candidate_generalization_revisions_kind
    check (candidate_kind in ('semantic_capability', 'contract_delta')),
  constraint candidate_generalization_revisions_revision
    check (revision > 0),
  constraint candidate_generalization_revisions_resolved_count
    check (resolved_generalization_evidence_count >= 0)
);

comment on table public.candidate_generalization_revisions is
  'Append-only Professor audit trail for deliberate candidate coverage revisions. Candidate/request identity stays stable and implementation availability does not change.';

alter table public.candidate_generalization_revisions enable row level security;
revoke all on table public.candidate_generalization_revisions from public, anon, authenticated;
grant select on table public.candidate_generalization_revisions to authenticated;

create policy "candidate_generalization_revisions_professor_read"
on public.candidate_generalization_revisions
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

create or replace function public.generalize_candidate_extension(
  p_request_id uuid,
  p_candidate_capability jsonb default null,
  p_candidate_contract_delta jsonb default null,
  p_resolve_generalization_evidence boolean default true,
  p_professor_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_request public.capability_requests;
  v_capability public.candidate_capabilities;
  v_delta public.candidate_contract_deltas;
  v_previous jsonb;
  v_generalized jsonb;
  v_revision integer;
  v_resolved integer := 0;
  v_spec jsonb;
  v_domain text;
  v_name text;
  v_definition text;
  v_target_artifact text;
  v_runtime_domain text;
  v_surfaces jsonb;
  v_delta_name text;
  v_target_contract_path text;
  v_requested_change text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role <> 'professor' then
    raise exception 'Only a Professor may generalize candidate extensions.';
  end if;

  select r.* into v_request
  from public.capability_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Candidate request was not found.';
  end if;

  if v_request.request_class = 'semantic_capability' then
    if p_candidate_capability is null or p_candidate_contract_delta is not null then
      raise exception 'Semantic candidate generalization requires candidate_capability only.';
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
      raise exception 'candidate_capability must be an object.';
    end if;

    v_domain := nullif(btrim(v_spec ->> 'capability_domain'), '');
    v_name := nullif(btrim(v_spec ->> 'capability_name'), '');
    v_definition := nullif(btrim(v_spec ->> 'scientific_definition'), '');
    v_target_artifact := nullif(btrim(v_spec ->> 'target_artifact'), '');
    v_runtime_domain := nullif(btrim(v_spec ->> 'target_runtime_domain'), '');
    v_surfaces := v_spec -> 'authoring_surfaces';

    if v_domain is null or v_name is null or v_definition is null
       or v_target_artifact is null or v_runtime_domain is null
       or jsonb_typeof(v_surfaces) <> 'array'
       or jsonb_array_length(v_surfaces) = 0 then
      raise exception 'Generalized semantic candidate requires domain, name, scientific definition, target artifact/runtime domain, and authoring surfaces.';
    end if;

    if v_target_artifact not in ('configuration', 'initialization', 'controller', 'metrics', 'environment', 'runtime') then
      raise exception 'candidate capability target_artifact is not a recognized Virtual Lab authoring/runtime domain.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_surfaces) surface
      where jsonb_typeof(surface) <> 'object'
         or nullif(btrim(surface ->> 'artifact'), '') is null
         or nullif(btrim(surface ->> 'kind'), '') is null
         or nullif(btrim(surface ->> 'symbol'), '') is null
    ) then
      raise exception 'Each generalized authoring surface needs artifact, kind and symbol.';
    end if;

    v_previous := to_jsonb(v_capability);
    v_revision := v_capability.generalization_revision + 1;

    update public.candidate_capabilities
    set capability_domain = v_domain,
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
    returning to_jsonb(candidate_capabilities.*) into v_generalized;

    update public.capability_requests
    set extension_domain = v_domain,
        extension_name = v_name,
        extension_definition = v_definition,
        requested_artifact_type = v_target_artifact,
        updated_at = now()
    where id = p_request_id;

  else
    if p_candidate_contract_delta is null or p_candidate_capability is not null then
      raise exception 'Non-semantic candidate generalization requires candidate_contract_delta only.';
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
      raise exception 'candidate_contract_delta must be an object.';
    end if;

    v_delta_name := nullif(btrim(v_spec ->> 'delta_name'), '');
    v_target_contract_path := nullif(btrim(v_spec ->> 'target_contract_path'), '');
    v_requested_change := nullif(btrim(v_spec ->> 'requested_change'), '');

    if v_delta_name is null or v_target_contract_path is null or v_requested_change is null then
      raise exception 'Generalized contract delta requires name, target contract path, and requested change.';
    end if;

    if v_target_contract_path !~
      '^(runtime_contract|artifacts\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\.|$)' then
      raise exception 'candidate_contract_delta target_contract_path does not reference the stable authoring/platform contract.';
    end if;

    v_previous := to_jsonb(v_delta);
    v_revision := v_delta.generalization_revision + 1;

    update public.candidate_contract_deltas
    set delta_name = v_delta_name,
        target_contract_path = v_target_contract_path,
        requested_change = v_requested_change,
        generalization_revision = v_revision,
        generalized_by = v_user_id,
        generalized_at = now(),
        updated_at = now()
    where request_id = p_request_id
    returning to_jsonb(candidate_contract_deltas.*) into v_generalized;

    update public.capability_requests
    set extension_name = v_delta_name,
        extension_definition = v_requested_change,
        updated_at = now()
    where id = p_request_id;
  end if;

  if p_resolve_generalization_evidence then
    update public.capability_request_evidence
    set generalization_resolved_by = v_user_id,
        generalization_resolved_at = now(),
        generalization_resolution_revision = v_revision,
        generalization_resolution_note = nullif(btrim(coalesce(p_professor_note, '')), '')
    where request_id = p_request_id
      and relationship = 'generalization_needed'
      and generalization_resolved_at is null;
    get diagnostics v_resolved = row_count;
  end if;

  insert into public.candidate_generalization_revisions (
    request_id,
    candidate_kind,
    revision,
    previous_candidate,
    generalized_candidate,
    generalized_by,
    professor_note,
    resolved_generalization_evidence_count
  )
  values (
    p_request_id,
    case when v_request.request_class = 'semantic_capability' then 'semantic_capability' else 'contract_delta' end,
    v_revision,
    v_previous,
    v_generalized,
    v_user_id,
    nullif(btrim(coalesce(p_professor_note, '')), ''),
    v_resolved
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'request_class', v_request.request_class,
    'generalization_revision', v_revision,
    'candidate', v_generalized,
    'resolved_generalization_evidence_count', v_resolved
  );
end;
$$;

revoke all on function public.generalize_candidate_extension(
  uuid, jsonb, jsonb, boolean, text
) from public, anon;
grant execute on function public.generalize_candidate_extension(
  uuid, jsonb, jsonb, boolean, text
) to authenticated;
