# Round 1B scientific kernel

## Implemented boundary

Round 1B replaces the time-only probe with a deterministic, simulator-owned scientific execution loop in Rust. The browser wrapper remains a Web Worker + WASM boundary; the main thread only sends commands and receives snapshots.

The generic kernel now has explicit types and interfaces for physical state, observations, actions, physics, observation construction, neighbourhood queries, controller runtime, metrics, simulation configuration, scheduling, snapshots, and reset semantics.

## Ownership

- **Simulator:** global physical state, seed/PRNG, random initialization, physics time, independent schedules, neighbourhood query, observation construction, actuator state, action application, snapshot creation.
- **Controller runtime:** controller-private state and `step(agent_index, observation) -> action` only.
- **Physics model:** mutates physical state from actuator state and `physics_dt`.
- **Metrics:** receive read-only state on their own schedule.
- **Renderer/UI:** receives copied snapshots. Snapshot frequency cannot advance scientific state.

The controller interface contains no RNG, seed, world/simulator object, filesystem, network, render clock, or mutable physical state.

## Deterministic randomness

The kernel uses a small explicit SplitMix64 PRNG implementation owned by `Simulation`. Round 1B uses it for deterministic random initial positions/orientations. This makes the RNG algorithm an implementation detail we can version in provenance rather than delegating reproducibility to browser `Math.random()` or controller code.

Sensing/actuation-noise distributions are not yet added because the first exact noise semantics belong to the AEM implementation in #14. When added, sampling stays inside simulator/observation/action-application boundaries.

## Scheduling

`physics_dt` is the base scientific clock. Round 1B requires `control_dt` and `metric_dt` to be integer multiples of `physics_dt`; this creates exact deterministic strides without accumulating wall-clock error. This is deliberately stricter than the eventual scheduler and can be generalized later without changing subsystem ownership.

At a control tick the simulator constructs all local observations from one physical-state snapshot, evaluates every controller, stores returned actions, and then the physics model applies/holds those actions across subsequent physics ticks until the next control update.

Rendering has no scheduler inside the scientific kernel. A renderer can request snapshots at any frequency or not exist at all.

## Neighbour reference implementation

`BruteForceNeighbourIndex` is now the correctness oracle. It performs radius queries against physical positions and excludes the querying agent. Any later spatial hash/grid must return scientifically equivalent neighbour sets against this implementation before being accepted.

## Probe controller

`LocalCentroidProbeController` is intentionally a generic local controller used only to exercise the kernel before #13/#14. It is explicitly not the Active Elastic Model implementation. It receives local relative positions and heading, owns a private per-agent step counter, returns forward/turning commands, and cannot mutate the world.

The WASM-facing `ProbeSimulation` wraps the generic `Simulation<C>` with this test controller. The AEM controller will arrive through the compiled controller runtime rather than by adding AEM logic to the simulator.

## Tests

Round 1B CI checks:

- exact same-seed/same-schedule determinism;
- different seeds alter simulator-owned initialization;
- frequent snapshot/render sampling gives the exact same trajectory as sparse sampling;
- independent physics/control clocks produce the expected number of control updates;
- reset reproduces the exact initial state for the same seed;
- brute-force neighbourhood query correctness;
- returned actions change physical state only when simulator physics applies them;
- invalid clock ratios are rejected;
- Rust→WASM build and worker/static artifact continue to build.

## Next boundary

Round 1C replaces the JavaScript compiler proof + Rust probe controller with the actual versioned controller IR runtime. The generic simulator, physics, observation, neighbour, scheduling, randomness, and snapshot boundaries remain unchanged.
