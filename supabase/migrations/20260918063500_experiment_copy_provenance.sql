-- #288 — Copy a readable non-owned Experiment into the caller's workspace.
--
-- Copy provenance is registry metadata, not scientific Experiment state. The source
-- Experiment id is deliberately not a foreign key so provenance survives later
-- deletion of the source working copy.

create table if not exists public.experiment_copy_origins (
  experiment_id uuid primary key references public.experiments(id) on delete cascade,
  source_experiment_id uuid not null,
  source_owner_id uuid not null,
  source_revision bigint not null check (source_revision >= 1),
  source_title text not null,
  copied_by uuid not null,
  copied_at timestamptz not null default now()
);

comment on table public.experiment_copy_origins is
  'Immutable provenance for independent Experiments created by copying an authorized readable source revision.';

alter table public.experiment_copy_origins enable row level security;
revoke all on table public.experiment_copy_origins from anon, authenticated;
grant select on table public.experiment_copy_origins to authenticated;

drop policy if exists "experiment_copy_origins_select_own"
  on public.experiment_copy_origins;
create policy "experiment_copy_origins_select_own"
on public.experiment_copy_origins for select
to authenticated
using (
  exists (
    select 1
    from public.experiments e
    where e.id = experiment_copy_origins.experiment_id
      and e.owner_id = (select auth.uid())
  )
);

create or replace function public.copy_experiment_to_workspace(
  p_source_experiment_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_collection_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  source_row public.experiments%rowtype;
  copy_id uuid;
  can_read_source boolean := false;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'source revision is required' using errcode = '22023';
  end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'copy title is required' using errcode = '22023';
  end if;

  select * into source_row
  from public.experiments e
  where e.id = p_source_experiment_id
    and e.lifecycle = 'active';

  if not found then
    raise exception 'readable active source Experiment not found' using errcode = 'P0002';
  end if;

  if source_row.owner_id = caller then
    raise exception 'source Experiment is already owned by this account' using errcode = '22023';
  end if;

  can_read_source :=
    source_row.visibility = 'public'
    or (
      private.current_user_is_professor()
      and exists (
        select 1
        from public.profiles p
        where p.id = source_row.owner_id
          and p.role = 'student'
      )
    );

  if not can_read_source then
    raise exception 'source Experiment is not readable by this account' using errcode = '42501';
  end if;

  if source_row.revision <> p_expected_revision then
    raise exception 'source Experiment revision changed: expected %, current %',
      p_expected_revision, source_row.revision
      using errcode = '40001';
  end if;

  if p_collection_id is not null and not exists (
    select 1
    from public.experiment_collections c
    where c.id = p_collection_id
      and c.owner_id = caller
  ) then
    raise exception 'destination collection not found' using errcode = '42501';
  end if;

  insert into public.experiments(
    owner_id,
    collection_id,
    schema_version,
    interface_version,
    title,
    description,
    lifecycle,
    visibility,
    config_source,
    initializer_source,
    controller_source,
    artifacts,
    created_by_actor,
    created_by_ai_client,
    updated_by_actor,
    updated_by_ai_client
  ) values (
    caller,
    p_collection_id,
    source_row.schema_version,
    source_row.interface_version,
    btrim(p_title),
    source_row.description,
    'active',
    'private',
    source_row.config_source,
    source_row.initializer_source,
    source_row.controller_source,
    source_row.artifacts,
    'human',
    null,
    'human',
    null
  )
  returning id into copy_id;

  insert into public.experiment_copy_origins(
    experiment_id,
    source_experiment_id,
    source_owner_id,
    source_revision,
    source_title,
    copied_by
  ) values (
    copy_id,
    source_row.id,
    source_row.owner_id,
    source_row.revision,
    source_row.title,
    caller
  );

  return copy_id;
end;
$$;

revoke all on function public.copy_experiment_to_workspace(uuid, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.copy_experiment_to_workspace(uuid, bigint, text, uuid)
  to authenticated;
