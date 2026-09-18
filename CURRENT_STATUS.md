# Virtual Lab — Current Status

Updated: 18 September 2026

This file answers **where the project is now**. Development procedure lives in `DEVELOPMENT_WORKFLOW.md`; longer-term direction lives in `ROADMAP.md`; detailed technical/scientific contracts live in `docs/`.

## Current position

Virtual Lab is back in normal operations after the 17 September closed-loop recovery.

The frontend architecture migration to **Vite + React + TypeScript + Mantine** is complete. The current visual system is an accepted clean, functional baseline, not a permanently finished UI/UX endpoint.

The student self-registration and Getting started work is complete and production-verified. At least one real student has successfully registered, confirmed the account and signed in. The production Lab provides one normal student journey with self-registration/sign-in, Getting started/Help, and Grok/Claude connector guidance.

OAuth authorization for AI clients is hosted inside the production Virtual Lab artifact at `/oauth/consent/` and shares the normal Lab browser session. The former standalone mock-sim site is historical infrastructure and is not part of the active product path once Supabase Auth points at the production Lab authorization route.

The approved **#45 — Access, sharing, curation and Showcase** research-collaboration scope is complete through #287–#290 and is now a completed baseline. Professor accounts have automatic read-only supervision access to student/researcher Experiments; readable non-owned Experiments can be copied into an independent owned workspace; explicit ordinary sharing is read-only and revocable; student-to-student sharing is available for collaboration while redundant student-to-Professor sharing is excluded because Professor supervision already provides that access; Showcase remains a separate explicit curator action.

Research-AI Lab discovery is now scientifically neutral by default. A no-ID `read_workspace` returns the complete formal authoring/runtime contract plus the global canonical capability registry; it does not automatically inject Experiment summaries or historical capability-request discourse. Experiment discovery remains available only through explicit `include_workspace_index=true` and stays governed by the authenticated user's existing RLS permissions; explicit Experiment reads remain RLS-governed.

The latest bounded **#273 — UI/UX refinement and visual polish from real use** pass is **#299 — Experiment navigation and Professor supervision UX**. Professor-supervised work now belongs to the Experiment library as a first-class read-only **Supervised** context alongside My experiments and Shared with me. The separate Student-experiments launcher/modal is removed from Professor/Account utilities. #273 remains a living evidence-driven domain and returns dormant after this bounded pass.


The Professor capability-request system is a **living operational queue** under #58, not a completed one-shot epic. Supabase currently contains two Professor-approved requests awaiting explicit owner implementation authorization:
- controller stochasticity / RNG distributions — request `7492c39d-fdd0-4f29-9661-63dbc6461bf5`, architecture candidate #57;
- heterogeneous agent initialization/state — request `49368c8e-dff7-4ce0-9072-bc3f4b37ada2`, architecture candidate #304.

Neither request is `in_progress`; Professor approval places them in the developer design/queue only. The previously approved scalar-environment request is already implemented through #143/#144.

The aggregation case exposed both capability-flow defects and a scientific-context problem. #310–#312, #323/#324, diagnostic #327 and protocol-visibility repair #328 are complete. The fresh-chat follow-up then showed that exposing raw historical request context can feed a later research AI its own earlier scientific reasoning. Cleanup epic #330 is therefore active before acceptance resumes. #331 audited the full research-AI-visible surface; #332 froze the minimal scientific boundary; #333 and #334 are complete and production-verified. Owner review then identified the historically contingent split between request rows, capability truth and the authoring contract, so transition epic #343 was inserted before scientific acceptance. #344 froze the canonical six-class requirement taxonomy and the 11 implemented semantic capabilities. #345 is complete and production-verified: Supabase has an independent canonical capability registry with the 11 implemented capabilities plus normalized many-to-many publication provenance. #346 and #347 are complete: the research-AI request/closure path uses stable typed extension identity across all six owner-approved request classes, and the authoring contract now references the 11 implemented canonical capability UUIDs/keys through static bindings rather than maintaining a parallel semantic capability model. Validation separates semantic-capability, authoring-language, runtime/configuration, forbidden/security-boundary and ordinary type/validation diagnostics. The legacy request rows remain intact for final cutover. #348 production cutover/legacy retirement is next; #335/#336 and #325/#326 remain blocked behind the transition.

A new **#301 — Virtual Lab security, identity and authorization** umbrella is logged from real-student evidence. Its audit child **#302** is defined but not started; no enrollment, role, OAuth/client-admission or other remediation policy has been frozen.

## Immediate frontier

1. **#58 capability-flow repair is active through #330 scientific-neutrality cleanup and #343 capability-architecture transition.** #331–#334 and #344–#345 are complete and production-verified where applicable. The new canonical registry now contains the 11 frozen implemented semantic capabilities with publication provenance, independently of legacy request rows. #346 request/closure workflow refactor and #347 contract/diagnostic ownership are complete; #348 production cutover/legacy retirement is next, followed by #335 audit and #336 fresh-chat scientific acceptance. #325/#326 and capability implementation (#305/#306 RNG and #304 heterogeneous initialization/state) remain paused until this chain is green.
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
