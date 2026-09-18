-- #333: canonical capability metadata without exposing historical scientific discourse.

alter table public.capability_requests
  add column if not exists canonical_definition text,
  add column if not exists publication_provenance jsonb not null default '[]'::jsonb;

alter table public.capability_requests
  add constraint capability_requests_canonical_definition_nonempty
    check (canonical_definition is null or length(btrim(canonical_definition)) > 0),
  add constraint capability_requests_publication_provenance_array
    check (jsonb_typeof(publication_provenance) = 'array');

comment on column public.capability_requests.canonical_definition is
  'Owner-approved generic capability meaning. This is the reusable capability description; historical request context is not canonical scientific knowledge.';

comment on column public.capability_requests.publication_provenance is
  'Minimal bibliographic provenance only: published source title plus persistent identifier. No scientific interpretation or prior AI/Professor discourse.';

update public.capability_requests
set
  canonical_definition = 'Simulator-owned deterministic/reproducible controller stochasticity with generic deterministic probability distributions.',
  publication_provenance = jsonb_build_array(
    jsonb_build_object(
      'title', 'On self-organised aggregation dynamics in swarms of robots with informed robots',
      'identifier', 'arXiv:1903.03841'
    )
  )
where id = '7492c39d-fdd0-4f29-9661-63dbc6461bf5'::uuid;

update public.capability_requests
set
  canonical_definition = 'Heterogeneous swarm initialization/state so different agents may begin with different simulator-owned private properties or capabilities.',
  publication_provenance = jsonb_build_array(
    jsonb_build_object(
      'title', 'On self-organised aggregation dynamics in swarms of robots with informed robots',
      'identifier', 'arXiv:1903.03841'
    )
  )
where id = '49368c8e-dff7-4ce0-9072-bc3f4b37ada2'::uuid;

update public.capability_requests
set
  canonical_definition = 'Generic static scalar-field Environment sampled locally at each agent position and exposed to the controller as obs.environmental_scalar, without exposing global position, the field function, or a spatial gradient.',
  publication_provenance = jsonb_build_array(
    jsonb_build_object(
      'title', 'Collective gradient perception with a flying robot swarm',
      'identifier', 'doi:10.1007/s11721-022-00220-1'
    )
  )
where id = 'd89cdc40-bbcc-426c-ac40-7dc3f3638599'::uuid;
