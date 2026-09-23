// #375: implemented capability-to-authoring bindings.
// Canonical scientific meaning and implementation lifecycle live in Supabase.
// This static build-time surface describes only how implemented capabilities are
// expressed through the current authoring/runtime interfaces.

function freezeSurface(surface) {
  const signature = surface.signature
    ? Object.freeze({
        args: Object.freeze([...(surface.signature.args ?? [])]),
        result: surface.signature.result,
      })
    : undefined
  return Object.freeze({
    ...surface,
    ...(signature ? { signature } : {}),
  })
}

function freezeBinding(binding) {
  return Object.freeze({
    ...binding,
    surfaces: Object.freeze(binding.surfaces.map(freezeSurface)),
    requires: Object.freeze([...(binding.requires ?? [])]),
  })
}

export const IMPLEMENTED_CAPABILITY_BINDINGS = Object.freeze([
  freezeBinding({
    canonical_capability_id: "9a3a3034-a268-4c14-afbc-48325f3998ae",
    capability_key: "world.periodic_square_2d",
    surfaces: [
      { artifact: "configuration", kind: "runtime_parameter", symbol: "ARENA_SIZE", value_type: "scalar" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "2aa6c1cd-243c-4a30-922f-dbf891572216",
    capability_key: "motion.forward_turning_kinematics",
    surfaces: [
      {
        artifact: "controller",
        kind: "action_constructor",
        symbol: "Motion",
        syntax: "Motion(forward, turning)",
        signature: { args: ["scalar", "scalar"], result: "action" },
      },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "MAX_FORWARD_SPEED", value_type: "scalar" },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "MAX_ANGULAR_SPEED", value_type: "scalar" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "53362857-5650-499c-b45c-b95e6c4af13d",
    capability_key: "initialization.agent_pose",
    surfaces: [
      {
        artifact: "initialization",
        kind: "intrinsic",
        symbol: "place",
        syntax: "place(i, x, y, heading)",
        signature: { args: ["integer", "scalar", "scalar", "scalar"], result: "void" },
      },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "0bee68fe-cb87-4d19-a51e-fa3602b79ed4",
    capability_key: "initialization.uniform_rng",
    surfaces: [
      {
        artifact: "initialization",
        kind: "intrinsic",
        symbol: "rng.uniform",
        syntax: "rng.uniform(a, b)",
        signature: { args: ["scalar", "scalar"], result: "scalar" },
      },
      { artifact: "configuration", kind: "run_seed", symbol: "SEED", value_type: "integer" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "1c8ae3f7-15bd-4d01-b320-6ca166989d22",
    capability_key: "controller.stochastic_distributions",
    surfaces: [
      {
        artifact: "controller",
        kind: "intrinsic",
        symbol: "rng.uniform",
        syntax: "rng.uniform(a, b)",
        signature: { args: ["scalar", "scalar"], result: "scalar" },
        contract_version: "vlab.controller-stochasticity/1",
        rng_contract_version: "vlab.rng/splitmix64-domain/1",
        stream_scope: "per-agent deterministic stream derived from run SEED and stable agent index",
        distribution_semantics: "finite a,b with b >= a; result in [a,b); consumes exactly one stream draw",
      },
      {
        artifact: "controller",
        kind: "intrinsic",
        symbol: "rng.bernoulli",
        syntax: "rng.bernoulli(p)",
        signature: { args: ["scalar"], result: "bool" },
        contract_version: "vlab.controller-stochasticity/1",
        rng_contract_version: "vlab.rng/splitmix64-domain/1",
        stream_scope: "per-agent deterministic stream derived from run SEED and stable agent index",
        distribution_semantics: "finite p in [0,1]; result is a boolean event; consumes exactly one stream draw",
      },
      {
        artifact: "controller",
        kind: "intrinsic",
        symbol: "rng.normal",
        syntax: "rng.normal(mean, stddev)",
        signature: { args: ["scalar", "scalar"], result: "scalar" },
        contract_version: "vlab.controller-stochasticity/1",
        rng_contract_version: "vlab.rng/splitmix64-domain/1",
        stream_scope: "per-agent deterministic stream derived from run SEED and stable agent index",
        distribution_semantics: "Box-Muller normal with finite mean and finite non-negative stddev; consumes exactly two stream draws",
      },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "624eb86c-65ee-4a15-abd4-9fd331c55956",
    capability_key: "controller.private_scalar_state",
    surfaces: [
      {
        artifact: "controller",
        kind: "private_state",
        symbol: "self.<state>",
        syntax: "scalar class attribute + self.<state>",
        value_type: "scalar",
      },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "25ee37e5-ba59-4e8a-9768-a5604e2501b5",
    capability_key: "initialization.per_agent_private_state_assignment",
    surfaces: [
      {
        artifact: "initialization",
        kind: "intrinsic",
        symbol: "set_agent_state",
        syntax: "set_agent_state(i, \"state_name\", value)",
        signature: { args: ["integer", "string", "scalar"], result: "void" },
      },
    ],
    requires: ["624eb86c-65ee-4a15-abd4-9fd331c55956"],
  }),
  freezeBinding({
    canonical_capability_id: "59d44d30-e5ca-43eb-b648-d784ee1d8ac1",
    capability_key: "observation.self_heading",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "obs.heading", value_type: "vec2" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "bae1dbcf-abf1-414e-ba7b-b6cb82c58880",
    capability_key: "observation.local_neighbours",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "obs.neighbours", value_type: "neighbours" },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "INTERACTION_RADIUS", value_type: "scalar" },
    ],
    requires: ["9a3a3034-a268-4c14-afbc-48325f3998ae"],
  }),
  freezeBinding({
    canonical_capability_id: "709f245c-1fbf-449b-a74a-690da0064f53",
    capability_key: "observation.neighbour_relative_position",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "neighbour.relative_position", value_type: "vec2" },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "SENSOR_NOISE", value_type: "scalar" },
    ],
    requires: ["bae1dbcf-abf1-414e-ba7b-b6cb82c58880"],
  }),
  freezeBinding({
    canonical_capability_id: "54b54739-b962-4b16-a584-05f728f4bac6",
    capability_key: "observation.environmental_scalar",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "obs.environmental_scalar", value_type: "scalar" },
    ],
    requires: ["27237f62-50fc-467f-bf54-a0b2d4f37fee"],
  }),
  freezeBinding({
    canonical_capability_id: "27237f62-50fc-467f-bf54-a0b2d4f37fee",
    capability_key: "environment.static_scalar_field",
    surfaces: [
      {
        artifact: "initialization",
        kind: "environment_entry",
        symbol: "environmental_scalar",
        syntax: "environmental_scalar(x, y, config)",
        signature: { args: ["scalar", "scalar", "config"], result: "scalar" },
      },
      {
        artifact: "metrics",
        kind: "snapshot_intrinsic",
        symbol: "environment_scalar_at",
        syntax: "environment_scalar_at(position)",
        signature: { args: ["vec2"], result: "scalar" },
        availability: "environment_scalar",
      },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "1fbe59fb-79f3-48f7-9500-16557297ea0a",
    capability_key: "observation.named_reference_relative_position",
    surfaces: [
      {
        artifact: "initialization",
        kind: "intrinsic",
        symbol: "define_reference",
        syntax: "define_reference(name, x, y)",
      },
      {
        artifact: "initialization",
        kind: "intrinsic",
        symbol: "set_agent_reference_sensor",
        syntax: "set_agent_reference_sensor(agent_index, name, max_range)",
      },
      {
        artifact: "controller",
        kind: "observation_pattern",
        symbol: "obs.references.<name>.available",
        value_type: "bool",
      },
      {
        artifact: "controller",
        kind: "observation_pattern",
        symbol: "obs.references.<name>.relative_position",
        value_type: "vec2",
      },
      {
        artifact: "metrics",
        kind: "snapshot_pattern",
        symbol: "snapshot.references.<name>.position",
        value_type: "vec2",
      },
    ],
    requires: ["9a3a3034-a268-4c14-afbc-48325f3998ae"],
  }),
  freezeBinding({
    canonical_capability_id: "c52df915-e739-4de8-ad85-a3b15886d025",
    capability_key: "metrics.read_only_global_snapshot",
    surfaces: [
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.scientific_time", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.physics_ticks", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.control_updates", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.agent_count", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.agents", value_type: "sequence<agent>" },
      { artifact: "metrics", kind: "snapshot_pattern", symbol: "snapshot.config.<name>", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.index", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.position", value_type: "vec2" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.velocity", value_type: "vec2" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.angular_velocity", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.heading", value_type: "vec2" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.heading_angle", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.action.forward", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot_field", symbol: "agent.action.turning", value_type: "scalar" },
      { artifact: "metrics", kind: "snapshot_pattern", symbol: "agent.private_state.<name>", value_type: "scalar" },
      {
        artifact: "metrics",
        kind: "sampling",
        symbol: "every",
        syntax: "every(seconds)",
        signature: { args: ["scalar"], result: "sampling" },
      },
      {
        artifact: "metrics",
        kind: "sampling",
        symbol: "final",
        syntax: "final()",
        signature: { args: [], result: "sampling" },
      },
    ],
  }),
])
