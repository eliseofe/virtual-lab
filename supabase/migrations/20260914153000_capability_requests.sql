-- Virtual Lab durable capability requests for #135 / #58.2.
-- This checkpoint adds Professor-only request creation. Inbox transitions and
-- developer handoff are intentionally deferred to later checkpoints.

create table if not exists public.capability_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete restrict,
  requester_role text not null
    check (requester_role in ('student', 'professor')),

  origin_experiment_id uuid,
  origin_experiment_revision bigint
    check (origin_experiment_revision is null or origin_experiment_revision >= 1),

  draft_title text,
  draft_description text,
  draft_artifacts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(draft_artifacts) = 'array'),

  capability_domain text not null
    check (length(btrim(capability_domain)) > 0),
  capability_name text not null
    check (length(btrim(capability_name)) > 0),
  context text not null default '',
  requested_artifact_type text,
  requested_lifecycle_hook text
    check (
      requested_lifecycle_hook is null
      or requested_lifecycle_hook in ('setup', 'initialize', 'control', 'finalize')
    ),

  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'in_progress', 'implemented')),
  professor_notes text,
  developer_notes text,
  github_issue_url text,
  github_pr_url text,
  implemented_contract_version text,
  implemented_capability_version text,
  implemented_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (origin_experiment_revision is null or origin_experiment_id is not null),
  check (
    origin_experiment_id is not null
    or length(btrim(coalesce(draft_title, ''))) > 0
    or jsonb_array_length(draft_artifacts) > 0
  )
);

create index if not exists capability_requests_requester_idx
  on public.capability_requests(requester_id);
create index if not exists capability_requests_status_created_idx
  on public.capability_requests(status, created_at desc);
create index if not exists capability_requests_origin_experiment_idx
  on public.capability_requests(origin_experiment_id)
  where origin_experiment_id is not null;

create or replace function private.touch_capability_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.touch_capability_request_updated_at()
  from public, anon, authenticated;

drop trigger if exists touch_capability_request_updated_at
  on public.capability_requests;
create trigger touch_capability_request_updated_at
before update on public.capability_requests
for each row execute function private.touch_capability_request_updated_at();

alter table public.capability_requests enable row level security;

revoke all on table public.capability_requests from anon, authenticated;
grant select, insert on table public.capability_requests to authenticated;

-- #58.2 deliberately exposes only the requester's own queue. A broader
-- professor/curator inbox policy, if desired, belongs to the inbox checkpoint.
create policy "capability_requests_select_own_professor"
on public.capability_requests for select
to authenticated
using (
  requester_id = (select auth.uid())
  and requester_role = 'professor'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  )
);

create policy "capability_requests_insert_own_professor"
on public.capability_requests for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_role = 'professor'
  and status = 'requested'
  and professor_notes is null
  and developer_notes is null
  and github_issue_url is null
  and github_pr_url is null
  and implemented_contract_version is null
  and implemented_capability_version is null
  and implemented_at is null
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
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

-- There is intentionally no authenticated UPDATE or DELETE grant/policy in
-- this checkpoint. Approve/Decline and developer-side lifecycle transitions
-- are implemented separately under later #58 checkpoints.
