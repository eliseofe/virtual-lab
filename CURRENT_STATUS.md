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

The aggregation case exposed both capability-flow defects and a scientific-context problem. #310–#312, #323/#324/#327/#328, the canonical-capability transition #343–#348, #354 and the #335 production re-audit are complete. The fresh scientific-acceptance follow-up then produced the bounded #359–#362 repair sequence. #362 restored the clean production baseline; #361 is complete and production-green with pre-triage request reuse and science-oriented request identity; #360 is complete with one durable unsupported-science closure path shared by Student and Professor research AI. #359 makes the Professor extension inbox compact and science-oriented while keeping linked evidence and engineering details available on demand. The next bounded ticket is #367, an exact research-AI connector-surface cutover that removes obsolete compatibility residue and verifies the final tool set before fresh-chat acceptance #336 resumes. #325/#326 and scientific capability implementation remain paused until that acceptance chain is green.

A new **#301 — Virtual Lab security, identity and authorization** umbrella is logged from real-student evidence. Its audit child **#302** is defined but not started; no enrollment, role, OAuth/client-admission or other remediation policy has been frozen.

## Immediate frontier

1. **#58 capability-flow repair remains active through fresh scientific acceptance.** #362 reset the acceptance artifacts; #361 and #360 are production-green; #359 completes the Professor inbox presentation cleanup without changing request semantics. #367 is next and will verify/cut over to exactly the current research-AI connector/tool surface before #336 fresh-chat scientific acceptance resumes. #325/#326 and scientific capability implementation remain paused until that chain is green.
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
