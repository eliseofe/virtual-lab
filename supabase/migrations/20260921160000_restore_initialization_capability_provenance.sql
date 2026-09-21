-- Repair the #304 capability advertised by the MCP binding but missing its
-- publication link. Recover the bibliography from the preserved scientific
-- request, rather than inventing a citation or weakening registry validation.
do $$
declare
  v_capability_id uuid;
  v_request public.capability_requests;
begin
  select id into v_capability_id
  from public.canonical_capabilities
  where capability_key = 'initialization.per_agent_private_state_assignment';

  -- This dynamically implemented capability need not exist in a fresh Lab.
  if not found then
    return;
  end if;

  -- Preserve existing bibliography, including independently repaired databases.
  if exists (
    select 1 from public.capability_publication_provenance
    where capability_id = v_capability_id
  ) then
    return;
  end if;

  -- #304 records this exact request as the implementation's scientific source.
  select * into v_request
  from public.capability_requests
  where id = '2616dbb5-2134-417f-aebb-2e9e4ea0dd9c';

  if not found
     or nullif(btrim(v_request.publication_identifier), '') is null
     or nullif(btrim(v_request.publication_title), '') is null then
    raise exception 'Cannot restore #304 provenance: the original request publication is missing.';
  end if;

  if v_request.canonical_capability_id is not null
     and v_request.canonical_capability_id <> v_capability_id then
    raise exception 'Cannot restore #304 provenance: the original request is bound to a different capability.';
  end if;

  insert into public.capability_publication_provenance (
    capability_id, publication_identifier, publication_title
  ) values (
    v_capability_id,
    btrim(v_request.publication_identifier),
    btrim(v_request.publication_title)
  )
  on conflict (capability_id, publication_identifier) do nothing;
end;
$$;
