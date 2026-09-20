-- #399 — Copy the exact retained readable revision the user is viewing.
--
-- Access remains governed by the current source Experiment: public visibility,
-- explicit read-only sharing, or Professor supervision of a student Experiment.
-- The copied scientific payload and immutable copy provenance come from the
-- requested retained revision rather than silently switching to the latest head.

create or replace function private.copy_experiment_to_workspace_impl(
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
  source_revision_row public.experiment_revisions%rowtype;
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
    or exists (
      select 1
      from public.experiment_shares s
      where s.experiment_id = source_row.id
        and s.recipient_id = caller
    )
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

  select * into source_revision_row
  from public.experiment_revisions r
  where r.experiment_id = source_row.id
    and r.revision = p_expected_revision;

  if not found then
    raise exception 'requested source revision is not retained' using errcode = 'P0002';
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
    owner_id, collection_id, schema_version, interface_version, title, description,
    lifecycle, visibility, config_source, initializer_source, controller_source, artifacts,
    created_by_actor, created_by_ai_client, updated_by_actor, updated_by_ai_client
  ) values (
    caller,
    p_collection_id,
    source_revision_row.schema_version,
    source_revision_row.interface_version,
    btrim(p_title),
    source_revision_row.description,
    'active',
    'private',
    source_revision_row.config_source,
    source_revision_row.initializer_source,
    source_revision_row.controller_source,
    source_revision_row.artifacts,
    'human', null, 'human', null
  )
  returning id into copy_id;

  insert into public.experiment_copy_origins(
    experiment_id, source_experiment_id, source_owner_id,
    source_revision, source_title, copied_by
  ) values (
    copy_id,
    source_row.id,
    source_row.owner_id,
    source_revision_row.revision,
    source_revision_row.title,
    caller
  );

  return copy_id;
end;
$$;

revoke all on function private.copy_experiment_to_workspace_impl(uuid, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function private.copy_experiment_to_workspace_impl(uuid, bigint, text, uuid)
  to authenticated;
