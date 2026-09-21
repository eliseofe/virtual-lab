-- #467: restore the missing bibliography for the implemented heterogeneous-initialization capability.
-- The source publication comes from the exact implemented request that created the capability.
-- Do not weaken canonical-registry validation or invent provenance.

do $$
declare
  v_capability_id uuid;
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

  select * into v_request
  from public.capability_requests
  where id = '2616dbb5-2134-417f-aebb-2e9e4ea0dd9c';

  if not found
     or nullif(btrim(v_request.publication_identifier), '') is null
     or nullif(btrim(v_request.publication_title), '') is null then
    raise exception 'Cannot restore #467 provenance: the exact implementation-source request or its publication identity is missing.';
  end if;

  if v_request.status <> 'implemented' then
    raise exception 'Cannot restore #467 provenance: the source request is not implemented.';
  end if;

  if v_request.canonical_capability_id is distinct from v_capability_id then
    raise exception 'Cannot restore #467 provenance: the source request is not bound to the expected canonical capability.';
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
