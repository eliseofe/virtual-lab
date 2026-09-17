# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

Read this first in a new session. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; the approved research object model lives in `docs/RESEARCH_MODEL.md`.

## Execution rule

No asynchronous external process belongs inside the assistant feedback loop. Do not poll/wait on CI, deployments, Work/browser jobs, authentication, remote services or benchmarks. Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

A bounded repository task ends with deterministic local/static verification available in the turn, durable state updates and a terminal repository write. CI/build/deploy/smoke runs independently as a non-blocking regression signal. A later observed failure becomes a focused repair task; it does not put the project into a pending state.

## Current project state

The Vite + React + TypeScript + Mantine **architecture migration is complete**, but the visual revamp is **not** complete.

React/Mantine owns the visible View for application chrome/navigation, Results controls/panel chrome, Authoring presentation and Simulation/Arena controls. Scientific/runtime/controller engines remain authoritative underneath thin presentation adapters.

Owner’s deployed-product check: the new persistent header is visible and useful, but most of the Lab still looks substantially like the pre-migration interface. Do not claim the graphics/UI revamp is finished merely because the architecture migrated.

## Active product lane

Finish **#251 — Frontend migration and visual revamp with React + Mantine**.

Current sequence:
- **#271 — Visual system/theme foundation:** actual Mantine theme/tokens, typography, spacing, surfaces, control hierarchy and materially improved persistent header/app shell.
- **#272 — Apply the visual system across core Lab surfaces:** Experiment/workspace, Simulation, Results, Authoring, account/management/dialogs.
- **#265 — Final owner visual/product acceptance:** owner inspects/uses the deployed Lab; repair concrete defects; close #251 only when the result is materially better-looking and coherent.

The success criterion is human-visible: a normal user should immediately perceive a substantial visual improvement, not only an architectural change.

## Next lane before Studies

After #251, execute **#268 — Student self-registration and getting started before Studies**.

Children:
- **#162 / #268.1** — production Create account / Sign in with intentionally open self-registration for the first student phase;
- **#269 / #268.2** — first-login Getting started flow and persistent Help entry;
- **#270 / #268.3** — production Grok/Claude connector setup instructions plus one minimal first-use exercise.

The production Lab must remain continuously usable. Do not create a second student Lab or maintenance-mode fork.

## Studies gate

**Do not implement Studies yet.**

Studies may start only after:
1. the visual revamp (#251) is complete;
2. the student onboarding mini-epic (#268) is complete;
3. real students have begun using the production Lab;
4. the owner later gives explicit authorization to start Studies.

The real-student-use gate is manual and belongs to the owner. Do not schedule, monitor, infer or automatically satisfy it.

The previously created Study-foundation issue #267 was closed as not planned after the owner corrected the sequencing.

## MVC boundary

- **Model stays outside React:** simulator state, physics, timing, RNG, environment/action application, Experiment/Study domain objects, scientific metrics and persistence contracts.
- **Controller/runtime semantics stay authoritative:** Run/Pause/Restart/new-seed, execution-speed semantics, camera/view actions, compiler behavior and persistence behavior are not reimplemented as React state machines.
- **React/Mantine owns the View:** visible layout, controls, navigation, status presentation, responsive composition and visual system.

## Research/storage contract

- Experiment = one runnable single-run scientific definition.
- Study = one named reproducible multi-run investigation, initially pinned to one exact Experiment revision.
- Standalone metric files live under `<Experiment>/runs/`.
- Study metric files live directly under `<Experiment>/studies/<Study>/`.
- There is no extra `runs/` directory inside a Study and no directory per simulation run.
- Raw scientific output remains local-first; registry/cloud state is not the mandatory bulk-data warehouse.

## Production and architecture

- Production Lab: https://eliseofe.github.io/virtual-lab/
- Deployment: static GitHub Pages.
- Scientific/runtime authority: Rust/WASM kernel + existing worker/runtime/compiler modules.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics. Empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.

## Important blocked/parked work

Do not start merely because these issues are open:
- Studies: blocked by the explicit owner gate above;
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
- Preserve Experiment, Results, persistence, Supabase/MCP and research-AI privilege contracts unless a separately approved task changes them.

## Source precedence

1. explicit current owner instruction;
2. this `CURRENT.md`;
3. active issue for the task;
4. `web/product-surface.json` for current Lab surface/smoke contract;
5. `PROJECT_CONTROL.md`;
6. `docs/RESEARCH_MODEL.md` for research-object/storage architecture;
7. `PROJECT_STATE.md`;
8. older issues/docs/Git history.

If lower-authority text is stale, repair it rather than asking the owner to repeat an already-recorded decision.
