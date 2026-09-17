# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail.

## Strategic frontier

The frontend architecture migration is complete, and the missing visual-design implementation has now been applied across the production Lab on `main`.

The current frontier is **human visual/product acceptance**, not Studies.

The owner explicitly found the architecture migration visually underwhelming because most of the page still looked like the old Lab. The follow-up visual pass therefore established an actual visual system and applied it across the core working surfaces. The frontend/visual-revamp epic remains open until the owner inspects the deployed result and considers it materially better/coherent enough.

## Priority order

1. **Owner visual acceptance of the revamped Lab.** Fix only concrete defects exposed by that use.
2. **Student self-registration and Getting started mini-epic** — open signup, first-login onboarding/help, Grok/Claude setup and a first-use exercise.
3. **Real student use of the production Lab.** This is a manual owner gate; do not automate or track it.
4. **Studies only after later explicit owner authorization.**
5. Scientific code-editor ergonomics and other surviving product/research lanes remain backlog items unless reprioritized.

## Visual architecture

The production View now uses:
- Vite + React + TypeScript + Mantine;
- one coherent visual system for typography, spacing, surfaces, control hierarchy and app chrome;
- a persistent integrated header/navigation model;
- consistent presentation across Experiment management, Simulation/Arena, Results, Authoring and utility surfaces.

This is a presentation change only. It does not move model/scientific/runtime/controller/persistence authority into React.

## Student-use direction

The student mini-epic must make the production Lab self-contained for first use:
- you send only the production Lab URL;
- Create account / Sign in is obvious from the Lab;
- open enrollment is intentional for the initial student phase;
- first login leads to concise Getting started guidance;
- Help remains accessible later;
- Grok and Claude each receive provider-specific connector/setup instructions;
- one small first-use exercise confirms the student can use the production connector and Lab;
- no mock-lab or second student product.

## Studies gate

Studies are not active work. Before implementation starts:
- visual revamp must be accepted by the owner;
- student onboarding mini-epic must be complete;
- real students must begin using the production Lab;
- owner must explicitly authorize Studies afterward.

Do not infer that gate from elapsed time, CI, issue state or apparent readiness.

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

One substantial independently testable ticket at a time. An owner-authorized sequence may continue across ticket boundaries only within the authorized lane; do not jump into the next epic merely because the previous implementation ended.

Local deterministic implementation/testing may iterate synchronously. CI/build/deploy/smoke is an independent non-blocking regression signal; later observed failures become bounded repairs.

Never poll/wait on asynchronous external verification. Never create scheduled tasks, reminders, watchdogs or automations without explicit owner request.

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
