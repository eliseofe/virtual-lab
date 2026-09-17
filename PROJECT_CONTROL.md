# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail.

## Current priority

Finish the progressive frontend migration to Vite + React + TypeScript + Mantine before resuming separate feature epics.

Completed migration stages:
1. frontend foundation/coexistence;
2. application chrome/navigation;
3. Results presentation;
4. Authoring presentation.

Current stage:
5. **Simulation/Arena presentation migration** — React/Mantine owns visible Simulation layout and controls through a narrow adapter while the existing scientific/runtime/controller/renderer implementation remains authoritative.

Remaining stage:
6. legacy presentation removal + final regression/visual acceptance.

Only after this migration epic is complete should separate feature epics such as code-authoring ergonomics resume. Before choosing the next feature epic, reconcile the remaining open roadmap against the cleaned execution model and close/supersede absorbed tickets.

## Frozen architecture

- Vite build;
- React presentation framework;
- TypeScript for migrated frontend code;
- Mantine component/design system;
- static GitHub Pages;
- existing Rust/WASM scientific/runtime core remains authoritative;
- progressive coexistence/rollback, not a flag-day rewrite;
- no Next.js/SSR.

## MVC boundary

- Model/scientific state remains outside React.
- Existing runtime/controller semantics remain authoritative and are invoked through thin presentation adapters.
- React/Mantine owns the View progressively.
- The existing canvas renderer remains authoritative; React may frame/layout it but does not redraw scientific state merely for framework consistency.

## Execution model

One substantial independently testable unit at a time. Local deterministic implementation/testing may iterate synchronously. External asynchronous systems do not participate in an agent-side wait/poll loop and no scheduled automation is created without explicit owner request.

CI/build/deploy/smoke remains useful as an independent regression signal. A later explicit status/failure turn may inspect one exact run/commit and repair a concrete failure, but there is no indefinite pending state in the agent workflow.

## Scientific boundary

Implementation agents may reason about software architecture/performance but must not invent or alter scientific models, derivations, parameters, controllers, metric definitions or sampling semantics. Reuse owner-authorized definitions exactly. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metrics and rendering as observer.
