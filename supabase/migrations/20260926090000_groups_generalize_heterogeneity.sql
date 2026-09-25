-- #577 (D-023): one heterogeneity mechanism. WHO differs is an exact
-- partition of the swarm into experimenter-declared groups (a new canonical
-- capability); WHAT differs attaches to a group, one statement per kind of
-- robot property: starting private state (set_state) and reference sensors
-- (equip). Both existing capabilities keep their identity; their definitions
-- and contracts now describe group-based assignment.
insert into public.canonical_capabilities (
  id, capability_key, capability_domain, capability_name, canonical_definition,
  implementation_state, implementation_contracts, implementation_version,
  implemented_at, github_issue_number, github_issue_url
) values (
  'e7be7240-af33-4f44-9e57-17eccf4a861b',
  'initialization.swarm_groups',
  'initialization',
  'Exact swarm composition by experimenter-declared groups',
  'The experimenter partitions the swarm into named groups of exact size at initialization: a fraction of N (rounded), a count, or the rest of the robots. Groups sharing a partition are mutually exclusive and account for all N robots; separate partitions are independent, like crossed factors. Members are bound to bodies by a seeded uniform random permutation per partition, or by explicit placement. A group carries no values: robot properties (starting private state, sensors) attach to groups through their own capabilities. No robot is addressed individually, and robots cannot read their index, their group or the group sizes.',
  'implemented',
  array['vlab.initializer-state/0.4', 'vlab.authoring/0.14'],
  'vlab.authoring/0.14',
  now(),
  577,
  'https://github.com/eliseofe/virtual-lab/issues/577'
)
on conflict (id) do nothing;

update public.canonical_capabilities
set canonical_definition = 'Heterogeneous controller-declared private scalar state at initialization: starting values are attached to experimenter-declared groups with set_state(group, name=value), or to "all" robots. Robots outside a group keep the Controller class default. A robot must not receive the same state from two groups. No state is set on an individual agent, and agents cannot read their index, their group or N. Generic across informed-agent, leader and team experiments.',
    implementation_contracts = array['vlab.initializer-state/0.4', 'python-vlab/0.1', 'vlab.controller-ir/0.1', 'vlab.authoring/0.14'],
    updated_at = now()
where id = '25ee37e5-ba59-4e8a-9768-a5604e2501b5'
  and capability_key = 'initialization.per_agent_private_state_assignment';

update public.canonical_capabilities
set canonical_definition = 'Named point-like world references are defined in Initialization with stable names and static positions. Reference sensors are robot equipment attached to experimenter-declared groups with equip(group, reference, range), or to "all" robots, with an optional finite range or unlimited range; no sensor is assigned to an individual agent. Controller access is local only: obs.references.<name>.available reports whether that agent currently has an observation, and obs.references.<name>.relative_position yields the reference position relative to the agent when available. Metrics read reference positions from the global snapshot.',
    implementation_contracts = array['vlab.initializer-state/0.4', 'vlab.world-references/0.1', 'python-vlab/0.1', 'vlab.controller-ir/0.1', 'python-vlab-metrics/0.1', 'vlab.metrics-ir/0.1', 'vlab.authoring/0.14'],
    updated_at = now()
where id = '1fbe59fb-79f3-48f7-9500-16557297ea0a'
  and capability_key = 'observation.named_reference_relative_position';

-- Provenance is inherited, not invented: the groups capability generalizes the
-- two capabilities above, so it carries the union of their publications.
insert into public.capability_publication_provenance (capability_id, publication_identifier, publication_title)
select distinct on (p.publication_identifier)
  'e7be7240-af33-4f44-9e57-17eccf4a861b'::uuid, p.publication_identifier, p.publication_title
from public.capability_publication_provenance p
where p.capability_id in ('25ee37e5-ba59-4e8a-9768-a5604e2501b5', '1fbe59fb-79f3-48f7-9500-16557297ea0a')
  and exists (select 1 from public.canonical_capabilities c where c.id = 'e7be7240-af33-4f44-9e57-17eccf4a861b')
order by p.publication_identifier, p.created_at
on conflict (capability_id, publication_identifier) do nothing;
