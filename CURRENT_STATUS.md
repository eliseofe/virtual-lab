# Virtual Lab — Current Status

Updated: 19 September 2026

This file answers **where the project is now**. Development procedure lives in `DEVELOPMENT_WORKFLOW.md`; longer-term direction lives in `ROADMAP.md`; detailed technical/scientific contracts live in `docs/`.

## Current position

Virtual Lab is back in normal operations after the 17 September closed-loop recovery.

The frontend architecture migration to **Vite + React + TypeScript + Mantine** is complete. The current visual system is an accepted clean, functional baseline, not a permanently finished UI/UX endpoint.

The student self-registration and Getting started work is complete and production-verified. At least one real student has successfully registered, confirmed the account and signed in. The production Lab provides one normal student journey with self-registration/sign-in, Getting started/Help, and Grok/Claude connector guidance.

OAuth authorization for AI clients is hosted inside the production Virtual Lab artifact at `/oauth/consent/` and shares the normal Lab browser session. The former standalone mock-sim site is historical infrastructure and is not part of the active product path once Supabase Auth points at the production Lab authorization route.

The approved **#45 — Access, sharing, curation and Showcase** research-collaboration scope is complete through #287–#290 and is now a completed baseline. Professor accounts have automatic read-only supervision access to student/researcher Experiments; readable non-owned Experiments can be copied into an independent owned workspace; explicit ordinary sharing is read-only and revocable; student-to-student sharing is available for collaboration while redundant student-to-Professor sharing is excluded because Professor supervision already provides that access; Showcase remains a separate explicit curator action.

Research-AI Lab discovery is now scientifically neutral by default. A no-ID `read_workspace` returns the complete formal authoring/runtime contract plus the global canonical capability registry; it does not automatically inject Experiment summaries or historical capability-request discourse. Experiment discovery remains available only through explicit `include_workspace_index=true` and stays governed by the authenticated user's existing RLS permissions; explicit Experiment reads remain RLS-governed.

The latest bounded **#273 — UI/UX refinement and visual polish from real use** pass is **#299 — Experiment navigation and Professor supervision UX**. Professor-supervised work now belongs to the Experiment library as a first-class read-only **Supervised** context alongside My experiments and Shared with me. The separate Student-experiments launcher/modal is removed from Professor/Account utilities. #273 remains a living evidence-driven domain and returns dormant after this bounded pass.


The Professor capability-request system is a **living operational queue** under #58, not a completed one-shot epic. #348 establishes a clean-slate production baseline: the two historical aggregation requests for controller stochasticity/RNG and heterogeneous agent initialization/state are retired rather than migrated, and the old implemented scalar request row is retired as capability truth. The queue therefore has no nonterminal legacy request at this cutover. This does **not** implement RNG or heterogeneous state; fresh scientific acceptance may rediscover and resubmit genuinely missing requirements through the new typed workflow. The scalar Environment capability remains implemented and represented in the canonical registry independently of request history.

The aggregation case exposed both capability-flow defects and a scientific-context problem. #310–#312, #323/#324, diagnostic #327 and protocol-visibility repair #328 are complete. The fresh-chat follow-up then showed that exposing raw historical request context can feed a later research AI its own earlier scientific reasoning. Cleanup epic #330 remains active before acceptance resumes. #331 audited the full research-AI-visible surface; #332 froze the minimal scientific boundary; #333 and #334 are historical transition steps. Canonical-capability transition epic #343 is complete through #344–#348: the six-class requirement taxonomy is frozen; Supabase has the independent 11-capability canonical registry with normalized publication provenance; typed request/closure workflow and static authoring bindings are deployed; diagnostics separate semantic, language, runtime/configuration, security-boundary and ordinary validation failures; and #348 cuts neutral MCP discovery over to the independent registry while retiring the three legacy request rows and obsolete request-derived canonical metadata/RPC. #335 production re-audit is next, followed by #336 fresh-chat scientific acceptance; #325/#326 remain paused behind that cleanup chain.

A new **#301 — Virtual Lab security, identity and authorization** umbrella is logged from real-student evidence. Its audit child **#302** is defined but not started; no enrollment, role, OAuth/client-admission or other remediation policy has been frozen.

## Immediate frontier

1. **#58 capability-flow repair is active through #330 scientific-neutrality cleanup.** Canonical-capability transition #343 is complete through #348. The production capability authority is now the independent 11-capability registry with publication provenance; legacy aggregation request state is retired. #335 read-only fresh-session production audit is next, followed by #336 fresh-chat scientific acceptance. #325/#326 and any scientific capability implementation remain paused until this chain is green.
2. **#273 UI/UX** has no active child and is dormant/living after production-verified #299.
3. **#302 — security audit** is separately queued under new epic #301 but has not started.
4. Studies and other parked/not-started lanes remain separately gated.

Do not invent a maintenance phase, a second Lab, another broad redesign, a duplicate collaboration mechanism, or an automatic successor to the completed #45 scope.

## Explicit gates and parked work

**Studies are not authorized yet.** Student onboarding, real student use, elapsed time, issue state or apparent technical readiness do not activate Studies. Only a later explicit owner instruction does.

Other parked/gated work includes:
- #285 Research submission snapshots — foundation exists, but there is no current distinct research use case; do not implement a submission workflow until the owner identifies one that is not already served by supervision visibility, sharing, copying or Showcase;
- deterministic RNG service implementation — requires explicit owner authorization;
- optional executable artifact dispatch — requires a concrete approved use case;
- numerical-integrator evaluation — requires owner scientific/numerical activation;
- native/HPC, richer physics/heterogeneous swarms, living environment/performance/validation umbrellas — future/on-demand.

## Production pointers

- Production Lab: https://eliseofe.github.io/virtual-lab/
- AI authorization UI: https://eliseofe.github.io/virtual-lab/oauth/consent/
- Hosting: GitHub Pages.
- Frontend: Vite + React + TypeScript + Mantine.
- Scientific/runtime authority: Rust/WASM kernel plus worker/runtime/compiler modules.
- Registry/Auth/MCP backend: Supabase.
- Production MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics; empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.

## Accepted storage direction

- Experiment = one runnable single-run scientific definition.
- Study = one named reproducible multi-run investigation, initially pinned to one exact Experiment revision.
- Standalone metric files live under `<Experiment>/runs/`.
- Study metric files live directly under `<Experiment>/studies/<Study>/`.
- There is no extra `runs/` directory inside a Study and no directory per simulation run.
- Raw scientific output remains local-first.

Scientific invariants and owner-authorized scientific definitions are maintained in `docs/SCIENTIFIC_CONTRACT.md` and the relevant technical contract documents, not duplicated here.

For the strategic map of major epics and whether they are unfinished, living, waiting for a use case, or not started, see `ROADMAP.md`.
