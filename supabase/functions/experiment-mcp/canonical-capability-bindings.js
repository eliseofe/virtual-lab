// #347: static authoring bindings to the canonical semantic capability identities from #345.
// This file contains references and authoring surfaces only. Canonical meaning, implementation
// state/version and publication provenance remain owned by the Supabase canonical registry.

function freezeBinding(binding) {
  return Object.freeze({
    ...binding,
    surfaces: Object.freeze(binding.surfaces.map((surface) => Object.freeze({ ...surface }))),
    requires: Object.freeze([...(binding.requires ?? [])]),
  })
}

export const CANONICAL_CAPABILITY_BINDINGS = Object.freeze([
  freezeBinding({
    canonical_capability_id: "9a3a3034-a268-4c14-afbc-48325f3998ae",
    capability_key: "world.periodic_square_2d",
    surfaces: [
      { artifact: "configuration", kind: "runtime_parameter", symbol: "ARENA_SIZE" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "2aa6c1cd-243c-4a30-922f-dbf891572216",
    capability_key: "motion.forward_turning_kinematics",
    surfaces: [
      { artifact: "controller", kind: "action_constructor", symbol: "Motion(forward, turning)" },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "MAX_FORWARD_SPEED" },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "MAX_ANGULAR_SPEED" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "53362857-5650-499c-b45c-b95e6c4af13d",
    capability_key: "initialization.agent_pose",
    surfaces: [
      { artifact: "initialization", kind: "intrinsic", symbol: "place(i, x, y, heading)" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "0bee68fe-cb87-4d19-a51e-fa3602b79ed4",
    capability_key: "initialization.uniform_rng",
    surfaces: [
      { artifact: "initialization", kind: "intrinsic", symbol: "rng.uniform(a, b)" },
      { artifact: "configuration", kind: "run_seed", symbol: "SEED" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "624eb86c-65ee-4a15-abd4-9fd331c55956",
    capability_key: "controller.private_scalar_state",
    surfaces: [
      { artifact: "controller", kind: "private_state", symbol: "scalar class attribute + self.<state>" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "59d44d30-e5ca-43eb-b648-d784ee1d8ac1",
    capability_key: "observation.self_heading",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "obs.heading" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "bae1dbcf-abf1-414e-ba7b-b6cb82c58880",
    capability_key: "observation.local_neighbours",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "obs.neighbours" },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "INTERACTION_RADIUS" },
    ],
    requires: ["9a3a3034-a268-4c14-afbc-48325f3998ae"],
  }),
  freezeBinding({
    canonical_capability_id: "709f245c-1fbf-449b-a74a-690da0064f53",
    capability_key: "observation.neighbour_relative_position",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "neighbour.relative_position" },
      { artifact: "configuration", kind: "runtime_parameter", symbol: "SENSOR_NOISE" },
    ],
    requires: ["bae1dbcf-abf1-414e-ba7b-b6cb82c58880"],
  }),
  freezeBinding({
    canonical_capability_id: "54b54739-b962-4b16-a584-05f728f4bac6",
    capability_key: "observation.environmental_scalar",
    surfaces: [
      { artifact: "controller", kind: "observation", symbol: "obs.environmental_scalar" },
    ],
    requires: ["27237f62-50fc-467f-bf54-a0b2d4f37fee"],
  }),
  freezeBinding({
    canonical_capability_id: "27237f62-50fc-467f-bf54-a0b2d4f37fee",
    capability_key: "environment.static_scalar_field",
    surfaces: [
      { artifact: "initialization", kind: "environment_entry", symbol: "environmental_scalar(x, y, config)" },
    ],
  }),
  freezeBinding({
    canonical_capability_id: "c52df915-e739-4de8-ad85-a3b15886d025",
    capability_key: "metrics.read_only_global_snapshot",
    surfaces: [
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.scientific_time" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.agent_count" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.agents[].position" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.agents[].heading" },
      { artifact: "metrics", kind: "snapshot", symbol: "snapshot.agents[].heading_angle" },
      { artifact: "metrics", kind: "sampling", symbol: "every(seconds)" },
      { artifact: "metrics", kind: "sampling", symbol: "final()" },
    ],
  }),
])
