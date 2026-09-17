# Virtual Lab — Current Session Bootstrap

Updated: 18 September 2026

Read this first in a new session. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; the approved research object model lives in `docs/RESEARCH_MODEL.md`.

## Execution rule

The project completion contract is **closed-loop, production-gated and visibly live**:

1. implement and test;
2. deploy the exact candidate;
3. follow only that exact candidate;
4. while external work is pending, keep the chat visibly alive with meaningful updates roughly every 30 seconds; never deliberately stay silent for more than about 50 seconds while control is available;
5. if the exact candidate is green, stop; one green is enough;
6. if it is red, diagnose, repair, and repeat with the repaired candidate;
7. continue until green unless there is a real blocker or the owner tells you to stop.

Never call a user-facing/deployable task fixed, complete, deployed, or production-verified from local/static checks alone.

A real blocker is a specific condition that prevents continuation with the currently available environment or authority. Red CI/smoke, a queued/in-progress exact run, elapsed time, repeated failed attempts, task complexity, or conversation size is not a blocker by itself. Keep repairing within the approved task.

Follow only the exact current candidate SHA/run; never wait for repository-wide Actions state or unrelated activity. Do not run a second green candidate merely for reassurance.

Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

## Closed-loop recovery — complete

The temporary fire-and-forget/non-blocking-CI policy introduced on 17 September is retired and the recovery is **complete**.

Two exact production candidates independently passed the restored full gate:

- recovery candidate `18f5b2171cc2c43afa7ab1cc403ab00770dfb329`, run `35260088984`;
- separate harmless workflow-acceptance candidate `f400d3750aba79701e6d1b9fb19b5b3f2bba566b`, run `35260443455`.

For both, build and Pages deployment succeeded, production exposed the exact candidate SHA before browser verification began, all **7 active Lab surfaces** passed production smoke, and the success-only owner report completed.

The workflow now stamps `deploy-sha.txt` into each Pages artifact and `web/scripts/wait-deployed-sha.mjs` waits with a hard deadline for that exact SHA before production browser smoke. This prevents post-deploy Pages/CDN propagation races from being mistaken for product failures.

Student registration and Getting started are production-verified, including:
- signed-out registration readiness;
- first-login Getting started auto-open;
- Grok/Claude guidance;
- bounded regression coverage for the previous self-triggering observer freeze;
- mobile Getting started scrolling on a 390 px viewport;
- 44 px mobile Close target.

The Lab is back in **normal operations**. There is no outstanding closed-loop recovery gate.

## Current project state

The frontend architecture migration to **Vite + React + TypeScript + Mantine is complete**. The visual revamp has been accepted by the owner as a **clean, functional and usable baseline**, not as permanently finished UI/UX.

Ongoing presentation quality lives in **#273 — UI/UX refinement and visual polish from real use**. It remains evidence-driven rather than a generic polishing lane.

The student self-registration and Getting started mini-epic (#268) is complete and production-verified:
- production self-registration/sign-in with intentionally open enrollment for the first student phase;
- first-login Getting started guidance plus persistent Help;
- Grok and Claude production connector setup instructions;
- a minimal read-only first connection check;
- no second student site and no mock-lab onboarding path.

A small post-onboarding UX cleanup was also applied:
- Results terminology uses **Metrics** rather than the implementation-oriented **Series** wording;
- live-result state wording is clearer;
- non-actionable periodic-boundary metadata is no longer promoted in the main Arena heading.

## Immediate frontier

1. await the next explicit owner-approved substantial Lab task;
2. continue real student/owner use of production and turn concrete evidence into bounded fixes;
3. use #273 only for observed UX/UI evidence rather than generic polishing;
4. keep the restored closed-loop completion contract on every deployable task.

Do not invent a maintenance phase, a second Lab, or another broad redesign before evidence requires it.

## Studies are explicitly blocked

Do **not** implement Studies yet.

Student onboarding and real student use are necessary conditions, not authorization. Studies start only after a later explicit owner decision. Do not infer that gate from elapsed time, issue state, student activity, CI, or apparent technical readiness.

## MVC boundary

- Model/scientific/domain state stays outside React.
- Runtime/controller/compiler/persistence semantics remain authoritative outside decorative UI state.
- React/Mantine owns the View and visual system.
- Canvas renderer, plot/sample engine and source/compiler engines remain authoritative where they are runtime/scientific/editor engines.

## Research/storage contract

- Experiment = one runnable single-run scientific definition.
- Study = one named reproducible multi-run investigation, initially pinned to one exact Experiment revision.
- Standalone metric files live under `<Experiment>/runs/`.
- Study metric files live directly under `<Experiment>/studies/<Study>/`.
- There is no extra `runs/` directory inside a Study and no directory per simulation run.
- Raw scientific output remains local-first.

## Production and architecture

- Production Lab: https://eliseofe.github.io/virtual-lab/
- Deployment: static GitHub Pages.
- Frontend: Vite + React + TypeScript + Mantine.
- Scientific/runtime authority: Rust/WASM kernel + existing worker/runtime/compiler modules.
- Registry/Auth/MCP backend: Supabase.
- Production MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics. Empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.

## Important blocked/parked work

Do not start merely because issues are open:
- Studies: manual owner gate above;
- deterministic RNG service: implementation needs explicit owner authorization;
- optional executable artifact dispatch: blocked on a concrete approved use case;
- numerical-integrator evaluation: requires owner scientific/numerical activation;
- native/HPC, richer physics/heterogeneous swarms, living environment/performance/validation umbrellas: future/on-demand.

## Hard scientific guardrails

- Do not invent/derive/retune scientific models, equations, parameters, controller logic, metric formulas or scientific sampling semantics without explicit owner authorization.
- Already owner-authorized scientific definitions may be reused exactly; do not alter them.
- Controller input = local observation; output = action; controller internal state is private; RNG is simulator-owned; environment applies actions.
- Global position is not an allowed robotics-controller observation unless the owner explicitly reverses that decision.
- Physics, control, rendering, metrics and persistence remain separable scheduling concerns.

## Source precedence

1. explicit current owner instruction;
2. this `CURRENT.md`;
3. active issue for the task;
4. `web/product-surface.json`;
5. `PROJECT_CONTROL.md`;
6. `docs/RESEARCH_MODEL.md`;
7. `PROJECT_STATE.md`;
8. older issues/docs/Git history.

If lower-authority text is stale, repair it rather than asking the owner to repeat an already-recorded decision.
