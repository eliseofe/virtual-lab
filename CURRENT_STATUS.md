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

As verified in production on 22 September 2026:

1. `0971db0e-015a-4f1f-b640-8cc6b428fdb7` — **approved / Professor accepted** — `observation.target_relative_position` — Experiment-defined target observable by Controller and Metrics. It remains unavailable until the owner explicitly authorizes implementation.
2. `69a4e63a-b763-46db-93ba-ee4a4f29ad4d` — **requested / revise** — typed populations with independent role-filtered sensing. Professor guidance requires separating public population identity from what a controller is allowed to observe.
3. `532d318d-2a4c-4754-acbe-e2bbe819c1b0` — **requested / revise** — population lifecycle/events. Professor guidance requires a generic per-agent participation/lifecycle state rather than attacker/defender/capture-specific semantics.
4. `f76373f1-a919-45fb-94b3-ccfc0458a285` — **requested / revise** — population/outcome Metrics support. Professor guidance requires identifying only genuinely missing reusable primitive observables/state rather than adding a bespoke analysis capability.
5. `2f8e266f-f5ce-41f6-9678-a96b68754eea` — **requested / future** — bounded multirotor rigid-body 3-D backend. Valid long-term direction, intentionally outside the current implementation horizon.

Professor acceptance or approval is queue/design state only. It does **not** authorize implementation.

The implemented `initialization.per_agent_private_state_assignment` capability has its publication provenance restored in production, and there are currently **zero implemented canonical capabilities without publication provenance**. Historical issue #467 remained open only because one exact authenticated end-user `read_workspace` verification was not performed in that old turn; the repair itself was merged, deployed and database-verified. That stale verification residue is no longer treated as executable repair backlog.

## Capability-flow acceptance state

The scientific-neutrality/candidate-architecture acceptance chain remains intentionally unfinished, not forgotten:

- #330 remains the umbrella for the scientific-neutrality acceptance closeout.
- #336 / #371 are the current owner-driven black-box acceptance path. Earlier runs exposed real defects that were repaired; the final acceptance itself has not subsequently been rerun to green.
- #325 and #326 remain paused until that acceptance path is completed.
- Living epic #58 remains open independently because new capability requests can arrive at any time.

Do not infer that an open acceptance umbrella is an implementation task. It is owner-selected validation work.

## Living domains and immediate selectable work

- **#301 Security / identity / authorization** — living domain. Audit child #302 is defined and ready but not started. It is audit-only and does not silently change enrollment/OAuth/role policy.
- **#273 UI/UX refinement** — living domain, currently dormant after the completed Control Panel, responsive cleanup and unified Experiment Library work through #480.
- **#425 Refactoring / technical debt** — living domain, currently dormant after Active Elastic/Built-in de-specialization and the 22 September project-state/backlog reconciliation.
- **#56 Simulator performance** and **#65 World/environment capabilities** — living domains with no automatically active child.
- **#3 Studies** — still owner-gated. The earlier prerequisite work is complete, but Studies do not start until the owner explicitly activates that lane.
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
