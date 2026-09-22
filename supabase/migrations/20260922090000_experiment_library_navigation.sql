-- #480 — Browse-first Experiment Library read model and Showcase organization.
--
-- This migration keeps private Experiment collections private. The browser reads
-- Mine / Shared / Supervised through narrow authorization-aware RPCs, while
-- Showcase gets its own shallow public curation directory.

create table if not exists public.showcase_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint showcase_collections_name_check
    check (char_length(btrim(name)) between 1 and 80)
);

create unique index if not exists showcase_collections_name_ci_idx
  on public.showcase_collections (lower(btrim(name)));

alter table public.showcase_collections enable row level security;
revoke all on table public.showcase_collections from public, anon, authenticated;

alter table public.showcase_entries
  add column if not exists showcase_collection_id uuid
    references public.showcase_collections(id) on delete set null;

create index if not exists showcase_active_collection_idx
  on public.showcase_entries(showcase_collection_id, published_at desc)
  where removed_at is null;

comment on table public.showcase_collections is
  'Public Showcase discovery organization. Independent from owner-private Experiment collections.';
comment on column public.showcase_entries.showcase_collection_id is
  'Optional public Showcase collection. Never inferred from the source Experiment private collection.';

create or replace function private.require_current_professor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = caller
      and p.role = 'professor'
  ) then
    raise exception 'Professor role required' using errcode = '42501';
  end if;
  return caller;
end;
$$;

