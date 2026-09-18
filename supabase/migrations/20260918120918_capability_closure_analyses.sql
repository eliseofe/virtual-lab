-- Virtual Lab durable blocked-Experiment / capability-closure foundation for #310 / #58.5.
-- This checkpoint adds the durable domain model only. The production MCP contract
-- remains unchanged until #311 adopts this model.

create table if not exists public.blocked_experiment_drafts (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete restrict,
  requester_role text not null
    check (requester_role in ('student', 'professor')),

  origin_experiment_id uuid,
  origin_experiment_revision bigint
    check (origin_experiment_revision is null or origin_experiment_revision >= 1),

  title text not null
    check (length(btrim(title)) > 0),
  description text not null default '',
  artifacts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(artifacts) = 'array'),
  source_context text not null default '',

  lifecycle text not null default 'blocked'
    check (lifecycle in ('blocked', 'unblocked')),
  revision bigint not null default 1
    check (revision >= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (origin_experiment_revision is null or origin_experiment_id is not null),
  check (
    jsonb_array_length(artifacts) > 0
    or length(btrim(description)) > 0
    or length(btrim(source_context)) > 0
  )
);

create table if not exists public.capability_closure_analyses (
  id uuid primary key default gen_random_uuid(),
  blocked_experiment_id uuid not null
    references public.blocked_experiment_drafts(id) on delete restrict,
  analyst_id uuid not null references auth.users(id) on delete restrict,

  analysis_sequence bigint not null
    check (analysis_sequence >= 1),
  contract_version text not null
    check (length(btrim(contract_version)) > 0),
  analysis_status text not null
    check (
      analysis_status in (
        'best_effort_complete',
        'partial_due_to_ambiguity',
        'unblocked'
      )
    ),

  identified_requirements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(identified_requirements) = 'array'),
  unresolved_ambiguities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(unresolved_ambiguities) = 'array'),

  created_at timestamptz not null default now(),

  unique (blocked_experiment_id, analysis_sequence),

  check (
    analysis_status <> 'best_effort_complete'
    or jsonb_array_length(identified_requirements) > 0
  ),
  check (
    analysis_status <> 'partial_due_to_ambiguity'
    or jsonb_array_length(unresolved_ambiguities) > 0
  ),
  check (
    analysis_status <> 'unblocked'
    or (
      jsonb_array_length(identified_requirements) = 0
      and jsonb_array_length(unresolved_ambiguities) = 0
    )
  )
);

alter table public.capability_requests
  add column if not exists closure_analysis_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'capability_requests_closure_analysis_fkey'
      and conrelid = 'public.capability_requests'::regclass
  ) then
    alter table public.capability_requests
      add constraint capability_requests_closure_analysis_fkey
      foreign key (closure_analysis_id)
      references public.capability_closure_analyses(id)
      on delete restrict;
  end if;
end
$$;

create index if not exists blocked_experiment_drafts_requester_idx
  on public.blocked_experiment_drafts(requester_id);
create index if not exists blocked_experiment_drafts_origin_idx
  on public.blocked_experiment_drafts(origin_experiment_id)
  where origin_experiment_id is not null;
create index if not exists closure_analyses_blocked_created_idx
  on public.capability_closure_analyses(blocked_experiment_id, created_at desc);
create index if not exists capability_requests_closure_analysis_idx
  on public.capability_requests(closure_analysis_id)
  where closure_analysis_id is not null;

create or replace function private.bump_blocked_experiment_draft_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.bump_blocked_experiment_draft_revision()
  from public, anon, authenticated;

drop trigger if exists bump_blocked_experiment_draft_revision
  on public.blocked_experiment_drafts;
create trigger bump_blocked_experiment_draft_revision
before update on public.blocked_experiment_drafts
for each row execute function private.bump_blocked_experiment_draft_revision();

alter table public.blocked_experiment_drafts enable row level security;
alter table public.capability_closure_analyses enable row level security;

-- Secure-by-default foundation: #310 intentionally exposes no new authenticated
-- Data API surface. #311 will add only the Professor-side access path required
-- by the MCP capability-closure workflow.
revoke all on table public.blocked_experiment_drafts
  from public, anon, authenticated;
revoke all on table public.capability_closure_analyses
  from public, anon, authenticated;
