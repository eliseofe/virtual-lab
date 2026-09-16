# Architecture Decision Register

This register records decisions implementation agents should preserve unless new evidence justifies an explicit replacement. Current sequencing is controlled by `PROJECT_CONTROL.md`.

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

Standalone files are flat under `<Experiment>/runs/`; there is no directory per run. Future Study runs reuse the same contract under `<Experiment>/studies/<Study>/runs/`.

## D-013 — Independent AI identities

AI-provider identity is not laboratory identity. Human/registry identities authenticate independently; AI clients act through the human's authorized domain connection where applicable.

## D-014 — Closed-loop implementation

An implementing agent must test/deploy/verify actual artifacts as appropriate before reporting completion. Human review is not a substitute for elementary software verification.

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
        runs/
```

This keeps Study origin explicit. Runs are loose files, not per-run subdirectories.

## D-020 — Missing scientific/software capability is explicit

An authorized research AI must not fabricate unsupported simulator behavior. Missing Experiment capability is surfaced through validation; Professor users may create a durable capability request. Professor approval still does not authorize developer implementation until the owner explicitly approves the implementation design/work.