revoke all on function private.require_current_professor() from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function public.list_showcase_collections()
returns table (
  showcase_collection_id uuid,
  name text,
  experiment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    count(s.id) filter (where s.removed_at is null)
  from public.showcase_collections c
  left join public.showcase_entries s
    on s.showcase_collection_id = c.id
  group by c.id, c.name
  order by lower(c.name), c.id;
$$;

revoke all on function public.list_showcase_collections() from public;
grant execute on function public.list_showcase_collections() to anon, authenticated;

drop function if exists public.list_showcase_experiments();
create function public.list_showcase_experiments()
returns table (
  showcase_id uuid,
  source_experiment_id uuid,
  source_key text,
  source_owner_id uuid,
  source_revision bigint,
  title text,
  description text,
  schema_version text,
  interface_version text,
  artifacts jsonb,
  published_at timestamptz,
  showcase_collection_id uuid,
  showcase_collection_name text,
  published_by uuid,
  published_by_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.source_experiment_id,
    s.source_key,
    s.source_owner_id,
    s.source_revision,
    p.title,
    p.description,
    p.schema_version,
    p.interface_version,
    p.artifacts,
    s.published_at,
    s.showcase_collection_id,
    c.name,
    s.published_by,
    curator.display_name
  from public.showcase_entries s
  join public.preserved_experiment_snapshots p on p.id = s.snapshot_id
  left join public.showcase_collections c on c.id = s.showcase_collection_id
  left join public.profiles curator on curator.id = s.published_by
  where s.removed_at is null
    and p.snapshot_kind = 'curated'
    and p.artifacts is not null
  order by lower(p.title), s.id;
$$;

revoke all on function public.list_showcase_experiments() from public;
grant execute on function public.list_showcase_experiments() to anon, authenticated;

create or replace function public.list_experiment_library_mine()
returns table (
  experiment_id uuid,
  owner_id uuid,
  owner_display_name text,
  collection_id uuid,
  collection_name text,
  title text,
  description text,
  revision bigint,
  revision_created_at timestamptz,
  revision_actor text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.owner_id,
    owner.display_name,
    e.collection_id,
    c.name,
    e.title,
    e.description,
    e.revision,
    r.created_at,
    case
      when r.created_by_actor = 'human' then coalesce(actor.display_name, 'Human')
      when r.created_by_actor = 'ai' then coalesce(r.created_by_ai_client, 'AI')
      else coalesce(r.created_by_actor, 'Not recorded')
    end,
    e.updated_at
  from public.experiments e
  left join public.profiles owner on owner.id = e.owner_id
  left join public.experiment_collections c
    on c.id = e.collection_id
   and c.owner_id = caller
  left join public.experiment_revisions r
    on r.experiment_id = e.id
   and r.revision = e.revision
  left join public.profiles actor on actor.id = r.created_by_user
  where e.owner_id = caller
    and e.lifecycle = 'active'
  order by e.updated_at desc, e.id;
end;
$$;

revoke all on function public.list_experiment_library_mine() from public, anon;
grant execute on function public.list_experiment_library_mine() to authenticated;

create or replace function public.list_experiment_library_shared()
returns table (
  experiment_id uuid,
  owner_id uuid,
  owner_display_name text,
  title text,
  description text,
  revision bigint,
  revision_created_at timestamptz,
  revision_actor text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.owner_id,
    owner.display_name,
    e.title,
    e.description,
    e.revision,
    r.created_at,
    case
      when r.created_by_actor = 'human' then coalesce(actor.display_name, 'Human')
      when r.created_by_actor = 'ai' then coalesce(r.created_by_ai_client, 'AI')
      else coalesce(r.created_by_actor, 'Not recorded')
    end,
    e.updated_at
  from public.experiment_shares s
  join public.experiments e
    on e.id = s.experiment_id
   and e.lifecycle = 'active'
  left join public.profiles owner on owner.id = e.owner_id
  left join public.experiment_revisions r
    on r.experiment_id = e.id
   and r.revision = e.revision
  left join public.profiles actor on actor.id = r.created_by_user
  where s.recipient_id = caller
  order by lower(coalesce(owner.display_name, '')), e.updated_at desc, e.id;
end;
$$;

revoke all on function public.list_experiment_library_shared() from public, anon;
grant execute on function public.list_experiment_library_shared() to authenticated;

create or replace function public.list_experiment_library_supervised()
returns table (
  experiment_id uuid,
  owner_id uuid,
  owner_display_name text,
  collection_id uuid,
  collection_name text,
  title text,
  description text,
  revision bigint,
  revision_created_at timestamptz,
  revision_actor text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_current_professor();

  return query
  select
    e.id,
    e.owner_id,
    owner.display_name,
    e.collection_id,
    c.name,
    e.title,
    e.description,
    e.revision,
    r.created_at,
    case
      when r.created_by_actor = 'human' then coalesce(actor.display_name, 'Human')
      when r.created_by_actor = 'ai' then coalesce(r.created_by_ai_client, 'AI')
      else coalesce(r.created_by_actor, 'Not recorded')
    end,
    e.updated_at
  from public.experiments e
  join public.profiles owner
    on owner.id = e.owner_id
   and owner.role = 'student'
  left join public.experiment_collections c
    on c.id = e.collection_id
   and c.owner_id = e.owner_id
  left join public.experiment_revisions r
    on r.experiment_id = e.id
   and r.revision = e.revision
  left join public.profiles actor on actor.id = r.created_by_user
  where e.lifecycle = 'active'
  order by lower(coalesce(owner.display_name, '')), lower(coalesce(c.name, '')), e.updated_at desc, e.id;
end;
$$;

revoke all on function public.list_experiment_library_supervised() from public, anon;
grant execute on function public.list_experiment_library_supervised() to authenticated;

create or replace function public.create_showcase_collection(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_current_professor();
  clean_name text := btrim(coalesce(p_name, ''));
  collection_id uuid;
begin
  if char_length(clean_name) not between 1 and 80 then
    raise exception 'Showcase collection name must contain 1 to 80 characters' using errcode = '22023';
  end if;

  insert into public.showcase_collections(name, created_by)
  values (clean_name, caller)
  returning id into collection_id;

  return collection_id;
exception
  when unique_violation then
    raise exception 'A Showcase collection with that name already exists' using errcode = '23505';
end;
$$;

revoke all on function public.create_showcase_collection(text) from public, anon;
grant execute on function public.create_showcase_collection(text) to authenticated;

create or replace function public.rename_showcase_collection(
  p_collection_id uuid,
  p_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_current_professor();
  clean_name text := btrim(coalesce(p_name, ''));
  affected integer;
begin
  if char_length(clean_name) not between 1 and 80 then
    raise exception 'Showcase collection name must contain 1 to 80 characters' using errcode = '22023';
  end if;

  update public.showcase_collections c
  set name = clean_name,
      updated_at = now()
  where c.id = p_collection_id;

  get diagnostics affected = row_count;
  return affected = 1;
exception
  when unique_violation then
    raise exception 'A Showcase collection with that name already exists' using errcode = '23505';
end;
$$;

revoke all on function public.rename_showcase_collection(uuid, text) from public, anon;
grant execute on function public.rename_showcase_collection(uuid, text) to authenticated;

create or replace function public.delete_showcase_collection(p_collection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_current_professor();
  affected integer;
begin
  delete from public.showcase_collections c
  where c.id = p_collection_id;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.delete_showcase_collection(uuid) from public, anon;
grant execute on function public.delete_showcase_collection(uuid) to authenticated;

create or replace function public.set_showcase_entry_collection(
  p_showcase_id uuid,
  p_collection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_current_professor();
  affected integer;
begin
  if p_collection_id is not null
     and not exists (
       select 1
       from public.showcase_collections c
       where c.id = p_collection_id
     ) then
    raise exception 'Showcase collection not found' using errcode = 'P0002';
  end if;

  update public.showcase_entries s
  set showcase_collection_id = p_collection_id
  where s.id = p_showcase_id
    and s.removed_at is null;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.set_showcase_entry_collection(uuid, uuid) from public, anon;
grant execute on function public.set_showcase_entry_collection(uuid, uuid) to authenticated;

create or replace function private.inherit_showcase_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.showcase_collection_id is not null then
    return new;
  end if;

  select prior.showcase_collection_id
  into new.showcase_collection_id
  from public.showcase_entries prior
  where prior.id <> new.id
    and (
      (new.source_experiment_id is not null and prior.source_experiment_id = new.source_experiment_id)
      or (new.source_key is not null and prior.source_key = new.source_key)
    )
    and prior.showcase_collection_id is not null
  order by prior.published_at desc, prior.id desc
  limit 1;

  return new;
end;
$$;

revoke all on function private.inherit_showcase_collection() from public, anon, authenticated;

drop trigger if exists showcase_inherit_collection on public.showcase_entries;
create trigger showcase_inherit_collection
before insert on public.showcase_entries
for each row
execute function private.inherit_showcase_collection();
