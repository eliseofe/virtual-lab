# Architecture Decision Register

This register records decisions implementation agents should preserve unless new evidence justifies an explicit replacement. Current project status is recorded in `CURRENT_STATUS.md`; strategic direction is in `ROADMAP.md`.

## D-001 — Standalone project

Virtual Lab is a separate repository/application from the owner's academic website. Separation includes source, CI, deployment, runtime, storage, issue tracker and future domain configuration.

## D-002 — Zero-cost baseline

The laboratory's required baseline operation has €0 incremental infrastructure cost. User hardware provides simulation compute; large results remain local. Current lightweight registry/Auth/MCP uses Supabase Free and must not silently become a mandatory paid dependency.

## D-003 — Violet is reference, not base

Violet provides useful design lessons and selectively reusable MIT-licensed ideas/code. Virtual Lab does not preserve Violet abstractions merely for compatibility.

## D-004 — Agent scientific boundary

Canonical controller contract is `action = agent.step(observation)`. Observation is local. Agent private state is encapsulated and mutable only by its controller. Simulator/environment constructs observations and applies actions.

## D-005 — Simulator owns randomness

Seeds, PRNG state, random initialization, sensing noise, actuation noise and stochastic sampling are simulator responsibilities. Arbitrary host RNG is absent from the controller API.

## D-006 — Physics, control, rendering and metrics are decoupled

They are separate abstractions/schedules. Rendering and storage cadence cannot change dynamics or scientific sampling semantics.

## D-007 — Python-like authoring, compiled execution

Researchers edit constrained recognizable Python-like source. Controllers/initializers/metrics compile to supported internal/runtime representations before execution; per-step host Python interpreter crossings are outside the architecture.

## D-008 — Rust/WASM kernel

The deployed browser scientific kernel is Rust compiled to WebAssembly, with architecture intended to preserve a credible native/HPC path through stable scientific contracts.

## D-009 — Active Elastic is the first validation/showcase Experiment

The Ferrante/Turgut/Dorigo/Huepe Active Elastic model remains the first scientific diagnostic. Plausible animation alone is not scientific validation.

## D-010 — Multiple Experiments are fundamental

Virtual Lab is an Experiment workspace. “Selected/active Experiment” is per session, not a global singleton. Future collaborators may select/run different Experiments independently.

## D-011 — Registry/MCP are current Experiment-domain adapters; GitHub is engineering infrastructure

The canonical remote Experiment Registry is currently Supabase-backed, and authenticated AI authoring is exposed through MCP. These are replaceable domain adapters, not scientific semantics.

GitHub is the simulator/developer repository and CI/deployment workflow. Ordinary Experiment-domain AI access does **not** include GitHub/deployment privileges. Old plans describing GitHub as the normal AI→Experiment transport are superseded.

## D-012 — Raw scientific results are user-visible local files

The canonical raw single-run metric archive is ordinary files under a user-selected Virtual Lab workspace root where writable-directory access is supported. Browser-private storage is not the scientific archive and Supabase/Git are not the bulk result warehouse.

Standalone files are flat under `<Experiment>/runs/`; there is no directory per run. Future Study runs reuse the same contract directly under `<Experiment>/studies/<Study>/`.

## D-013 — Independent AI identities

AI-provider identity is not laboratory identity. Human/registry identities authenticate independently; AI clients act through the human's authorized domain connection where applicable.

## D-014 — Closed-loop implementation

An implementing agent must test/deploy/verify actual artifacts as appropriate before reporting completion. Operational procedure is defined in `DEVELOPMENT_WORKFLOW.md`; this decision records only the durable closed-loop principle.

## D-015 — Controller/scientific edits restart by default

Applying a controller or other scientific artifact change normally creates/reinitializes a run. Silent live scientific hot-swapping is not the baseline. Future interventions must be explicit and traceable.

## D-016 — Four compulsory Experiment artifacts

The current runnable Experiment contract is exactly:

1. Configuration
2. Initialization
3. Controller
4. Metrics

Metrics is compulsory because measurement is part of the single-run Experiment definition, but it may contain zero metric definitions. Legacy three-source representations are compatibility only and must not erase Metrics.

## D-017 — Results presentation is not scientific Experiment state

Generic Results panels bind stable metric IDs and have their own presentation revision (`vlab.results-presentation/1`). Panel/layout changes do not increment the scientific Experiment revision.

The same metric may appear in several panels and several metrics may share one panel.

## D-018 — Scientific definitions require scientific authority; accepted definitions are reusable

Developer-side implementation agents must not independently invent new paper-specific equations, controller laws, metric formulas, retuning or scientific sampling semantics.

A definition explicitly supplied/authorized by the owner/research-AI scientific workflow may be implemented/tested/reused exactly as recorded without repeatedly asking for approval. Reuse does not authorize alteration.

For the current Active Elastic acceptance fixture, `polarization = ||sum_i heading_i|| / N` sampled every 0.1 s for acceptance/display is already owner-authorized and owner-accepted.

## D-019 — Experiment-first Study result hierarchy

Studies belong under the Experiment they investigate. The local hierarchy is conceptually:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
    studies/
      <Study>/
        <metric-id>_000001.csv
        ...
```

This keeps Study origin explicit. Study metric files live directly in the Study directory; there is no extra Study `runs/` layer and no per-run subdirectory.

## D-020 — Missing scientific/software capability is explicit

An authorized research AI must not fabricate unsupported simulator behavior. Missing Experiment capability is surfaced through validation; Professor users may create a durable capability request. Professor approval still does not authorize developer implementation until the owner explicitly approves the implementation design/work.

## D-021 — Two authoring grammars: Configuration data and one code grammar

Decided by the owner on 25 September 2026 (details and rationale: `docs/REFACTORING_AUDIT_2026-09-24.md` §9).

- Configuration is data: named values only.
- Initialization, the environment field function, Controller and Metrics share **one** code grammar: the same statements, expressions, operators and types. `while` is forbidden everywhere, so every program terminates.
- Artifacts differ only in their **view**, meaning the names in scope and the effects allowed, and the compiler enforces this by scope:
  - **Initialization** is the experimenter building the world, and the most powerful view.
  - **The environment field** is a pure function of position and configuration.
  - **Metrics** is a global, read-only observer.
  - **Controller** is the robot. It reads only its own sensors, its own private state, its program's constants and parameters, and its own random stream, and it changes only itself. Other agents are reachable only through sensed collections (neighbours), never by index, and never `N`.
- Loop restrictions protect information, not computation: `for k in range(K)` with a compile-time constant `K` is allowed in every code artifact; collection loops range only over collections in the artifact's view.
- Every code artifact is statically typed.

## D-022 — Robots are anonymous

Decided by the owner on 25 September 2026, following swarm-robotics practice. A robot has no built-in identity: it cannot read its index, a unique identifier or the swarm size. A robot may draw a random number over a large domain with its own random stream and keep it as a self-generated tag. That is scalable, and it is local knowledge. Internal state may be anything, as long as it is not set globally for a particular robot.

Open, to be settled with the owner: the implemented capability `initialization.per_agent_private_state_assignment` (`set_agent_state(i, name, value)`) lets Initialization set private state on individual robots by index (informed agents and leaders, e.g. Constant Bearing Flocking). It can also be used to hand out unique identities, which D-022 forbids.
