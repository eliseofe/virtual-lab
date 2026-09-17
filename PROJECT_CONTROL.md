# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail.

## Strategic frontier

The Vite + React + TypeScript + Mantine **architecture migration is complete**, but the graphics/UI revamp is not yet complete in human terms.

The owner’s first deployed check found the sticky header useful but the rest of the Lab still visually close to the old interface. The remaining work is therefore a bounded **visual-design half**, not another framework migration.

After that comes a small **student self-registration + Getting started** product lane. **Studies are explicitly gated until real students have begun using the Lab and the owner later authorizes Studies.**

## Human-readable priority

1. **Finish the visual revamp (#251).**
   - #271: define/implement the actual Virtual Lab Mantine visual system and improve the persistent header/app shell.
   - #272: apply that system across Experiment/workspace, Simulation, Results, Authoring and account/dialog surfaces.
   - #265: final owner visual/product acceptance and focused repair if needed.
2. **Student self-registration and Getting started (#268).**
   - #162: production Create account / Sign in with intentionally open self-registration for the initial student phase.
   - #269: first-login Getting started + persistent Help.
   - #270: provider-specific Grok/Claude production connector setup + minimal first-use exercise.
3. **Real student use.** This is a manual owner gate, not an automated project task.
4. **Studies only after explicit later owner authorization.**
5. Scientific code-editor ergonomics and other research workflow lanes remain available for later prioritization; they do not override the Studies gate.

## Visual-revamp principle

React/Mantine is the presentation architecture, not a prebuilt Hugo-like theme that automatically restyles the product. The migration was useful for maintainability and future growth, but the visual system must still be intentionally designed and applied.

The visual epic completes only when a normal human can immediately perceive that the production Lab looks materially more coherent, intentional and polished while remaining a scientific workbench.

Avoid endless aesthetic polishing: one visual-system pass, one cross-surface application pass, then owner acceptance/focused fixes.

## Student-use principle

The production Lab itself is the student entry point. The owner should be able to send one URL.

Initial policy:
- open self-registration is acceptable;
- no mandatory invitation/approval workflow;
- no mock-lab branding or hidden connector-only pathway;
- after sign-up, the student sees concise Getting started guidance;
- Grok and Claude each get explicit provider-specific connector instructions;
- persistent Help remains available;
- the Lab stays continuously usable throughout development;
- do not spin up a separate student product merely to stage these features.

## Studies gate

Studies remain architecturally important but are **not active work**.

Do not create/implement a Study foundation merely because the frontend architecture can now support one. The owner’s required sequence is:
visual revamp complete → student onboarding complete → real student use begins → explicit owner authorization → Studies.

Do not schedule, monitor or infer completion of the real-student-use gate.

## Research object direction

- Experiment = one reproducible single-run definition including Metrics.
- Study = named reproducible multi-run investigation pinned initially to one exact Experiment revision.
- React/Mantine owns Study presentation, not Study domain authority.
- Study result storage is Experiment-first and local-first.
- Standalone metric files: `<Experiment>/runs/`.
- Study metric files: `<Experiment>/studies/<Study>/` directly.
- No extra Study `runs/` directory and no directory per simulation run.

`docs/RESEARCH_MODEL.md` remains the canonical research-object model, but its future Study concepts are not implementation authorization.

## Frozen frontend architecture

- Vite build;
- React presentation framework;
- TypeScript for migrated frontend code;
- Mantine component/design system;
- static GitHub Pages;
- Rust/WASM scientific/runtime core remains authoritative;
- no Next.js/SSR.

## MVC boundary

- Model/scientific/domain state remains outside React.
- Existing runtime/controller/compiler/persistence semantics remain authoritative and are invoked through thin presentation adapters/services.
- React/Mantine owns the View.
- Canvas renderer, plot/sample engine and source/compiler engines remain authoritative where they are runtime/scientific/editor engines rather than presentation chrome.

## Execution model

One substantial independently testable ticket at a time, but an owner-authorized sequence may continue across ticket boundaries without waiting for CI.

Local deterministic implementation/testing may iterate synchronously. CI/build/deploy/smoke is an independent non-blocking regression signal; later observed failures become bounded repairs.

Never poll/wait on asynchronous external verification. Never create scheduled tasks, reminders, watchdogs or automations without explicit owner request.

## Parked/blocked work

Open does not mean active:
- Studies are owner-gated as described above;
- deterministic RNG implementation needs explicit owner approval;
- optional executable artifact dispatch needs a concrete approved use case;
- numerical integrator work requires owner scientific/numerical activation;
- living validation/performance/environment umbrellas remain open by design;
- native/HPC and richer physics/heterogeneous swarms are future work;
- selected-result AI, Research Notes/Documents and synthesis depend on future Study/result foundations.

## Scientific boundary

Implementation agents may reason about software architecture/performance but must not invent or alter scientific models, derivations, parameters, controllers, metric definitions, aggregation/statistical choices or sampling semantics. Reuse owner-authorized definitions exactly. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metrics and rendering as observer.
