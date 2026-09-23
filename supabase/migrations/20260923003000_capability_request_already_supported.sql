-- #523: add a first-class Already Supported Professor resolution.
-- Request lifecycle and Professor response remain separate axes.

alter table public.capability_requests
  drop constraint if exists capability_requests_status_check,
  add constraint capability_requests_status_check
    check (status in ('requested', 'approved', 'declined', 'resolved', 'in_progress', 'implemented')),
  drop constraint if exists capability_requests_professor_disposition_check,
  add constraint capability_requests_professor_disposition_check
    check (
      professor_disposition is null
      or professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future', 'already_supported')
    ),
  drop constraint if exists capability_requests_status_disposition_consistency,
  add constraint capability_requests_status_disposition_consistency
    check (
      (status = 'requested' and professor_disposition in ('pending', 'revise', 'deferred', 'future'))
      or (status = 'approved' and professor_disposition = 'accepted')
      or (status = 'declined' and professor_disposition = 'rejected')
      or (status = 'resolved' and professor_disposition = 'already_supported')
      or (status in ('in_progress', 'implemented') and professor_disposition is null)
    );

alter table public.capability_request_professor_reviews
  drop constraint if exists capability_request_professor_reviews_disposition_check,
  add constraint capability_request_professor_reviews_disposition_check
    check (disposition in ('accepted', 'rejected', 'revise', 'deferred', 'future', 'already_supported'));

alter table public.candidate_capabilities
  drop constraint if exists candidate_capabilities_request_status,
  add constraint candidate_capabilities_request_status
    check (request_status in ('requested', 'approved', 'declined', 'resolved', 'in_progress', 'implemented')),
  drop constraint if exists candidate_capabilities_professor_disposition_check,
  add constraint candidate_capabilities_professor_disposition_check
    check (
      professor_disposition is null
      or professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future', 'already_supported')
    ),
  drop constraint if exists candidate_capabilities_availability,
  add constraint candidate_capabilities_availability
    check (availability in ('candidate_unavailable', 'resolved_supported', 'superseded_implemented', 'resolved_by_owner'));

alter table public.candidate_contract_deltas
  drop constraint if exists candidate_contract_deltas_request_status,
  add constraint candidate_contract_deltas_request_status
    check (request_status in ('requested', 'approved', 'declined', 'resolved', 'in_progress', 'implemented')),
  drop constraint if exists candidate_contract_deltas_professor_disposition_check,
  add constraint candidate_contract_deltas_professor_disposition_check
    check (
      professor_disposition is null
      or professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future', 'already_supported')
    ),
  drop constraint if exists candidate_contract_deltas_availability,
  add constraint candidate_contract_deltas_availability
    check (availability in ('candidate_unavailable', 'resolved_supported', 'superseded_implemented', 'resolved_by_owner'));

create table if not exists public.capability_request_support_resolutions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.capability_requests(id) on delete cascade,
  support_kind text not null check (support_kind in ('canonical_capability', 'contract_path')),
  canonical_capability_id uuid references public.canonical_capabilities(id) on delete restrict,
  contract_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (support_kind = 'canonical_capability' and canonical_capability_id is not null and contract_path is null)
    or
    (support_kind = 'contract_path' and canonical_capability_id is null and length(btrim(contract_path)) > 0)
  ),
  check (
    contract_path is null
    or contract_path ~ '^(runtime_contract|artifacts\\.(configuration|initialization|controller|metrics)|artifact_execution|diagnostic_model|execution_boundary|results_presentation)(\\.|$)'
  )
);

create unique index if not exists capability_request_support_resolution_capability_unique
  on public.capability_request_support_resolutions(request_id, canonical_capability_id)
  where canonical_capability_id is not null;

create unique index if not exists capability_request_support_resolution_contract_unique
  on public.capability_request_support_resolutions(request_id, contract_path)
  where contract_path is not null;

alter table public.capability_request_support_resolutions enable row level security;
grant select, insert on public.capability_request_support_resolutions to authenticated;

