-- #467: restore the missing bibliography for the implemented heterogeneous-initialization capability.
-- The source publication is derived from the capability's unique implemented request.
-- Do not weaken canonical-registry validation or invent provenance.

do $$
declare
  v_capability_id uuid;
  v_source_count integer;
  v_request public.capability_requests;
begin
  select id into v_capability_id
  from public.canonical_capabilities
  where capability_key = 'initialization.per_agent_private_state_assignment';

  -- Fresh deployments that do not contain this dynamically implemented capability need no repair.
  if not found then
    return;
  end if;

  -- Never overwrite or reinterpret an existing bibliography.
  if exists (
    select 1
    from public.capability_publication_provenance
    where capability_id = v_capability_id
  ) then
    return;
  end if;

  select count(*) into v_source_count
  from public.capability_requests
  where canonical_capability_id = v_capability_id
    and status = 'implemented';

  if v_source_count <> 1 then
    raise exception 'Cannot restore #467 provenance: expected exactly one implemented source request bound to the capability, found %.', v_source_count;
  end if;

  select * into strict v_request
  from public.capability_requests
  where canonical_capability_id = v_capability_id
    and status = 'implemented';

  if nullif(btrim(v_request.publication_identifier), '') is null
     or nullif(btrim(v_request.publication_title), '') is null then
    raise exception 'Cannot restore #467 provenance: the implemented source request lacks publication identity.';
  end if;

  insert into public.capability_publication_provenance (
    capability_id,
    publication_identifier,
    publication_title
  )
  values (
    v_capability_id,
    btrim(v_request.publication_identifier),
    btrim(v_request.publication_title)
  )
  on conflict (capability_id, publication_identifier) do nothing;
end;
$$;
