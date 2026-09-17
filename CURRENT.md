# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

Read this first in a new session. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; history lives in Git/closed issues.

## Execution rule

No asynchronous external process belongs inside the agent feedback loop. Do not poll/wait on CI, deployments, Work/browser jobs, authentication, remote services or benchmarks. Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

A bounded repository task ends with deterministic local/static verification available in the turn, durable state updates and a terminal repository write. CI/build/deploy/smoke runs independently as a non-blocking regression signal. When the owner explicitly asks for status or reports a failure, perform one bounded lookup of the exact relevant run/commit and act on that result.

## Current project state

The progressive frontend migration to **Vite + React + TypeScript + Mantine is code-complete**.

Migrated user-facing presentation:
- application chrome/navigation;
- Results controls/panel chrome;
- Authoring heading/artifact controls/apply presentation;
- Simulation/Arena heading, runtime controls, speed/statistics and view controls.

The existing scientific/runtime/controller engines remain authoritative underneath thin presentation adapters. Obsolete global/responsive CSS for superseded legacy chrome and Simulation controls has been retired; hidden legacy DOM targets that still carry controller/runtime semantics remain compatibility plumbing rather than a second visible interface.

## Next project action

Before starting another feature epic, perform the owner-requested **portfolio reconciliation of remaining open epics/tickets**:
- identify requirements already absorbed by the frontend migration or prior completed work;
- close/supersede stale or duplicate tickets;
- update surviving tickets to the cleaned MVC architecture and current bounded execution model;
- produce a human-readable priority sequence without relying on issue numbers as memory.

Human visual/product testing of the migrated Lab is useful feedback but is not an asynchronous gate that stops roadmap reconciliation.

## MVC boundary

- **Model stays outside React:** simulator state, physics, timing, RNG, environment/action application, Experiment artifacts, scientific metrics and persistence contracts.
- **Controller/runtime semantics stay authoritative:** Run/Pause/Restart/new-seed, execution-speed semantics, camera/view actions, compiler behavior and persistence behavior are not reimplemented as React state machines.
- **React/Mantine owns the View:** visible layout, controls, navigation, status presentation and responsive composition.

The migration changes presentation wiring/adapters only; it does not move scientific/runtime authority into React.

## Production and architecture

- Production Lab: https://eliseofe.github.io/virtual-lab/
- Deployment: static GitHub Pages.
- Scientific/runtime authority: Rust/WASM kernel + existing worker/runtime/compiler modules.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics. Empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.
- Raw run results are local-first ordinary files; browser-private storage/Supabase are not the scientific bulk archive.

## Current product tracking

`web/product-surface.json` is the machine-readable source of truth for current user-facing Lab surfaces and bounded production-smoke coverage.

`CURRENT.md` is the source of truth for what work is happening now/next.

## Hard guardrails

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
6. `PROJECT_STATE.md`;
7. older issues/docs/Git history.

If lower-authority text is stale, repair it rather than asking the owner to repeat an already-recorded decision.