drop policy if exists "capability_request_support_resolutions_select_authenticated"
  on public.capability_request_support_resolutions;
create policy "capability_request_support_resolutions_select_authenticated"
on public.capability_request_support_resolutions for select
to authenticated
using (true);

drop policy if exists "capability_request_support_resolutions_insert_professor"
  on public.capability_request_support_resolutions;
create policy "capability_request_support_resolutions_insert_professor"
on public.capability_request_support_resolutions for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'professor'
  )
);

create or replace function private.stamp_capability_request_review()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.status = 'requested' and new.status in ('approved', 'declined', 'resolved') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;

create or replace function private.sync_candidate_request_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_availability text;
  v_superseded_at timestamptz;
begin
  v_availability := case
    when new.status = 'implemented' then 'superseded_implemented'
    when new.status = 'resolved' then 'resolved_supported'
    else 'candidate_unavailable'
  end;
  v_superseded_at := case
    when new.status = 'implemented' then coalesce(new.implemented_at, now())
    when new.status = 'resolved' then coalesce(new.professor_disposition_reviewed_at, now())
    else null
  end;

  update public.candidate_capabilities
  set request_status = new.status,
      request_updated_at = new.updated_at,
      availability = v_availability,
      superseded_at = v_superseded_at,
      professor_disposition = new.professor_disposition,
      professor_guidance = new.professor_guidance,
      updated_at = now()
  where request_id = new.id;

  update public.candidate_contract_deltas
  set request_status = new.status,
      request_updated_at = new.updated_at,
      availability = v_availability,
      superseded_at = v_superseded_at,
      professor_disposition = new.professor_disposition,
      professor_guidance = new.professor_guidance,
      updated_at = now()
  where request_id = new.id;

  return new;
end;
$function$;

