-- #577 (D-022): heterogeneous controller-private state at initialization is
-- authored as an exact composition of experimenter-declared roles. The
-- capability keeps its identity; its definition and contracts describe roles.
update public.canonical_capabilities
set canonical_definition = 'Heterogeneous controller-declared private scalar state at initialization, declared by the experimenter as an exact composition of roles. Each role has a size (a fraction of N, a count, or the rest of the robots), a binding to bodies (a seeded uniform random permutation, or explicit placement), and starting values for controller-declared private scalar state; fields a role does not set keep the Controller class default. No state is set on an individual agent, and agents cannot read their index, the role counts or N. Generic across informed-agent, leader and team experiments.',
    implementation_contracts = array['vlab.initializer-state/0.4', 'python-vlab/0.1', 'vlab.controller-ir/0.1', 'vlab.authoring/0.13'],
    updated_at = now()
where id = '25ee37e5-ba59-4e8a-9768-a5604e2501b5'
  and capability_key = 'initialization.per_agent_private_state_assignment';
