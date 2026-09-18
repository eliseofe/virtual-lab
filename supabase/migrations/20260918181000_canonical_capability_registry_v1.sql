-- #345: canonical capability registry independent of capability-request lifecycle.

create table public.canonical_capabilities (
  id uuid primary key,
  capability_key text not null unique,
  capability_domain text not null,
  capability_name text not null,
  canonical_definition text not null,
  implementation_state text not null,
  implementation_contracts text[] not null default '{}'::text[],
  implemented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint canonical_capabilities_key_nonempty
    check (length(btrim(capability_key)) > 0),
  constraint canonical_capabilities_domain_nonempty
    check (length(btrim(capability_domain)) > 0),
  constraint canonical_capabilities_name_nonempty
    check (length(btrim(capability_name)) > 0),
  constraint canonical_capabilities_definition_nonempty
    check (length(btrim(canonical_definition)) > 0),
  constraint canonical_capabilities_implementation_state
    check (implementation_state in ('implemented', 'not_implemented'))
);

comment on table public.canonical_capabilities is
  'Canonical Virtual Lab semantic capability identities. This table is independent of capability-request workflow/history.';

comment on column public.canonical_capabilities.capability_key is
  'Stable semantic capability key frozen by the capability architecture.';

comment on column public.canonical_capabilities.canonical_definition is
  'Generic capability meaning only; no paper-specific interpretation or historical request discourse.';

comment on column public.canonical_capabilities.implementation_contracts is
  'Versioned implementation contracts/interfaces that currently realize this capability, where applicable.';

create table public.capability_publication_provenance (
  capability_id uuid not null references public.canonical_capabilities(id) on delete cascade,
  publication_identifier text not null,
  publication_title text not null,
  created_at timestamptz not null default now(),

  primary key (capability_id, publication_identifier),

  constraint capability_publication_identifier_nonempty
    check (length(btrim(publication_identifier)) > 0),
  constraint capability_publication_title_nonempty
    check (length(btrim(publication_title)) > 0)
);

create index capability_publication_provenance_identifier_idx
  on public.capability_publication_provenance(publication_identifier);

comment on table public.capability_publication_provenance is
  'Minimal many-to-many publication provenance for canonical capabilities. A link records bibliographic evidence only, not scientific interpretation.';

alter table public.canonical_capabilities enable row level security;
alter table public.capability_publication_provenance enable row level security;

revoke all on table public.canonical_capabilities from public, anon, authenticated;
revoke all on table public.capability_publication_provenance from public, anon, authenticated;

grant select on table public.canonical_capabilities to authenticated;
grant select on table public.capability_publication_provenance to authenticated;

create policy "canonical_capabilities_authenticated_read"
on public.canonical_capabilities
for select
to authenticated
using (true);

create policy "capability_publication_provenance_authenticated_read"
on public.capability_publication_provenance
for select
to authenticated
using (true);

insert into public.canonical_capabilities (
  id,
  capability_key,
  capability_domain,
  capability_name,
  canonical_definition,
  implementation_state,
  implementation_contracts
)
values
  (
    '9a3a3034-a268-4c14-afbc-48325f3998ae'::uuid,
    'world.periodic_square_2d',
    'world',
    'Periodic square 2-D world',
    'Two-dimensional square world with periodic wrapping and minimum-image spatial geometry.',
    'implemented',
    array['vlab.runtime/0.2']
  ),
  (
    '2aa6c1cd-243c-4a30-922f-dbf891572216'::uuid,
    'motion.forward_turning_kinematics',
    'motion',
    'Forward/turning kinematics',
    'Per-agent planar forward-speed and angular-turning action interpreted by simulator-owned first-order kinematics with configured speed and turn-rate limits.',
    'implemented',
    array['vlab.runtime/0.2', 'python-vlab/0.1', 'vlab.controller-ir/0.1']
  ),
  (
    '53362857-5650-499c-b45c-b95e6c4af13d'::uuid,
    'initialization.agent_pose',
    'initialization',
    'Per-agent pose initialization',
    'Deterministic per-agent initialization of planar position and heading; agents may receive different poses without implying heterogeneous controller-private state.',
    'implemented',
    array['vlab.initializer-state/0.2']
  ),
  (
    '0bee68fe-cb87-4d19-a51e-fa3602b79ed4'::uuid,
    'initialization.uniform_rng',
    'initialization',
    'Uniform initialization RNG',
    'Simulator-owned seeded uniform random sampling available during Experiment initialization.',
    'implemented',
    array['vlab.initializer-state/0.2']
  ),
  (
    '624eb86c-65ee-4a15-abd4-9fd331c55956'::uuid,
    'controller.private_scalar_state',
    'controller',
    'Private scalar controller state',
    'Persistent per-agent controller-owned scalar private state that only the controller may mutate; current initialization uses controller-declared values rather than heterogeneous per-agent assignment.',
    'implemented',
    array['python-vlab/0.1', 'vlab.controller-ir/0.1']
  ),
  (
    '59d44d30-e5ca-43eb-b648-d784ee1d8ac1'::uuid,
    'observation.self_heading',
    'observation',
    'Self heading observation',
    'Controller receives its own planar heading as a local read-only observation.',
    'implemented',
    array['python-vlab/0.1', 'vlab.controller-ir/0.1', 'vlab.runtime/0.2']
  ),
  (
    'bae1dbcf-abf1-414e-ba7b-b6cb82c58880'::uuid,
    'observation.local_neighbours',
    'observation',
    'Local neighbour observation',
    'Controller receives the set of other agents inside the configured local interaction radius under the active world topology.',
    'implemented',
    array['python-vlab/0.1', 'vlab.controller-ir/0.1', 'vlab.runtime/0.2']
  ),
  (
    '709f245c-1fbf-449b-a74a-690da0064f53'::uuid,
    'observation.neighbour_relative_position',
    'observation',
    'Neighbour relative-position observation',
    'For each perceived neighbour, controller receives the local relative-position vector under the current simulator-owned sensing-noise semantics.',
    'implemented',
    array['python-vlab/0.1', 'vlab.controller-ir/0.1', 'vlab.runtime/0.2']
  ),
  (
    '54b54739-b962-4b16-a584-05f728f4bac6'::uuid,
    'observation.environmental_scalar',
    'observation',
    'Local environmental scalar observation',
    'Controller receives only the scalar Environment value sampled at its actual position, without global position, field-function or spatial-gradient access.',
    'implemented',
    array['vlab.environment-capabilities/0.1', 'vlab.environment-scalar-ir/0.1', 'python-vlab/0.1']
  ),
  (
    '27237f62-50fc-467f-bf54-a0b2d4f37fee'::uuid,
    'environment.static_scalar_field',
    'environment',
    'Static scalar-field Environment',
    'Experiment can define a deterministic static scalar field over two-dimensional world position for simulator-owned evaluation and sampling.',
    'implemented',
    array['vlab.environment-capabilities/0.1', 'vlab.environment-scalar-ir/0.1']
  ),
  (
    'c52df915-e739-4de8-ad85-a3b15886d025'::uuid,
    'metrics.read_only_global_snapshot',
    'metrics',
    'Read-only global Metrics snapshot',
    'Experiment can define multiple read-only scalar Metrics over the exposed global physical snapshot using the currently supported periodic and final sampling modes, without mutating simulation or controller state.',
    'implemented',
    array['python-vlab-metrics/0.1', 'vlab.metrics-ir/0.1', 'vlab.artifact-capabilities/0.3']
  );

