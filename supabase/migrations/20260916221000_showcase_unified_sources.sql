-- #240 follow-up — remove the synthetic built-in Showcase exception.
--
-- Showcase entries are now homogeneous publication records. Their source may be
-- either a saved Experiment (`source_experiment_id`) or another stable Lab source
-- such as a catalog experiment (`source_key`). Curation/removal operates on the
-- Showcase entry itself, never on UI-specific source assumptions.

alter table public.preserved_experiment_snapshots
  alter column source_owner_id drop not null,
  alter column source_revision drop not null;

alter table public.showcase_entries
  add column if not exists source_key text,
  alter column source_owner_id drop not null,
  alter column source_revision drop not null,
  alter column published_by drop not null;

alter table public.showcase_entries
  drop constraint if exists showcase_entries_source_identity_check;

alter table public.showcase_entries
  add constraint showcase_entries_source_identity_check
  check (
    ((source_experiment_id is not null)::integer + (source_key is not null)::integer) = 1
  );

create unique index if not exists showcase_one_active_per_source_key_idx
  on public.showcase_entries(source_key)
  where removed_at is null and source_key is not null;

-- Return one representation for every active Showcase entry. The client does not
-- synthesize catalog entries or attach special presentation semantics to them.
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
    s.source_key,
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

-- Remove by publication identity. This works identically for Experiment-backed and
-- catalog-backed Showcase entries and avoids leaking source-specific assumptions
-- into the UI.
create or replace function public.remove_showcase_entry(p_showcase_id uuid)
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
  where s.id = p_showcase_id
    and s.removed_at is null;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.remove_showcase_entry(uuid) from public, anon;
grant execute on function public.remove_showcase_entry(uuid) to authenticated;

-- Publish a non-registry Lab source (for example a catalog Experiment) through the
-- same immutable snapshot mechanism. The source key is generic and stable; the
-- function contains no Active-Elastic-specific identity or content.
create or replace function public.promote_catalog_to_showcase(
  p_source_key text,
  p_title text,
  p_description text,
  p_schema_version text,
  p_interface_version text,
  p_artifacts jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  existing_id uuid;
  existing_snapshot uuid;
  snapshot_id uuid;
  entry_id uuid;
  config_source text;
  initializer_source text;
  controller_source text;
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

  if nullif(btrim(p_source_key), '') is null then
    raise exception 'source key is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_title), '') is null then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_artifacts) <> 'array' then
    raise exception 'artifacts must be a JSON array' using errcode = '22023';
  end if;

  select s.id, s.snapshot_id
  into existing_id, existing_snapshot
  from public.showcase_entries s
  where s.source_key = p_source_key
    and s.removed_at is null
  limit 1;

  if existing_id is not null and exists (
    select 1
    from public.preserved_experiment_snapshots p
    where p.id = existing_snapshot
      and p.title = p_title
      and p.description = coalesce(p_description, '')
      and p.schema_version = p_schema_version
      and p.interface_version = p_interface_version
      and p.artifacts = p_artifacts
  ) then
    return existing_id;
  end if;

  if existing_id is not null then
    update public.showcase_entries
    set removed_at = now(), removed_by = caller
    where id = existing_id;
  end if;

  config_source := coalesce(private.experiment_artifact_content(p_artifacts, 'configuration'), '');
  initializer_source := coalesce(private.experiment_artifact_content(p_artifacts, 'initialization'), '');
  controller_source := coalesce(private.experiment_artifact_content(p_artifacts, 'controller'), '');

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
    null,
    null,
    null,
    'curated',
    p_title,
    coalesce(p_description, ''),
    p_schema_version,
    p_interface_version,
    config_source,
    initializer_source,
    controller_source,
    p_artifacts,
    caller
  ) returning id into snapshot_id;

  insert into public.showcase_entries(
    snapshot_id,
    source_experiment_id,
    source_key,
    source_owner_id,
    source_revision,
    published_by
  ) values (
    snapshot_id,
    null,
    p_source_key,
    null,
    null,
    caller
  ) returning id into entry_id;

  return entry_id;
end;
$$;

revoke all on function public.promote_catalog_to_showcase(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.promote_catalog_to_showcase(text, text, text, text, text, jsonb) to authenticated;
