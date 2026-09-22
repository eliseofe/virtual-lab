-- #480 — Keep public Showcase provenance human-readable without exposing curator account UUIDs.
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
