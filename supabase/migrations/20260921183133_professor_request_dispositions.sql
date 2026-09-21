-- #473: separate Professor scientific disposition from technical request lifecycle.
-- Existing request/candidate/evidence identity remains authoritative and unchanged.

alter table public.capability_requests
  add column if not exists professor_disposition text,
  add column if not exists professor_guidance text,
  add column if not exists professor_disposition_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists professor_disposition_reviewed_at timestamptz;

update public.capability_requests
set professor_disposition = case
      when status in ('approved', 'in_progress', 'implemented') then 'accepted'
      when status = 'declined' then 'rejected'
      else 'pending'
    end,
    professor_disposition_reviewed_by = case
      when status in ('approved', 'declined', 'in_progress', 'implemented')
        then coalesce(
          reviewed_by,
          case when requester_role = 'professor' then requester_id else null end
        )
      else null
    end,
    professor_disposition_reviewed_at = case
      when status in ('approved', 'declined', 'in_progress', 'implemented')
        then coalesce(reviewed_at, updated_at, created_at)
      else null
    end
where professor_disposition is null;

alter table public.capability_requests
  alter column professor_disposition set default 'pending',
  alter column professor_disposition set not null;

alter table public.capability_requests
  drop constraint if exists capability_requests_professor_disposition_check,
  add constraint capability_requests_professor_disposition_check
    check (professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future')),
  drop constraint if exists capability_requests_professor_guidance_nonempty,
  add constraint capability_requests_professor_guidance_nonempty
    check (professor_guidance is null or length(btrim(professor_guidance)) > 0),
  drop constraint if exists capability_requests_status_disposition_consistency,
  add constraint capability_requests_status_disposition_consistency
    check (
      (status = 'requested' and professor_disposition in ('pending', 'revise', 'deferred', 'future'))
      or (status in ('approved', 'in_progress', 'implemented') and professor_disposition = 'accepted')
      or (status = 'declined' and professor_disposition = 'rejected')
    );

create index if not exists capability_requests_professor_disposition_created_idx
  on public.capability_requests (professor_disposition, created_at desc);

create table if not exists public.capability_request_professor_reviews (
  request_id uuid not null references public.capability_requests(id) on delete cascade,
  review_revision integer not null check (review_revision > 0),
  disposition text not null
    check (disposition in ('accepted', 'rejected', 'revise', 'deferred', 'future')),
  guidance text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null,
  primary key (request_id, review_revision),
  constraint capability_request_professor_reviews_guidance_nonempty
    check (guidance is null or length(btrim(guidance)) > 0)
);

alter table public.capability_request_professor_reviews enable row level security;

revoke all on table public.capability_request_professor_reviews from anon;
grant select, insert on table public.capability_request_professor_reviews to authenticated;

drop policy if exists "capability_request_professor_reviews_select_professor"
  on public.capability_request_professor_reviews;
create policy "capability_request_professor_reviews_select_professor"
  on public.capability_request_professor_reviews
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'professor'
    )
  );

drop policy if exists "capability_request_professor_reviews_insert_professor"
  on public.capability_request_professor_reviews;
create policy "capability_request_professor_reviews_insert_professor"
  on public.capability_request_professor_reviews
  for insert
  to authenticated
  with check (
    reviewed_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'professor'
    )
  );

insert into public.capability_request_professor_reviews (
  request_id,
  review_revision,
  disposition,
  guidance,
  reviewed_by,
  reviewed_at
)
select
  r.id,
  1,
  r.professor_disposition,
  r.professor_guidance,
  r.professor_disposition_reviewed_by,
  r.professor_disposition_reviewed_at
from public.capability_requests r
where r.professor_disposition <> 'pending'
  and r.professor_disposition_reviewed_at is not null
  and not exists (
    select 1
    from public.capability_request_professor_reviews h
    where h.request_id = r.id
  );

alter table public.candidate_capabilities
  add column if not exists professor_disposition text not null default 'pending',
  add column if not exists professor_guidance text;