insert into public.capability_publication_provenance (
  capability_id,
  publication_identifier,
  publication_title
)
select
  c.id,
  p.publication_identifier,
  p.publication_title
from public.canonical_capabilities c
join (
  values
    ('world.periodic_square_2d', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms'),
    ('world.periodic_square_2d', 'doi:10.1088/1367-2630/15/9/095011', 'Collective motion dynamics of active solids and active crystals'),
    ('motion.forward_turning_kinematics', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms'),
    ('motion.forward_turning_kinematics', 'doi:10.1088/1367-2630/15/9/095011', 'Collective motion dynamics of active solids and active crystals'),
    ('initialization.agent_pose', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms'),
    ('initialization.agent_pose', 'doi:10.1088/1367-2630/15/9/095011', 'Collective motion dynamics of active solids and active crystals'),
    ('initialization.uniform_rng', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms'),
    ('initialization.uniform_rng', 'doi:10.1088/1367-2630/15/9/095011', 'Collective motion dynamics of active solids and active crystals'),
    ('controller.private_scalar_state', 'arXiv:1903.03841', 'On self-organised aggregation dynamics in swarms of robots with informed robots'),
    ('observation.self_heading', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms'),
    ('observation.self_heading', 'doi:10.1088/1367-2630/15/9/095011', 'Collective motion dynamics of active solids and active crystals'),
    ('observation.local_neighbours', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms'),
    ('observation.local_neighbours', 'doi:10.1088/1367-2630/15/9/095011', 'Collective motion dynamics of active solids and active crystals'),
    ('observation.neighbour_relative_position', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms'),
    ('observation.neighbour_relative_position', 'doi:10.1088/1367-2630/15/9/095011', 'Collective motion dynamics of active solids and active crystals'),
    ('observation.environmental_scalar', 'doi:10.1007/s11721-022-00220-1', 'Collective gradient perception with a flying robot swarm'),
    ('environment.static_scalar_field', 'doi:10.1007/s11721-022-00220-1', 'Collective gradient perception with a flying robot swarm'),
    ('metrics.read_only_global_snapshot', 'doi:10.1103/PhysRevLett.111.268302', 'Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms')
) as p(capability_key, publication_identifier, publication_title)
  on p.capability_key = c.capability_key
on conflict (capability_id, publication_identifier) do nothing;

create or replace function public.list_canonical_capability_registry()
returns table (
  id uuid,
  capability_key text,
  capability_domain text,
  capability_name text,
  canonical_definition text,
  implementation_state text,
  implementation_contracts text[],
  publication_provenance jsonb
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    c.id,
    c.capability_key,
    c.capability_domain,
    c.capability_name,
    c.canonical_definition,
    c.implementation_state,
    c.implementation_contracts,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'identifier', p.publication_identifier,
          'title', p.publication_title
        )
        order by p.publication_identifier
      ) filter (where p.capability_id is not null),
      '[]'::jsonb
    ) as publication_provenance
  from public.canonical_capabilities c
  left join public.capability_publication_provenance p
    on p.capability_id = c.id
  group by
    c.id,
    c.capability_key,
    c.capability_domain,
    c.capability_name,
    c.canonical_definition,
    c.implementation_state,
    c.implementation_contracts
  order by c.capability_domain, c.capability_key;
$function$;

revoke all on function public.list_canonical_capability_registry() from public;
revoke execute on function public.list_canonical_capability_registry() from anon;
grant execute on function public.list_canonical_capability_registry() to authenticated;

comment on function public.list_canonical_capability_registry() is
  'Authenticated read seam for the canonical capability registry introduced by #345. Independent of legacy capability_requests and not yet the #334 neutral-discovery cutover path.';
