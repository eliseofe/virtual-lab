-- #149 — Professor promotion of an accepted Experiment revision to Showcase.
--
-- Showcase is curated publication, not an experiment collection. Collections are
-- owner-private organization. A Showcase entry freezes one exact saved Experiment
-- revision into an immutable curated snapshot, and publication/removal never mutates
-- the source Experiment or its scientific revision.

alter table public.preserved_experiment_snapshots
  add column if not exists description text not null default '',
  add column if not exists artifacts jsonb;

comment on column public.preserved_experiment_snapshots.artifacts is
  'Canonical generic Experiment artifacts for snapshots created after the artifact migration. Historical snapshots may leave this null.';

create table if not exists public.showcase_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references public.preserved_experiment_snapshots(id) on delete restrict,
  source_experiment_id uuid references public.experiments(id) on delete set null,
  source_owner_id uuid not null references auth.users(id) on delete restrict,
  source_revision bigint not null check (source_revision >= 1),
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  check ((removed_at is null and removed_by is null) or removed_at is not null)
);

create unique index if not exists showcase_one_active_per_source_idx
  on public.showcase_entries(source_experiment_id)
  where removed_at is null and source_experiment_id is not null;

create index if not exists showcase_active_published_idx
  on public.showcase_entries(published_at desc)
  where removed_at is null;

alter table public.showcase_entries enable row level security;
revoke all on table public.showcase_entries from anon, authenticated;

create or replace function public.promote_experiment_to_showcase(
  p_experiment_id uuid,
  p_expected_revision bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  source_row public.experiments%rowtype;
  existing_entry public.showcase_entries%rowtype;
  snapshot_id uuid;
  entry_id uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = caller and p.role = 'professor'
  ) then
    raise exception 'Professor role required' using errcode = '42501';
  end if;

  select * into source_row
  from public.experiments e
  where e.id = p_experiment_id
    and e.owner_id = caller
    and e.lifecycle = 'active';

  if not found then
    raise exception 'owned active Experiment not found' using errcode = 'P0002';
  end if;

  if source_row.revision <> p_expected_revision then
    raise exception 'Experiment revision changed: expected %, current %', p_expected_revision, source_row.revision
      using errcode = '40001';
  end if;

  select * into existing_entry
  from public.showcase_entries s
  where s.source_experiment_id = source_row.id
    and s.removed_at is null
  limit 1;

  if found and existing_entry.source_revision = source_row.revision then
    return existing_entry.id;
  end if;

  if found then
    update public.showcase_entries
    set removed_at = now(), removed_by = caller
    where id = existing_entry.id;
  end if;

  insert into public.preserved_experiment_snapshots(
    source_experiment_id,
    source_owner_id,
    source_revision,
    snapshot_kind,
    title,
    description,
    schema_version,
    interface_version,
    config_source,
    initializer_source,
    controller_source,
    artifacts,
    created_by
  ) values (
    source_row.id,
    source_row.owner_id,
    source_row.revision,
    'curated',
    source_row.title,
    source_row.description,
    source_row.schema_version,
    source_row.interface_version,
    source_row.config_source,
    source_row.initializer_source,
    source_row.controller_source,
    source_row.artifacts,
    caller
  ) returning id into snapshot_id;

  insert into public.showcase_entries(
    snapshot_id,
    source_experiment_id,
    source_owner_id,
    source_revision,
    published_by
  ) values (
    snapshot_id,
    source_row.id,
    source_row.owner_id,
    source_row.revision,
    caller
  ) returning id into entry_id;

  return entry_id;
end;
$$;

revoke all on function public.promote_experiment_to_showcase(uuid, bigint) from public;
grant execute on function public.promote_experiment_to_showcase(uuid, bigint) to authenticated;

create or replace function public.remove_experiment_from_showcase(p_experiment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  affected integer;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = caller and p.role = 'professor'
  ) then
    raise exception 'Professor role required' using errcode = '42501';
  end if;

  update public.showcase_entries s
  set removed_at = now(), removed_by = caller
  where s.source_experiment_id = p_experiment_id
    and s.removed_at is null;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.remove_experiment_from_showcase(uuid) from public;
grant execute on function public.remove_experiment_from_showcase(uuid) to authenticated;

create or replace function public.list_showcase_experiments()
returns table (
  showcase_id uuid,
  source_experiment_id uuid,
  source_owner_id uuid,
  source_revision bigint,
  title text,
  description text,
  schema_version text,
  interface_version text,
  artifacts jsonb,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.source_experiment_id,
    s.source_owner_id,
    s.source_revision,
    p.title,
    p.description,
    p.schema_version,
    p.interface_version,
    p.artifacts,
    s.published_at
  from public.showcase_entries s
  join public.preserved_experiment_snapshots p on p.id = s.snapshot_id
  where s.removed_at is null
    and p.snapshot_kind = 'curated'
    and p.artifacts is not null
  order by s.published_at desc, s.id;
$$;

revoke all on function public.list_showcase_experiments() from public;
grant execute on function public.list_showcase_experiments() to anon, authenticated;

comment on table public.showcase_entries is
  'Reversible public curation state pointing at immutable exact-revision Experiment snapshots. Not an experiment collection.';
