# Round 1A executable architecture spike

Status: implementation committed; CI/Pages evidence determines whether this spike is accepted.

## Chosen Round 1 execution path

The smallest credible browser/native path is now concrete:

```text
researcher Python-like source
  -> browser parser + allowed-subset validation
  -> versioned target-independent controller IR
  -> controller runtime (Round 1C)

browser UI / renderer
  <-> versioned worker messages
Web Worker
  -> Rust scientific kernel compiled by wasm-pack
  -> WebAssembly module
```

The browser application is static. The Round 1A artifact uses native ES modules plus a zero-dependency Node copy/build script rather than introducing a frontend framework before it is required. `wasm-pack --target web` emits the WASM module consumed by the worker. GitHub Pages serves only static assets; scientific compute executes in the user's browser.

This validates the architectural boundary without committing later UI work to a particular rendering framework. Round 1E may retain this shell or introduce a frontend build tool if its benefit is concrete; the worker/scientific contracts stay unchanged.

## Concrete scientific module boundaries

The Rust crate establishes compile-time interfaces for:

- `PhysicsModel<State, Actuator>` — advances physical state from actuator state over `dt`;
- `ObservationModel<State, Observation>` — simulator-owned construction of one agent's observation;
- `NeighbourIndex` — replaceable spatial query interface;
- `ControllerRuntime<Observation, Action>` — compiled controller execution with controller-private runtime state;
- `MetricRuntime<State>` — read-only scientific measurement.

`ProbeKernel` proves that scientific time is advanced by explicit simulation ticks inside the WASM worker. Browser rendering cadence is absent from its API. Round 1B will replace the probe with the deterministic run scheduler/world state and the brute-force neighbourhood oracle.

## UI ↔ worker boundary

Round 1A uses typed-by-convention message objects:

```text
UI -> worker: advance(ticks), reset
worker -> UI: ready(kernelVersion, scientificTime), advanced(ticks, scientificTime), reset, error
```

Round 1B will version and formalize this protocol as real run commands/snapshots. The main thread remains an observer/command source; scientific time lives inside the worker/kernel.

## Controller compiler proof

`web/src/controller/compiler.js` implements the first executable `python-vlab/0.1` proof. It parses an AEM-shaped controller containing:

- `class ... (Agent)` and `def step(self, obs)`;
- assignments and `+=`;
- local neighbour iteration;
- numeric constants;
- field loads such as `obs.heading` and `neighbour.relative_position`;
- vector/scientific calls `Vec2`, `spring`, `dot`, `perpendicular`, `Motion`;
- arithmetic `+`, `-`, `*`, `/`;
- return of an action.

It lowers to `vlab.controller-ir/0.1`, using explicit statement/expression nodes (`assign`, `aug_assign`, `for_each`, `binary`, `call`, `load`, `return`). The IR contains no browser/GitHub/WASM-specific path and therefore remains suitable for a future native backend.

The probe rejects direct roots such as RNG/seed/world/simulator/environment/network/filesystem. Round 1C will expand semantic/type checking and execute this IR through the real controller runtime.

## Static build / cost

The build requires only GitHub Actions, Rust, wasm-pack, Node's standard library, and GitHub Pages. Runtime requires only a standards-compliant browser. No database, server process, Vercel project, paid compute, AI API, object storage, or metered runtime is introduced.

## Native/HPC path

The scientific kernel is an ordinary Rust library with `rlib` and `cdylib` outputs. Browser export annotations sit at the outer probe boundary; scientific traits do not depend on browser APIs. The intended native path is therefore the same Rust scientific core plus a native `ExecutionBackend`, with the same versioned experiment/controller IR rather than a second scientific implementation.

## Round 1B / 1C handoff

Round 1B should replace `ProbeKernel` with deterministic simulator state, simulator-owned PRNG, scheduler, observations, action application, brute-force neighbour queries, snapshots, and metric hooks.

Round 1C should keep the visible source format and `vlab.controller-ir/*` seam while replacing the probe compiler with the complete minimal parser/validator/type checker and an efficient Rust/WASM controller runtime. No Python interpreter belongs in the simulation loop.

## Acceptance evidence

The issue is accepted only after GitHub Actions proves:

1. Rust tests pass natively;
2. controller compiler tests pass;
3. Rust compiles to WASM;
4. the static artifact contains the HTML, worker, JS glue, and `.wasm` payload;
5. GitHub Pages deploys the artifact;
6. the deployed probe loads the WASM worker and the source-to-IR path works in a real browser.

The last browser interaction is a narrow Work/browser check only if this chat cannot exercise the resulting Pages URL directly.
