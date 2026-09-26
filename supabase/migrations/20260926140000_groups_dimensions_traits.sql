-- #577 (D-023, refined with the owner on 26 September): every group names its
-- dimension; rest_of_group replaces rest=True; within= nests a split inside a
-- group for exact joint counts; per-group values are read-only traits set with
-- set_trait(group, trait, value) and declared in the Controller as
-- NAME = trait(default). The capabilities keep their identity.
update public.canonical_capabilities
set canonical_definition = 'The experimenter declares an exact swarm composition at initialization. Each dimension splits the whole swarm, or one group (within=), into named groups of exact size: a fraction of the total (rounded), a count, or the rest (rest_of_group). Every group names its dimension. Groups of one split are mutually exclusive and account for all its robots; separate dimensions are independent, like crossed factors, while nested splits give exact joint counts. Members are bound to bodies by a seeded uniform random permutation per split, or by explicit placement. A group carries no values: traits and sensors attach to groups through their own capabilities. No robot is addressed individually, and robots cannot read their index, their group or the group sizes.',
    implementation_contracts = array['vlab.initializer-state/0.4', 'vlab.authoring/0.15'],
    implementation_version = 'vlab.authoring/0.15',
    updated_at = now()
where id = 'e7be7240-af33-4f44-9e57-17eccf4a861b'
  and capability_key = 'initialization.swarm_groups';

update public.canonical_capabilities
set canonical_definition = 'Heterogeneous controller traits at initialization: the Controller declares a trait as NAME = trait(default), a number or True/False, and the experimenter gives a group of robots its value with set_trait(group, trait, value), or gives it to "all" robots. Robots outside the group keep the default. Traits are read-only for the robot; its own memory is declared separately and may change. A robot must not receive the same trait from two groups. No value is set on an individual agent, and agents cannot read their index, their group or N. Generic across informed-agent, leader and team experiments.',
    implementation_contracts = array['vlab.initializer-state/0.4', 'python-vlab/0.1', 'vlab.controller-ir/0.1', 'vlab.authoring/0.15'],
    updated_at = now()
where id = '25ee37e5-ba59-4e8a-9768-a5604e2501b5'
  and capability_key = 'initialization.per_agent_private_state_assignment';

update public.canonical_capabilities
set implementation_contracts = array['vlab.initializer-state/0.4', 'vlab.world-references/0.1', 'python-vlab/0.1', 'vlab.controller-ir/0.1', 'python-vlab-metrics/0.1', 'vlab.metrics-ir/0.1', 'vlab.authoring/0.15'],
    updated_at = now()
where id = '1fbe59fb-79f3-48f7-9500-16557297ea0a'
  and capability_key = 'observation.named_reference_relative_position';
