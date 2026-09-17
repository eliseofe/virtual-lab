# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail.

## Strategic frontier

The frontend architecture migration is complete and the visual revamp remains an accepted clean, functional baseline. The student self-registration and Getting started implementation also exists, and at least one real student has successfully registered, confirmed the account and signed in.

However, the previous fire-and-forget CI policy is retired. The project is temporarily in **closed-loop recovery** because the latest exact production verification examined during recovery is red. Real-use work resumes only after the current production gate is green and student registration/onboarding has direct deployed liveness coverage.

Studies are still not authorized.

## Priority order

1. **Restore the closed production loop** — exact candidate build, deploy and affected production smoke must be green before completion is recorded.
2. **Direct onboarding liveness coverage** — deployed registration/Getting started behavior must be exercised with bounded browser checks, including the observer-freeze path.
3. **Real use of the production Lab** by students and the owner after the recovery gate is green.
4. **Bounded fixes from evidence** — onboarding friction, terminology, usability, connector setup, or other concrete defects discovered during use.
5. **Living UI/UX refinement (#273)** only in small coherent batches from actual use, not generic polishing.
6. **Studies only after a later explicit owner authorization.**
7. Other research/product lanes remain backlog items unless the owner reprioritizes them.

## Frontend and visual state

The production View uses:
- Vite + React + TypeScript + Mantine;
- one coherent visual system for typography, spacing, surfaces, control hierarchy and app chrome;
- persistent integrated header/navigation;
- consistent presentation across Experiment management, Simulation/Arena, Results, Authoring and utility surfaces.

The owner accepted this as clean and usable, not as the final aesthetic endpoint. Long-lived UI/UX work belongs to #273.

The first post-onboarding polish pass already:
- changed Results wording from **Series** to **Metrics**;
- clarified the live-results state presentation;
- removed non-actionable periodic-boundary metadata from the prominent Arena heading.

This remains presentation-only. It does not move model/scientific/runtime/controller/persistence authority into React.

## Student-use state

The production Lab implementation provides:
- one normal production Lab URL;
- obvious Create account / Sign in;
- intentionally open enrollment for the initial phase;
- concise first-login Getting started guidance;
- persistent Help;
- provider-specific **Use with Grok** and **Use with Claude** paths;
- the production MCP endpoint;
- one read-only first connection exercise;
- no mock-lab or second student product.

The production connector remains Experiment-domain only. It does not grant GitHub, shell, deployment or hidden simulator-development privilege.

This implementation must not be called fully complete again until the current exact-candidate production gate is green and the student path has direct bounded deployed verification.

## Studies gate

Studies are not active work. The owner explicitly wants more real use and scientific work before deciding when to start them.

Do not infer authorization from:
- student onboarding implementation or verification state;
- a student successfully signing in;
- elapsed time;
- CI/deployment state;
- issue status;
- apparent architectural readiness.

Only a later explicit owner instruction activates Studies.

## Research object direction

- Experiment = one reproducible single-run definition including Metrics.
- Study = named reproducible multi-run investigation pinned initially to one exact Experiment revision.
- React/Mantine owns Study presentation when that work is eventually authorized, not Study domain authority.
- Study result storage is Experiment-first and local-first.
- Standalone metric files: `<Experiment>/runs/`.
- Study metric files: `<Experiment>/studies/<Study>/` directly.
- No extra Study `runs/` directory and no directory per simulation run.

## MVC boundary

- Model/scientific/domain state remains outside React.
- Existing runtime/controller/compiler/persistence semantics remain authoritative and are invoked through thin presentation adapters/services.
- React/Mantine owns the View.
- Canvas renderer, plot/sample engine and source/compiler engines remain authoritative where they are runtime/scientific/editor engines rather than presentation chrome.

## Execution model

One substantial independently testable ticket at a time. An owner-authorized sequence may continue across ticket boundaries only within the explicitly authorized lane; do not jump into the next epic merely because the previous implementation ended.

For a user-facing/deployable ticket, completion means: implementation → deterministic checks → exact-candidate CI/build → deployment → bounded verification of the affected deployed behavior → durable completion state. A failure is repaired and the bounded loop repeats for the repaired candidate.

Verification is allowed to depend on asynchronous external systems, but assistant execution must remain structurally terminating: inspect only the exact current candidate/run, use finite status checks/timeouts, and never enter repository-wide monitoring or unbounded polling. A timeout or wedged verifier is a terminal verification failure, not success.

Never create scheduled tasks, reminders, watchdogs or automations without explicit owner request.

## Parked/blocked work

Open does not mean active:
- Studies: manual owner gate above;
- deterministic RNG implementation: explicit owner approval required;
- optional executable artifact dispatch: concrete approved use case required;
- numerical integrator work: owner scientific/numerical activation required;
- living validation/performance/environment umbrellas remain open by design;
- native/HPC and richer physics/heterogeneous swarms are future work;
- selected-result AI, Research Notes/Documents and synthesis depend on Study/result foundations.

## Scientific boundary

Implementation agents may reason about software architecture/performance but must not invent or alter scientific models, derivations, parameters, controllers, metric definitions, aggregation/statistical choices or sampling semantics. Reuse owner-authorized definitions exactly. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metrics and rendering as observer.
