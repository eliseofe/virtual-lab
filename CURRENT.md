# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

Read this first in a new session. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; the approved research object model lives in `docs/RESEARCH_MODEL.md`.

## Execution rule

No asynchronous external process belongs inside the assistant feedback loop. Do not poll/wait on CI, deployments, Work/browser jobs, authentication, remote services or benchmarks. Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

A bounded repository task ends with deterministic local/static verification available in the turn, durable state updates and a terminal repository write. CI/build/deploy/smoke runs independently as a non-blocking regression signal. A later observed failure becomes a focused repair task; it does not put the project into a pending state.

## Current project state

The progressive frontend migration to **Vite + React + TypeScript + Mantine is complete**.

React/Mantine owns the visible View for:
- application chrome/navigation;
- Results controls/panel chrome;
- Authoring heading/artifact controls/apply presentation;
- Simulation/Arena heading, runtime controls, speed/statistics and view controls.

The scientific/runtime/controller engines remain authoritative underneath thin presentation adapters. Hidden legacy DOM targets remain only where they carry controller/runtime compatibility; they are not a second visible interface.

The post-migration roadmap reconciliation is complete. Stale/absorbed UI and old acceptance tickets were closed; surviving work was reclassified by dependency and authorization.

## Active product lane

**Studies foundation — identity, exact pinned Experiment revision and Study workspace.**

This is the next substantive product ticket. The first slice creates:
- durable Study identity + human name;
- one exact pinned Experiment identity/revision;
- Experiment-context Study listing;
- stable/bookmarkable React/Mantine Study workspace;
- explicit indication when the Experiment has advanced without silently rebasing the Study.

It does **not** yet implement multi-run orchestration, parameter sweeps, Study result storage, checkpoint/resume, AI result handoff, Research Notes/Documents or scientific aggregation choices.

## Human-readable roadmap after this slice

1. **Scientific code-editor ergonomics** — editor foundation/highlighting, then parser-derived navigation/folding/search, then source-linked diagnostics.
2. **Continue Studies** — explicit fresh/resume semantics and local multi-run result/provenance storage.
3. **Selected Study results → AI**, then Research Notes/Documents/synthesis once Study/result identities are stable.
4. **Production access/enrollment** when the owner explicitly chooses controlled enrollment vs intentional open signup + monitoring.
5. Future simulator/HPC/performance/science work remains parked until concrete needs or explicit authorization activate it.

## MVC boundary

- **Model stays outside React:** simulator state, physics, timing, RNG, environment/action application, Experiment/Study domain objects, scientific metrics and persistence contracts.
- **Controller/runtime semantics stay authoritative:** Run/Pause/Restart/new-seed, execution-speed semantics, camera/view actions, compiler behavior, persistence behavior and future Study orchestration are not reimplemented as React state machines.
- **React/Mantine owns the View:** visible layout, controls, navigation, status presentation and responsive composition.

## Research/storage contract

- Experiment = one runnable single-run scientific definition.
- Study = one named reproducible multi-run investigation, initially pinned to one exact Experiment revision.
- Standalone metric files live under `<Experiment>/runs/`.
- Study metric files live directly under `<Experiment>/studies/<Study>/`.
- **There is no extra `runs/` directory inside a Study and no directory per simulation run.**
- Raw scientific output remains local-first; registry/cloud state is not the mandatory bulk-data warehouse.

## Production and architecture

- Production Lab: https://eliseofe.github.io/virtual-lab/
- Deployment: static GitHub Pages.
- Scientific/runtime authority: Rust/WASM kernel + existing worker/runtime/compiler modules.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics. Empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.

## Important blocked/parked work

Do not start merely because these issues are open:
- production OAuth/enrollment: blocked on explicit owner policy choice;
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
