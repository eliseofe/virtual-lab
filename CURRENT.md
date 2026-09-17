# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

Read this first in a new session. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; the approved research object model lives in `docs/RESEARCH_MODEL.md`.

## Execution rule

The project completion contract is closed-loop and bounded:

1. implement the bounded task;
2. run deterministic local/static checks;
3. verify the exact candidate through CI/build;
4. verify deployment;
5. exercise the affected deployed Lab behavior with bounded production smoke/browser checks;
6. repair and repeat if any step fails;
7. only after the exact deployed candidate is green, record durable completion state and report the task complete.

Never call a user-facing/deployable task fixed, complete, deployed, or production-verified from local/static checks alone.

The loop must also terminate. Verification stays scoped to the exact current candidate SHA/run and every test, browser process, deployment/status check, and workflow job must have a finite bound or timeout. A timeout or wedged verifier is a terminal verification failure: do not wait forever, but do not convert it into success.

Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

## Current recovery state

The previous `fire-and-forget` / non-blocking-CI completion policy introduced on 17 September is retired. The project is temporarily in **closed-loop recovery**.

The latest exact production run examined during this recovery (`35251936423`, commit `0bf7ff6`) built and deployed successfully but failed deployed responsive smoke because the mobile `Switch experiment` / browse touch target rendered at 40 px rather than the required 44 px. Therefore the current product state is **not fully production-verified**.

The student self-registration and Getting started implementation exists and a real student has successfully registered, confirmed the account and signed in. However, onboarding completion is reopened until:
- the current red production smoke is repaired;
- the exact repaired candidate passes build, deploy and production smoke;
- the student registration/onboarding path has direct bounded production liveness coverage, including protection against self-triggering observer freezes.

No further substantial product/scientific feature work should outrun this recovery gate.

## Current project state

The frontend architecture migration to **Vite + React + TypeScript + Mantine is complete**. The visual revamp has been accepted by the owner as a **clean, functional and usable baseline**, not as permanently finished UI/UX.

Ongoing presentation quality lives in **#273 — UI/UX refinement and visual polish from real use**. It remains evidence-driven rather than a generic polishing lane.

The student self-registration and Getting started mini-epic (#268) has implemented:
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

1. restore a green exact-candidate production gate for the current Lab;
2. add direct deployed liveness coverage for student registration/onboarding;
3. only after the repaired candidate is green, return to real student/scientific use and bounded evidence-driven fixes;
4. continue #273 only from observed UX/UI evidence rather than generic polishing.

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
