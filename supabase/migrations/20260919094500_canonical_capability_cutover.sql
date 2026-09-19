-- #348: production cutover to the independent canonical capability registry.
-- The legacy #333/#334 request-derived capability view is retired only after
-- proving the frozen implemented inventory and publication provenance are intact.

do $$
declare
  v_keys text[];
  v_missing_provenance bigint;
begin
  select array_agg(c.capability_key order by c.capability_key)
    into v_keys
  from public.canonical_capabilities c
  where c.implementation_state = 'implemented';

  if v_keys is distinct from array[
    'controller.private_scalar_state',
    'environment.static_scalar_field',
    'initialization.agent_pose',
    'initialization.uniform_rng',
    'metrics.read_only_global_snapshot',
    'motion.forward_turning_kinematics',
    'observation.environmental_scalar',
    'observation.local_neighbours',
    'observation.neighbour_relative_position',
    'observation.self_heading',
    'world.periodic_square_2d'
  ]::text[] then
    raise exception 'Canonical capability cutover refused: implemented inventory does not match the frozen 11-capability baseline.';
  end if;

  if exists (
    select 1
    from public.canonical_capabilities c
    where c.implementation_state <> 'implemented'
  ) then
    raise exception 'Canonical capability cutover refused: unexpected non-implemented canonical capability exists before clean-baseline acceptance.';
  end if;

  select count(*)
    into v_missing_provenance
  from public.canonical_capabilities c
  where not exists (
    select 1
    from public.capability_publication_provenance p
    where p.capability_id = c.id
  );

  if v_missing_provenance <> 0 then
    raise exception 'Canonical capability cutover refused: every implemented capability must have publication provenance.';
  end if;

  if (select count(*) from public.canonical_capabilities) <> 11 then
    raise exception 'Canonical capability cutover refused: canonical registry must contain exactly the frozen 11 implemented capabilities.';
  end if;
end;
$$;

-- Retire only the explicitly waived legacy request state.
delete from public.capability_requests
where id in (
  '7492c39d-fdd0-4f29-9661-63dbc6461bf5'::uuid,
  '49368c8e-dff7-4ce0-9072-bc3f4b37ada2'::uuid,
  'd89cdc40-bbcc-426c-ac40-7dc3f3638599'::uuid
);

-- #334's request-derived RPC is no longer a capability authority.
drop function if exists public.list_canonical_capabilities();

-- #333's request-local canonical metadata is obsolete. The typed request workflow
-- introduced later remains intact and references canonical capability identity.
alter table public.capability_requests
  drop constraint if exists capability_requests_canonical_definition_nonempty,
  drop constraint if exists capability_requests_publication_provenance_array,
  drop column if exists canonical_definition,
  drop column if exists publication_provenance;

comment on function public.list_canonical_capability_registry() is
  'Authoritative global authenticated Virtual Lab semantic capability registry. Reads canonical capability identity, implementation state/contracts and minimal publication provenance independently of capability-request workflow/history.';
