# Virtual Lab — Project Control

Updated: 18 September 2026

Read `CURRENT.md` first. This file holds strategy detail.

## Strategic frontier

The frontend architecture migration is complete and the visual revamp remains an accepted clean, functional baseline. Student self-registration and Getting started are implemented and production-verified, and at least one real student has successfully registered, confirmed the account and signed in.

The temporary fire-and-forget CI policy is retired. Closed-loop recovery completed on 17 September with a green recovery candidate followed by a separate green workflow-acceptance candidate. The Lab is back in **normal operations**.

Studies are still not authorized.

## Priority order

1. **Next explicit owner-approved substantial Lab task** — do not infer a new epic merely because recovery finished.
2. **Real use of the production Lab** by students and the owner.
3. **Bounded fixes from evidence** — onboarding friction, terminology, usability, connector setup, or other concrete defects discovered during use.
4. **Living UI/UX refinement (#273)** only in small coherent batches from actual use, not generic polishing.
5. **Studies only after a later explicit owner authorization.**
6. Other research/product lanes remain backlog items unless the owner reprioritizes them.

Every deployable item in this order remains subject to the closed-loop production-green completion gate below.

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

The production Lab provides:
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

The student journey is production-verified, including signed-out registration readiness, first-login auto-open, mobile Help scrolling, 44 px mobile close target and bounded regression protection against the previous observer-freeze failure.

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

For each substantial user-facing/deployable ticket:

1. implement and test;
2. deploy the exact candidate;
3. follow only that exact candidate;
4. while external work is pending, keep the chat visibly alive with meaningful updates roughly every 30 seconds; never deliberately stay silent for more than about 50 seconds while control is available;
5. if the exact candidate is green, stop; one green is enough;
6. if it is red, diagnose, repair, and repeat with the repaired candidate;
7. continue until green unless there is a real blocker or the owner tells you to stop.

A real blocker is a specific condition that prevents continuation with the currently available environment or authority. Red CI/smoke, queued/in-progress verification, elapsed time, repeated failed attempts, task complexity, or conversation size is not a blocker by itself.

Follow only the exact current candidate/run and never wait for repository-wide Actions state or unrelated activity. The first verified green candidate completes the loop; do not run another green candidate merely for reassurance.

The Pages workflow stamps the exact candidate SHA into `deploy-sha.txt` and production smoke waits with a finite deadline for that marker before browser verification begins. This prevents deployment-propagation races from being treated as product regressions.

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
