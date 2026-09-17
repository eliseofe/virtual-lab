# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail.

## Strategic frontier

The Vite + React + TypeScript + Mantine frontend migration is complete. The post-migration roadmap has been reconciled.

The active next product lane is **Studies**, starting with the smallest foundation slice: durable Study identity, one exact pinned Experiment revision, Experiment-context discovery and a stable React/Mantine Study workspace.

This sequencing follows the original reason for the frontend migration: establish the reusable application architecture before adding the large new Studies workspace.

## Human-readable priority

1. **Study foundation** — identity + exact pinned Experiment revision + Study workspace.
2. **Scientific code-editor ergonomics** — highlighting/editor foundation; parsed navigation/folding/search; source-linked diagnostics.
3. **Continue Studies** — explicit fresh/resume semantics and Study-level local result/provenance storage.
4. **Selected Study results → AI**, followed by Research Notes/Documents and synthesis after stable Study/result identities exist.
5. **Production access/enrollment** when the owner chooses the admission policy; promote earlier only if access becomes urgent.
6. Future native/HPC, simulator performance, environment capabilities, richer physics/heterogeneity and numerics remain demand/authorization driven.

## Research object direction

- Experiment = one reproducible single-run definition including Metrics.
- Study = named reproducible multi-run investigation pinned initially to one exact Experiment revision.
- React/Mantine owns Study presentation, not Study domain authority.
- Study result storage is Experiment-first and local-first.
- Standalone metric files: `<Experiment>/runs/`.
- Study metric files: `<Experiment>/studies/<Study>/` directly.
- No extra Study `runs/` directory and no directory per simulation run.

`docs/RESEARCH_MODEL.md` is the canonical research-object model and has been reconciled to this storage contract.

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

The same boundary applies to Studies: React displays Study state and invokes explicit Study-domain actions; it must not make component state the authority for pinned revisions, protocols, runs, provenance or scientific results.

## Execution model

One substantial independently testable ticket at a time, but an owner-authorized sequence may continue across ticket boundaries without waiting for CI.

Local deterministic implementation/testing may iterate synchronously. CI/build/deploy/smoke is an independent non-blocking regression signal; later observed failures become bounded repairs.

Never poll/wait on asynchronous external verification. Never create scheduled tasks, reminders, watchdogs or automations without explicit owner request.

## Parked/blocked work

Open does not mean active:
- access/enrollment needs explicit owner policy choice;
- deterministic RNG implementation needs explicit owner approval;
- optional executable artifact dispatch needs a concrete approved use case;
- numerical integrator work requires owner scientific/numerical activation;
- living validation/performance/environment umbrellas remain open by design;
- native/HPC and richer physics/heterogeneous swarms are future work;
- selected-result AI, Research Notes/Documents and synthesis depend on Study/result foundations.

## Scientific boundary

Implementation agents may reason about software architecture/performance but must not invent or alter scientific models, derivations, parameters, controllers, metric definitions, aggregation/statistical choices or sampling semantics. Reuse owner-authorized definitions exactly. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metrics and rendering as observer.