alter table public.candidate_capabilities
  drop constraint if exists candidate_capabilities_professor_disposition_check,
  add constraint candidate_capabilities_professor_disposition_check
    check (professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future')),
  drop constraint if exists candidate_capabilities_professor_guidance_nonempty,
  add constraint candidate_capabilities_professor_guidance_nonempty
    check (professor_guidance is null or length(btrim(professor_guidance)) > 0);

alter table public.candidate_contract_deltas
  add column if not exists professor_disposition text not null default 'pending',
  add column if not exists professor_guidance text;

alter table public.candidate_contract_deltas
  drop constraint if exists candidate_contract_deltas_professor_disposition_check,
  add constraint candidate_contract_deltas_professor_disposition_check
    check (professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future')),
  drop constraint if exists candidate_contract_deltas_professor_guidance_nonempty,
  add constraint candidate_contract_deltas_professor_guidance_nonempty
    check (professor_guidance is null or length(btrim(professor_guidance)) > 0);

update public.candidate_capabilities c
set professor_disposition = r.professor_disposition,
    professor_guidance = r.professor_guidance
from public.capability_requests r
where r.id = c.request_id;

update public.candidate_contract_deltas d
set professor_disposition = r.professor_disposition,
    professor_guidance = r.professor_guidance
from public.capability_requests r
where r.id = d.request_id;

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
    else 'candidate_unavailable'
  end;
  v_superseded_at := case when new.status = 'implemented' then coalesce(new.implemented_at, now()) else null end;

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

drop trigger if exists sync_candidate_request_lifecycle on public.capability_requests;
create trigger sync_candidate_request_lifecycle
after update of status, updated_at, implemented_at, professor_disposition, professor_guidance
on public.capability_requests
for each row execute function private.sync_candidate_request_lifecycle();

create or replace function private.record_capability_request_professor_review()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_revision integer;
begin
  if old.professor_disposition is not distinct from new.professor_disposition then
    return new;
  end if;

  if new.professor_disposition = 'pending' then
    return new;
  end if;

  select coalesce(max(h.review_revision), 0) + 1
  into v_revision
  from public.capability_request_professor_reviews h
  where h.request_id = new.id;

  insert into public.capability_request_professor_reviews (
    request_id,
    review_revision,
    disposition,
    guidance,
    reviewed_by,
    reviewed_at
  )
  values (
    new.id,
    v_revision,
    new.professor_disposition,
    new.professor_guidance,
    new.professor_disposition_reviewed_by,
    new.professor_disposition_reviewed_at
  );

  return new;
end;
$function$;

drop trigger if exists record_capability_request_professor_review on public.capability_requests;
create trigger record_capability_request_professor_review
after update of professor_disposition
on public.capability_requests
for each row execute function private.record_capability_request_professor_review();

drop policy if exists "capability_requests_triage_professor" on public.capability_requests;
create policy "capability_requests_triage_professor"
  on public.capability_requests
  for update
  to authenticated
  using (
    status = 'requested'
    and professor_disposition = 'pending'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'professor'
    )
  )
  with check (
    professor_disposition in ('accepted', 'rejected', 'revise', 'deferred', 'future')
    and professor_disposition_reviewed_by = (select auth.uid())
    and professor_disposition_reviewed_at is not null
    and (
      (professor_disposition = 'accepted' and status = 'approved')
      or (professor_disposition = 'rejected' and status = 'declined')
      or (professor_disposition in ('revise', 'deferred', 'future') and status = 'requested')
    )
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'professor'
    )
  );

drop policy if exists "capability_requests_insert_pending_professor_disposition" on public.capability_requests;
create policy "capability_requests_insert_pending_professor_disposition"
  on public.capability_requests
  as restrictive
  for insert
  to authenticated
  with check (
    professor_disposition = 'pending'
    and professor_guidance is null
    and professor_disposition_reviewed_by is null
    and professor_disposition_reviewed_at is null
  );

grant update (
  status,
  professor_disposition,
  professor_guidance,
  professor_disposition_reviewed_by,
  professor_disposition_reviewed_at
) on table public.capability_requests to authenticated;

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
      professor_guidance = nullif(btrim(coalesce(p_professor_notes, '')), ''),
      professor_disposition_reviewed_by = v_user_id,
      professor_disposition_reviewed_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$function$;
