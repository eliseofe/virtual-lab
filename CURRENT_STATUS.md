# Virtual Lab — Current Status

Updated: 20 September 2026

This file answers **where the project is now**. Development procedure lives in `DEVELOPMENT_WORKFLOW.md`; longer-term direction lives in `ROADMAP.md`; detailed technical/scientific contracts live in `docs/`.

## Current position

Virtual Lab is back in normal operations after the 17 September closed-loop recovery.

The frontend architecture migration to **Vite + React + TypeScript + Mantine** is complete. The current visual system is an accepted clean, functional baseline, not a permanently finished UI/UX endpoint.

The student self-registration and Getting started work is complete and production-verified. At least one real student has successfully registered, confirmed the account and signed in. The production Lab provides one normal student journey with self-registration/sign-in, Getting started/Help, and Grok/Claude connector guidance.

OAuth authorization for AI clients is hosted inside the production Virtual Lab artifact at `/oauth/consent/` and shares the normal Lab browser session. The former standalone mock-sim site is historical infrastructure and is not part of the active product path once Supabase Auth points at the production Lab authorization route.

The approved **#45 — Access, sharing, curation and Showcase** research-collaboration scope is complete through #287–#290 and is now a completed baseline. Professor accounts have automatic read-only supervision access to student/researcher Experiments; readable non-owned Experiments can be copied into an independent owned workspace; explicit ordinary sharing is read-only and revocable; student-to-student sharing is available for collaboration while redundant student-to-Professor sharing is excluded because Professor supervision already provides that access; Showcase remains a separate explicit curator action.

Research-AI Lab discovery is now scientifically neutral by default. A no-ID `read_workspace` returns the complete formal authoring/runtime contract plus the global canonical capability registry; it does not automatically inject Experiment summaries or historical capability-request discourse. Experiment discovery remains available only through explicit `include_workspace_index=true` and stays governed by the authenticated user's existing RLS permissions; explicit Experiment reads remain RLS-governed.

The bounded **#392 — Experiment revision time and actor provenance**, **#394 — Human identity**, and owner-authorized **#396 — Experiment working copy and navigable revision history** passes are complete. Numbered revisions are retained immutable snapshots; human edits autosave into one unnumbered Working copy; explicit **Save Revision** crystallizes the next chronological revision; revision history is navigable from the Experiment header with All/Mine/AI filtering; and newer AI revisions remain visible without replacing or destroying human work. The evidence-driven **#409** follow-up under living UI/UX lane #273 makes reopening an Experiment land on its newest numbered revision while preserving any Working copy for explicit recovery, and adds an explicit owner-only **Discard Working copy** action.


The Professor capability-request system is a **living operational queue** under #58, not a completed one-shot epic. #348 establishes a clean-slate production baseline: the two historical aggregation requests for controller stochasticity/RNG and heterogeneous agent initialization/state are retired rather than migrated, and the old implemented scalar request row is retired as capability truth. The queue therefore has no nonterminal legacy request at this cutover. This does **not** implement RNG or heterogeneous state; fresh scientific acceptance may rediscover and resubmit genuinely missing requirements through the new typed workflow. The scalar Environment capability remains implemented and represented in the canonical registry independently of request history.

The aggregation case exposed both capability-flow defects and a scientific-context problem. #310–#312, #323/#324/#327/#328, the canonical-capability transition #343–#348, #354 and the #335 production re-audit are complete. The fresh scientific-acceptance follow-up produced #359–#362 and the exact connector cutover #367. The subsequent two-paper acceptance exposed duplicate request creation across overlapping papers. #376 reset that failed acceptance state; #375–#373 completed the candidate architecture and Professor generalization repair. #371 then exposed #380, now complete: the JavaScript/MCP authoring wall and Rust runtime are aligned for the discovered IR-boundary defects. **#382 — Bare-bones scientific authoring language completeness** is complete through #383–#386. A fresh Constant Bearing retry after that cutover produced valid Grok and Claude Experiments; Claude then reached two genuinely semantic gaps for the informed-agent variant. The owner explicitly selected the generic heterogeneous-state gap for implementation. **#304 — generic per-agent initialization of Controller private scalar state is complete and production-green.** The separate experiment-defined target observation request remains requested and is not implementation-authorized. #325/#326 remain paused.

**#301 — Virtual Lab security, identity and authorization** is now explicitly classified as a **living / ongoing security domain**. Its audit child **#302** remains defined but not started; no broader enrollment, OAuth/client-admission or security remediation policy has been frozen.

**#425 — Refactoring and technical-debt reduction** is now a **living / ongoing maintenance domain**. It is currently dormant and has no authorized child; it exists as the durable home for evidence-driven structural cleanup rather than as permission for cleanup churn.

The living **#273 — UI/UX refinement** lane is active for implementation of the accepted Product Design direction. Recovery #423 is complete; Product Design #424 produced three directions; #428 froze the final design as a **task-based Experiment management panel** with compact placement for frequent actions. **#429** is the current implementation ticket: simplify the global ribbon and build the shared Experiment control panel. Its known successor is **#430**, which integrates the final Professor-only Showcase and Capability requests section and completes this activation.

## Immediate frontier

1. **#273 UI/UX is actively implementing the accepted design.** #429 is current: global ribbon + shared task-based Experiment control panel. If production-green, known successor #430 adds the final Professor-only integration and completes this activation.
2. **#58 capability-flow remains operationally active.** The heterogeneous-state request `2616dbb5-2134-417f-aebb-2e9e4ea0dd9c` is implemented through #304. The separate target-observation request `0971db0e-015a-4f1f-b640-8cc6b428fdb7` remains requested and unavailable. #371 has not restarted.
3. **#301 Security** is a living maintenance domain; #302 remains queued and not started.
4. **#425 Refactoring** is a living maintenance domain and currently dormant with no authorized child.
5. Studies and other parked/not-started lanes remain separately gated.

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
