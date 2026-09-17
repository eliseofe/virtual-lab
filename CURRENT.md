# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

Read this first in a new session. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; the approved research object model lives in `docs/RESEARCH_MODEL.md`.

## Execution rule

No asynchronous external process may ever sit inside the agent's execution loop. Do not poll/wait on CI, deployments, Work/browser jobs, authentication, remote services or benchmarks. Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

A bounded repository task ends with deterministic local/static verification available in the turn, durable state updates and a terminal repository write. CI/build/deploy/smoke runs independently as a non-blocking regression signal. A later observed failure becomes a focused repair task; it does not put the project into a pending state.

## Current project state

The frontend architecture migration to **Vite + React + TypeScript + Mantine is complete**. The visual revamp has also been accepted by the owner as a **clean, functional and usable baseline**, not as permanently finished UI/UX.

Ongoing presentation quality now lives in **#273 — UI/UX refinement and visual polish from real use**. It is a living evidence-driven lane, not a blocker on scientific/product work.

The **student self-registration and Getting started mini-epic (#268) is complete**:
- production self-registration/sign-in with intentionally open enrollment for the first student phase;
- first-login Getting started guidance plus persistent Help;
- Grok and Claude production connector setup instructions;
- a minimal read-only first connection check;
- no second student site and no mock-lab onboarding path.

A real student has now successfully registered, confirmed the account and signed in. Real student use is therefore no longer hypothetical.

A small post-onboarding UX cleanup was also applied:
- Results terminology uses **Metrics** rather than the implementation-oriented **Series** wording;
- live-result state wording is clearer;
- non-actionable periodic-boundary metadata is no longer promoted in the main Arena heading.

## Immediate frontier

The active product/scientific lane is now **real use**:
1. let students use the production Lab and connector onboarding;
2. let the owner use the Lab for actual experiments/scientific work;
3. when real use exposes concrete defects or friction, repair them as small bounded tasks;
4. continue #273 only from observed UX/UI evidence rather than generic polishing.

Do not invent a maintenance phase, a second Lab, or another broad redesign before evidence requires it.

## Studies are explicitly blocked

Do **not** implement Studies yet.

Student onboarding being complete and real student use beginning are necessary conditions, not authorization. Studies start only after a later explicit owner decision. Do not infer that gate from elapsed time, issue state, student activity, CI, or apparent technical readiness.

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
