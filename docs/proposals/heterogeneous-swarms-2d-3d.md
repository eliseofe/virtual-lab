# Proposal: shared agent profiles, lifecycle rules and physics backends

Status: fork architecture proposal; not an advertised or deployed capability.

## Problem and scope

The current observation exposes heading and unlabelled neighbour offsets. Initialization cannot assign distinct observable groups, the runtime cannot remove an agent from active dynamics after a proximity event, and physics always performs periodic planar kinematics. Consequently a heterogeneous pursuit/capture experiment cannot be represented by changing its authored controller alone. A 3D rendering of that state would not supply rigid-body physics.

This contribution proposes generic capabilities shared by planar and physical 3D experiments. Experiment-specific equations and labels remain authored scientific content. Existing experiments must retain their current deterministic execution and observation semantics unless they explicitly select the new capabilities.

The scope does not change student/professor permissions, the capability-request approval workflow, Supabase deployment or upstream production. A fork implementation and an upstream engineering ticket are distinct from an approved or implemented registry capability request.

## Generalization-gate assessment

The requested use case puts additional pressure on heterogeneous initialization (architecture candidate #304), physical state, observations and execution scheduling. Two independent model-specific simulator ports would duplicate identity, lifecycle and clocks and therefore fail the generalization gate.

Establish one validated per-agent profile representation and one simulator-owned lifecycle pipeline first. Extend the existing controller/physics separation through explicit backend dispatch. The existing planar backend is the compatibility implementation of that interface, not a parallel legacy simulator. Keep role names, DM equations, case definitions and scientific parameter scaling in versioned experiment fixtures.

Implementation requires the fork owner's confirmation of this shared design before extending the scientific runtime. Upstream adoption and deployment remain the maintainer's decision.

## Shared profile and observation boundary

Each placed agent has a stable ID and a validated profile reference. Profiles own group membership, supported sensor horizons, actuator limits, and a backend-compatible physical template. Reuse the profile boundary proposed in #304; do not store independent group tables in initialization, rendering and physics.

The versioned local observation may expose the receiver's group and each visible neighbour's group alongside its relative displacement. It must not expose global positions, the complete world, hidden agents, arbitrary metadata or controller-private state. Inactive agents are excluded before observation construction. Nonperiodic sensing uses Euclidean displacements; periodic sensing continues to use minimum-image geometry where selected.

Controller source must be able to branch on declared scalar comparisons, filter neighbours by group and finite range, and retain declared private state. Compiler, IR validation and both execution paths must agree. New syntax is not advertised until server validation and WASM execution both support it.

## Generic lifecycle pipeline

Lifecycle belongs to the simulator, not to controllers or metrics. Declare bounded, validated event rules over eligible source/target groups. A proximity rule specifies source group, target group, threshold, XY or XYZ distance, event cadence, target status transition and physical-membership policy.

Events evaluate from a consistent post-movement snapshot; transitions are applied atomically with deterministic precedence. A target cannot transition twice during one event phase. IDs and outcome history survive removal from sensing, control and physical participation. A renderer observes that state rather than maintaining its own removal flags.

Region entry, directed plane crossing, time limit and group-resolution terminal conditions use the same event mechanism. Experiment definitions select outcomes and precedence. A proximity event is not hard-coded to predators, prey or eating in the simulator.

## Physics and clocks

A backend owns physical state, action application and stepping. The shared runtime owns identities, profiles, event scheduling, reproducible randomness and controller dispatch. Views and metric snapshots are derived from the backend's canonical state; they are not independently integrated copies.

The planar backend supports explicitly selected nonperiodic kinematics, integration timestep and simulator-owned Cartesian velocity noise. The existing fixed-periodic configuration remains the default for old experiments.

The 3D backend must implement physical position, orientation, linear/angular velocity, mass/inertia, gravity, contact geometry and force/torque application. Its adapter accepts a declared actuator model. A quadrotor fixture uses a licensed, attributed flight controller and physical parameters; those are not assumptions embedded in every 3D body.

For the requested laboratory fixture, retain separate 20 Hz swarm, 120 Hz flight-control and 240 Hz physics events, fixed-step integration, XY sensing/capture, and an independent swarm heading integrator. Renderer/persistence cadence cannot alter these clocks. A 3D camera over planar state does not satisfy this backend.

## Authoring, registry and presentation

Keep the four existing required artifacts. Register any additional runtime declaration artifact explicitly, with a schema, compiler/validator and lifecycle ownership; do not treat passive Markdown or arbitrary JavaScript as executable scientific state.

Initialization assigns profiles and initial poses through validated intrinsics. Whole-Experiment validation checks profile IDs, group references, body templates, controller capabilities, event rules and backend compatibility before saving. Update browser and MCP validation together; a fork must not advertise these capabilities to the upstream Supabase service.

Use the existing worker and run/pause/reset path. A backend adapter selects physical stepping and state transport; rendering consumes a versioned snapshot including group, activity, status and pose. Provide a physical 3D view and preserve planar visualization. Use the existing Results/persistence path with explicit per-group metrics and event/termination metadata.

## Scientific fixtures and requested behaviour

Provide a DM-only two-group fixture, with positive/negative opposite-group spacing response, same-group flocking, independently random initial headings, an equilibrium-formation initializer and minimum nearest-pair starting separation. Removal occurs at the configured proximity threshold and excludes resolved agents from subsequent sensing and forces.

The planar fixture includes its baseline and two target-response cases. The laboratory fixture has no target, measured arena geometry, boundary response, a single documented 0.3 parameter transform and explicit physical-unit exemptions. Neither fixture imports research results or claims trajectory identity across different physics engines.

## Compatibility and validation

- Run the existing Rust and browser/compiler tests before and after runtime changes.
- Preserve legacy same-seed trajectory and metrics behaviour for configurations that do not opt in.
- Compare optimized role-filtered neighbour sets against a brute-force oracle for every topology supported.
- Validate compiler-to-IR-to-execution parity for new observations and conditional expressions.
- Use scientific reference fixtures for signals, force accumulation, saturated commands, noise application and initial placement.
- Test threshold equality, simultaneous contacts, terminal events, persistent IDs and removal from all later observations.
- Test 3D hover, actuator force/torque, gravity, wall contacts, clock ratios, heading/physical-yaw separation and body removal.
- Verify render-on/off and measurement-on/off invariance.
- Add browser checks through the shared smoke harness for 2D and 3D run/pause/reset, distinct groups, capture and finite states.
- Compile validation is insufficient: execute the runtime and actual browser build.

## Review and delivery

The fork changes must remain reviewable on a dedicated branch. The upstream ticket should link to that branch, identify implemented and outstanding capabilities separately, summarize tests and disclose backend differences. Do not copy private registry drafts, account identifiers, credentials or unpublished research outputs into the public ticket.

Upstream production capability advertisement occurs only after maintainer approval, merging, deployment and exact-candidate verification. No fork CI success should be described as an upstream deployment.
