# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

Read this first in a new session. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; the approved research object model lives in `docs/RESEARCH_MODEL.md`.

## Execution rule

No asynchronous external process belongs inside the assistant feedback loop. Do not poll/wait on CI, deployments, Work/browser jobs, authentication, remote services or benchmarks. Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

A bounded repository task ends with deterministic local/static verification available in the turn, durable state updates and a terminal repository write. CI/build/deploy/smoke runs independently as a non-blocking regression signal. A later observed failure becomes a focused repair task; it does not put the project into a pending state.

## Current project state

The frontend architecture migration to **Vite + React + TypeScript + Mantine is complete**. The missing visual-design half has now also been implemented on `main`:
- deliberate Virtual Lab visual system/theme;
- redesigned persistent header/app shell;
- coherent typography, spacing, surfaces and control hierarchy;
- visual treatment applied across Experiment management, Simulation/Arena, Results, Authoring, technical/account/dialog surfaces;
- MVC/scientific/runtime semantics preserved.

The frontend/visual-revamp parent remains open only for **owner visual/product acceptance of the deployed Lab**. Do not call it complete before that human check.

## Immediate gate

The next action is **owner inspection of the deployed visual revamp** at:
https://eliseofe.github.io/virtual-lab/

If the owner reports a concrete visual/UX defect, fix that defect as one focused task. Do not reopen the architecture migration or start another broad redesign cycle without evidence.

## After visual acceptance

The next planned product lane is the **student self-registration and Getting started mini-epic**:
1. production self-registration/sign-in with intentionally open enrollment for the first student phase;
2. first-login Getting started flow + persistent Help entry;
3. Grok/Claude connector setup instructions + minimal first-use exercise.

The Lab must remain continuously usable; no maintenance-mode product fork or second student site.

## Studies are explicitly blocked

Do **not** implement Studies yet.

Studies require all of the following:
1. visual-revamp owner acceptance;
2. student-registration/onboarding mini-epic complete;
3. real students begin using the production Lab;
4. later explicit owner authorization to start Studies.

The real-student-use gate is manual. Do not schedule, monitor, infer or automatically satisfy it.

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
