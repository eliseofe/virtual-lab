# Virtual Lab — Current Status

Updated: 22 September 2026

This file answers **where the project is now**. Development procedure lives in `DEVELOPMENT_WORKFLOW.md`; longer-term direction lives in `ROADMAP.md`; scientific/technical contracts live in `docs/`.

## Current product baseline

Virtual Lab is in normal production operation at https://eliseofe.github.io/virtual-lab/.

The deployed baseline includes:

- browser Rust/WASM scientific execution;
- constrained Configuration, Initialization, Controller and Metrics authoring;
- Vite + React + TypeScript + Mantine presentation;
- authenticated Supabase Experiment Registry and provider-independent MCP authoring;
- student self-registration/sign-in and Getting started/Help;
- Professor supervision, explicit read-only sharing, independent copy-to-workspace, collections and Showcase curation;
- numbered immutable Experiment revisions plus one autosaved unnumbered Working copy and explicit **Save Revision**;
- one unified Experiment Library with **Showcase · Mine · Shared · Supervised**, collection-aware navigation and no user-facing Built-in category;
- generic catalog/Showcase execution with Active Elastic retained only as ordinary canonical scientific content;
- scientific-code editor ergonomics across all four authored artifacts: highlighting, line numbers, folding/search, parser-derived navigation, source-linked compiler diagnostics and constrained contract-derived completion;
- live multi-metric Results, local-first result persistence and whole-Experiment export.

The accepted top-level workspace hierarchy is **Control Panel · Simulation · Experiment Authoring**. Help and Account remain utilities. The current responsive baseline is verified across phone, wider/foldable mobile, ordinary desktop and ultra-wide desktop.

## Research-AI / capability system

Research-AI Lab discovery is scientifically neutral by default. A no-ID `read_workspace` exposes the formal authoring/runtime contract plus implemented/candidate capability surfaces without automatically injecting arbitrary Experiment history. Explicit workspace indexing and Experiment reads remain authenticated and RLS-governed.

The capability-request pipeline under living epic #58 is operational. The authoritative backlog is the production Supabase `capability_requests` table, not GitHub issue state.

### Current nonterminal capability queue

As verified in production on 22 September 2026, four requests are nonterminal:

1. `69a4e63a-b763-46db-93ba-ee4a4f29ad4d` — **requested / Professor decision pending** — population identity with explicitly enabled local population recognition.
2. `532d318d-2a4c-4754-acbe-e2bbe819c1b0` — **requested / Professor decision pending** — per-agent participation/lifecycle state with retained identity and outcome.
3. `f76373f1-a919-45fb-94b3-ccfc0458a285` — **requested / Professor decision pending** — remaining Metrics/observation primitive, currently represented in production as read-only measured planar velocity.
4. `2f8e266f-f5ce-41f6-9678-a96b68754eea` — **requested / future** — bounded multirotor rigid-body 3-D backend. Valid long-term direction, intentionally outside the current implementation horizon.

The accepted named world-reference capability is implemented and no longer belongs in the nonterminal queue. The first three rows above are the current Professor-decision set; the 3-D request is intentionally parked future work.

Professor acceptance or approval is queue/design state only. It does **not** authorize implementation.

The implemented `initialization.per_agent_private_state_assignment` capability has its publication provenance restored in production, and there are currently **zero implemented canonical capabilities without publication provenance**. Historical issue #467 remained open only because one exact authenticated end-user `read_workspace` verification was not performed in that old turn; the repair itself was merged, deployed and database-verified. That stale verification residue is no longer treated as executable repair backlog.

## Capability-flow acceptance state

The scientific-neutrality/candidate-architecture acceptance history is retained as a **dormant recurring validation lane**, not as a standing blocker:

- the deployed MCP/research-AI flow is currently usable;
- #330 remains the umbrella for this validation history;
- #336 / #371 can be reactivated for a fresh black-box check when useful or when new evidence warrants it;
- #325 and #326 remain paused behind that validation chain, but their pause blocks no unrelated roadmap work;
- Living epic #58 remains open independently because new capability requests can arrive at any time.

Do not report this dormant validation lane as work blocked by the owner merely because a fresh rerun has not been scheduled.

## Living domains and immediate selectable work

- **#501 Static named world references** — completed through #502–#504. The static reference state, per-agent selective local sensing, finite/unlimited range, Controller observation and read-only Metrics access are deployed; dynamic reference motion and optional executable-artifact dispatch remain separate future work.
- **#301 Security / identity / authorization** — living domain. Audit child #302 is defined and ready but not started. It is audit-only and does not silently change enrollment/OAuth/role policy.
- **#273 UI/UX refinement** — living domain, currently dormant after the completed Control Panel, responsive cleanup and unified Experiment Library work through #480.
- **#425 Refactoring / technical debt** — living domain, active again from 24 September under the owner-approved plan in `docs/REFACTORING_AUDIT_2026-09-24.md`, executed one ticket at a time by Claude: #532 behaviour-preservation safety net, #533 reliable release loop, #535 proposal-first merging, #537 simulator core tidy-up, #541 shared database connection and #543 styles out of JavaScript, #545 revision behaviour tests, #547 Library behaviour tests, #551 Professor inbox behaviour tests and #552 Showcase curation behaviour tests (production-verified), then #554 splitting the Experiment registry module into five tested parts (production-verified), and the owner-approved four-stage model-view-controller restoration: #560 runtime model (stage 1) and #562 simulation controller (stage 2), both production-verified; #564 results and authoring panels (stage 3, in progress: results panel first, then the authoring panel), then retiring the duplicate legacy view (stage 4).
- **#56 Simulator performance** and **#65 World/environment capabilities** — living domains with no automatically active child.
- **#3 Studies** — technically ready and selectable. The earlier prerequisite work is complete; choosing Studies is a prioritization decision, not resolution of a blocker.
- **#124 optional executable artifact dispatch** — foundation exists; runtime dispatch waits for a concrete owner-approved use case.
- **#102 numerics**, native/HPC, richer physics and other future science remain parked/on-demand.

There is no automatic “next ticket” merely because an issue is open.

## Backlog hygiene

Open GitHub issues fall into one of three legitimate classes:

- living/ongoing domains;
- explicitly parked/gated/future work;
- a bounded currently selected task or acceptance.

Historical residue that no longer represents any of those should be closed rather than left to masquerade as current backlog. The 22 September reconciliation closes the obsolete #427 design-handoff residue and #467 historical verification residue without pretending that unperformed historical checks occurred.

## Production pointers

- Production Lab: https://eliseofe.github.io/virtual-lab/
- AI authorization UI: https://eliseofe.github.io/virtual-lab/oauth/consent/
- Hosting: GitHub Pages
- Registry/Auth/MCP backend: Supabase
- Production MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics
- Empty Metrics is valid
- Results presentation state is separate from scientific Experiment revision state

## Accepted storage direction

- Experiment = one runnable single-run scientific definition.
- Study = one named reproducible multi-run investigation, initially pinned to one exact Experiment revision.
- Standalone metric files live under `<Experiment>/runs/`.
- Study metric files live directly under `<Experiment>/studies/<Study>/`.
- There is no extra `runs/` directory inside a Study and no directory per simulation run.
- Raw scientific output remains local-first.

Scientific invariants and owner-authorized scientific definitions live in `docs/SCIENTIFIC_CONTRACT.md` and the relevant technical contract documents, not here.