create or replace function private.sync_active_extension_request_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.active_extension_request_catalog where request_id = old.id;
    return old;
  end if;

  if new.status in ('requested', 'approved', 'declined', 'resolved', 'in_progress')
     and new.request_class is not null
     and nullif(btrim(coalesce(new.extension_key, '')), '') is not null
     and nullif(btrim(coalesce(new.extension_domain, '')), '') is not null
     and nullif(btrim(coalesce(new.extension_name, '')), '') is not null
     and nullif(btrim(coalesce(new.extension_definition, '')), '') is not null then
    insert into public.active_extension_request_catalog (
      request_id, request_class, extension_key, extension_domain,
      extension_name, extension_definition, status, updated_at
    )
    values (
      new.id, new.request_class, btrim(new.extension_key), btrim(new.extension_domain),
      btrim(new.extension_name), btrim(new.extension_definition), new.status, now()
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
    delete from public.active_extension_request_catalog where request_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.resolve_extension_request_already_supported(
  p_request_id uuid,
  p_canonical_capability_ids uuid[] default '{}'::uuid[],
  p_contract_paths text[] default '{}'::text[],
  p_professor_notes text default null
)
returns public.capability_requests
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_request public.capability_requests;
  v_capability_id uuid;
  v_contract_path text;
  v_guidance text := nullif(btrim(coalesce(p_professor_notes, '')), '');
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role <> 'professor' then raise exception 'Only a Professor may resolve extension requests.'; end if;

  select r.* into v_request
  from public.capability_requests r
  where r.id = p_request_id
    and r.status = 'requested'
    and r.professor_disposition = 'pending'
  for update;
  if not found then
    raise exception 'Request is missing, not visible, or no longer pending Professor review.';
  end if;

  if coalesce(cardinality(p_canonical_capability_ids), 0) = 0
     and coalesce(cardinality(p_contract_paths), 0) = 0 then
    raise exception 'Already Supported requires at least one machine-readable support reference.';
  end if;
  if v_request.request_class = 'semantic_capability'
     and coalesce(cardinality(p_canonical_capability_ids), 0) = 0 then
    raise exception 'A semantic request resolved as Already Supported must cite at least one implemented canonical capability.';
  end if;

  foreach v_capability_id in array coalesce(p_canonical_capability_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.canonical_capabilities c
      where c.id = v_capability_id and c.implementation_state = 'implemented'
    ) then
      raise exception 'Already Supported may cite only implemented canonical capabilities.';
    end if;
    insert into public.capability_request_support_resolutions (
      request_id, support_kind, canonical_capability_id, created_by
    ) values (v_request.id, 'canonical_capability', v_capability_id, v_user_id)
    on conflict do nothing;
  end loop;

  foreach v_contract_path in array coalesce(p_contract_paths, '{}'::text[])
  loop
    v_contract_path := btrim(v_contract_path);
    if v_contract_path = '' then continue; end if;
    insert into public.capability_request_support_resolutions (
      request_id, support_kind, contract_path, created_by
    ) values (v_request.id, 'contract_path', v_contract_path, v_user_id)
    on conflict do nothing;
  end loop;

  update public.capability_requests
  set status = 'resolved',
      professor_disposition = 'already_supported',
      professor_guidance = v_guidance,
      professor_disposition_reviewed_by = v_user_id,
      professor_disposition_reviewed_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$function$;

revoke all on function public.resolve_extension_request_already_supported(uuid, uuid[], text[], text)
  from public, anon;
grant execute on function public.resolve_extension_request_already_supported(uuid, uuid[], text[], text)
  to authenticated;

-- Reconcile the five known false-positive Eliseo requests using stable request/capability keys.
with support_map(request_key, capability_key) as (
  values
    ('controller.quality_modulated_timer', 'controller.private_scalar_state'),
    ('controller.quality_modulated_timer', 'controller.stochastic_distributions'),
    ('initialization.stubborn_fraction', 'controller.private_scalar_state'),
    ('initialization.stubborn_fraction', 'initialization.per_agent_private_state_assignment'),
    ('environment.time_triggered_quality_swap', 'controller.private_scalar_state'),
    ('controller.phase_machine_and_stubborn', 'controller.private_scalar_state'),
    ('controller.phase_machine_and_stubborn', 'controller.stochastic_distributions'),
    ('controller.phase_machine_and_stubborn', 'initialization.per_agent_private_state_assignment'),
    ('environment.site_quality_regions', 'environment.static_scalar_field'),
    ('environment.site_quality_regions', 'observation.environmental_scalar')
)
insert into public.capability_request_support_resolutions (
  request_id, support_kind, canonical_capability_id, created_by
)
select r.id, 'canonical_capability', c.id, r.requester_id
from support_map m
join public.capability_requests r on r.extension_key = m.request_key
join public.canonical_capabilities c on c.capability_key = m.capability_key
where r.status = 'requested'
  and r.professor_disposition = 'pending'
  and r.requester_role = 'professor'
  and c.implementation_state = 'implemented'
on conflict do nothing;

with contract_map(request_key, contract_path) as (
  values
    ('environment.time_triggered_quality_swap', 'artifacts.configuration'),
    ('environment.site_quality_regions', 'artifacts.configuration')
)
insert into public.capability_request_support_resolutions (
  request_id, support_kind, contract_path, created_by
)
select r.id, 'contract_path', m.contract_path, r.requester_id
from contract_map m
join public.capability_requests r on r.extension_key = m.request_key
where r.status = 'requested'
  and r.professor_disposition = 'pending'
  and r.requester_role = 'professor'
on conflict do nothing;

update public.capability_requests
set status = 'resolved',
    professor_disposition = 'already_supported',
    professor_guidance = 'Requirement already supported by deployed Virtual Lab primitives; no new implementation is required.',
    professor_disposition_reviewed_by = requester_id,
    professor_disposition_reviewed_at = now()
where extension_key in (
  'controller.quality_modulated_timer',
  'initialization.stubborn_fraction',
  'environment.time_triggered_quality_swap',
  'controller.phase_machine_and_stubborn',
  'environment.site_quality_regions'
)
  and status = 'requested'
  and professor_disposition = 'pending'
  and requester_role = 'professor';
