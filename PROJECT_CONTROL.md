# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail.

## Current priority

The progressive frontend migration to Vite + React + TypeScript + Mantine is complete at the repository/product-architecture level. Do not start another feature epic until the remaining roadmap has been reconciled against the migrated frontend and the cleaned execution model.

Completed migration surfaces:
- frontend foundation/coexistence;
- application chrome/navigation;
- Results presentation;
- Authoring presentation;
- Simulation/Arena presentation;
- legacy presentation CSS cleanup and final regression-contract reconciliation.

Human visual/product feedback may still reveal ordinary defects; those are repair tasks, not a reason to reopen the architectural migration by default.

## Frozen architecture

- Vite build;
- React presentation framework;
- TypeScript for migrated frontend code;
- Mantine component/design system;
- static GitHub Pages;
- existing Rust/WASM scientific/runtime core remains authoritative;
- no Next.js/SSR.

## MVC boundary

- Model/scientific state remains outside React.
- Existing runtime/controller semantics remain authoritative and are invoked through thin presentation adapters.
- React/Mantine owns the View.
- The existing canvas renderer, plot/sample engine and source/compiler engines remain authoritative where they are scientific/runtime/editor engines rather than presentation chrome.
- Hidden DOM action/state targets may remain as explicit compatibility plumbing until a separately justified controller extraction removes them; they are not a second visible UI.

## Execution model

One substantial independently testable unit at a time. Local deterministic implementation/testing may iterate synchronously. External asynchronous systems do not participate in an agent-side wait/poll loop, and no scheduled task/reminder/watchdog/automation is created without explicit owner request.

CI/build/deploy/smoke is an independent, non-blocking regression signal. A later explicit status/failure turn may inspect one exact run/commit and repair a concrete failure.

## Next strategic pass

Perform a bounded portfolio reconciliation of remaining open epics/tickets before choosing the next feature lane:
- close/supersede requirements already absorbed;
- repair stale architecture/process text;
- retain genuinely outstanding product/scientific/infrastructure work;
- order surviving work in human-readable terms rather than issue-number shorthand.

## Scientific boundary

Implementation agents may reason about software architecture/performance but must not invent or alter scientific models, derivations, parameters, controllers, metric definitions or sampling semantics. Reuse owner-authorized definitions exactly. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metrics and rendering as observer.
