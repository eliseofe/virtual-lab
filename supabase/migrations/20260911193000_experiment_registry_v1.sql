-- Virtual Lab Experiment Registry v1
-- Issue #42. Backend-only: this migration does not connect to production Virtual Lab.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.experiment_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid references public.experiment_collections(id) on delete set null,
  schema_version text not null default 'vlab.registry-experiment/1'
    check (schema_version = 'vlab.registry-experiment/1'),
  interface_version text not null default 'vlab.student-artifacts/1'
    check (interface_version = 'vlab.student-artifacts/1'),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  lifecycle text not null default 'active'
    check (lifecycle in ('active', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public')),
  revision bigint not null default 1 check (revision >= 1),
  config_source text not null default '',
  initializer_source text not null default '',
  controller_source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_actor text not null default 'human'
    check (created_by_actor in ('human', 'ai')),
  created_by_ai_client text,
  updated_by_actor text not null default 'human'
    check (updated_by_actor in ('human', 'ai')),
  updated_by_ai_client text
);

-- Reserved now so later professor/submission/curation workflows can preserve an exact
-- experiment state independently of the owner's mutable working experiment.
create table if not exists public.preserved_experiment_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_experiment_id uuid references public.experiments(id) on delete set null,
  source_owner_id uuid not null references auth.users(id) on delete restrict,
  source_revision bigint not null check (source_revision >= 1),
  snapshot_kind text not null check (snapshot_kind in ('submission', 'assessment', 'curated')),
  title text not null,
  schema_version text not null,
  interface_version text not null,
  config_source text not null,
  initializer_source text not null,
  controller_source text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists experiment_collections_owner_idx
  on public.experiment_collections(owner_id);
create index if not exists experiments_owner_idx
  on public.experiments(owner_id);
create index if not exists experiments_collection_idx
  on public.experiments(collection_id);
create index if not exists experiments_owner_lifecycle_idx
  on public.experiments(owner_id, lifecycle);
create index if not exists experiments_visibility_idx
  on public.experiments(visibility);
create index if not exists preserved_snapshots_source_experiment_idx
  on public.preserved_experiment_snapshots(source_experiment_id);
create index if not exists preserved_snapshots_source_owner_idx
  on public.preserved_experiment_snapshots(source_owner_id);

create or replace function private.handle_new_registry_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'User ' || left(new.id::text, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_registry_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_registry_profile on auth.users;
create trigger on_auth_user_created_registry_profile
after insert on auth.users
for each row execute function private.handle_new_registry_user();

create or replace function private.validate_experiment_collection_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection_id is not null and not exists (
    select 1
    from public.experiment_collections c
    where c.id = new.collection_id
      and c.owner_id = new.owner_id
  ) then
    raise exception 'collection does not belong to experiment owner' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_experiment_collection_owner() from public, anon, authenticated;

drop trigger if exists validate_experiment_collection_owner on public.experiments;
create trigger validate_experiment_collection_owner
before insert or update of owner_id, collection_id on public.experiments
for each row execute function private.validate_experiment_collection_owner();

create or replace function private.bump_experiment_revision()
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

revoke execute on function private.bump_experiment_revision() from public, anon, authenticated;

drop trigger if exists bump_experiment_revision on public.experiments;
create trigger bump_experiment_revision
before update on public.experiments
for each row execute function private.bump_experiment_revision();

alter table public.profiles enable row level security;
alter table public.experiment_collections enable row level security;
alter table public.experiments enable row level security;
alter table public.preserved_experiment_snapshots enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.experiment_collections from anon, authenticated;
revoke all on table public.experiments from anon, authenticated;
revoke all on table public.preserved_experiment_snapshots from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.experiment_collections to authenticated;
grant select, insert, update, delete on table public.experiments to authenticated;
-- Preserved snapshots are intentionally not writable/readable by ordinary authenticated
-- clients yet. #45 will add explicit submission/curation permissions.

create policy "profiles_select_self"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_self"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "collections_select_own"
on public.experiment_collections for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "collections_insert_own"
on public.experiment_collections for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "collections_update_own"
on public.experiment_collections for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "collections_delete_own"
on public.experiment_collections for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy "experiments_select_visible"
on public.experiments for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or visibility = 'public'
);

create policy "experiments_insert_own"
on public.experiments for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    collection_id is null
    or exists (
      select 1
      from public.experiment_collections c
      where c.id = collection_id
        and c.owner_id = (select auth.uid())
    )
  )
);

create policy "experiments_update_own"
on public.experiments for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    collection_id is null
    or exists (
      select 1
      from public.experiment_collections c
      where c.id = collection_id
        and c.owner_id = (select auth.uid())
    )
  )
);

create policy "experiments_delete_own"
on public.experiments for delete
to authenticated
using ((select auth.uid()) = owner_id);

-- Optimistic concurrency is part of the client/API contract: updates must target both
-- experiment id and the base revision read by the client. The trigger above increments
-- revision atomically on every accepted mutation. A zero-row update means the base
-- revision is stale and must be surfaced as a conflict, never retried blindly.
