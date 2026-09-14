-- Virtual Lab Professor capability-request inbox for #139 / #58.3.
-- This checkpoint adds Professor curator read/triage only. Developer handoff,
-- GitHub linkage, in_progress and implemented transitions remain separate.

alter table public.capability_requests
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.capability_requests
  add column if not exists reviewed_at timestamptz;

create index if not exists capability_requests_reviewed_by_idx
  on public.capability_requests(reviewed_by)
  where reviewed_by is not null;

create or replace function private.stamp_capability_request_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'requested' and new.status in ('approved', 'declined') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_capability_request_review()
  from public, anon, authenticated;

drop trigger if exists stamp_capability_request_review
  on public.capability_requests;
create trigger stamp_capability_request_review
before update of status on public.capability_requests
for each row execute function private.stamp_capability_request_review();

-- The browser needs SELECT plus the two triage columns only. Provenance,
-- requester, draft, developer and implementation fields remain immutable through
-- the authenticated Professor UI path.
grant select on table public.capability_requests to authenticated;
grant update (status, professor_notes) on table public.capability_requests to authenticated;

drop policy if exists "capability_requests_select_own_professor"
  on public.capability_requests;
drop policy if exists "capability_requests_select_professor_inbox"
  on public.capability_requests;

create policy "capability_requests_select_professor_inbox"
on public.capability_requests for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

drop policy if exists "capability_requests_triage_professor"
  on public.capability_requests;

create policy "capability_requests_triage_professor"
on public.capability_requests for update
to authenticated
using (
  status = 'requested'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
)
with check (
  status in ('approved', 'declined')
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);
