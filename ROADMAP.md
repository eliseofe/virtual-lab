# Virtual Lab — Roadmap

This file answers **where the project is going**. Current status lives in `CURRENT_STATUS.md`; development procedure lives in `DEVELOPMENT_WORKFLOW.md`.

## Strategic posture

The deployed baseline already includes:
- browser Rust/WASM scientific execution;
- constrained Python-like Configuration, Initialization, Controller and Metrics authoring;
- authenticated Supabase Experiment Registry and provider-independent MCP authoring;
- explicit Professor capability requests for unsupported simulator capabilities;
- live multi-metric Results;
- local-first result persistence and whole-Experiment export;
- Vite + React + TypeScript + Mantine presentation;
- student self-registration/onboarding;
- research-supervision collaboration: Professor read-only oversight, independent copy/fork, explicit read-only sharing and revocation;
- Showcase publication/curation surfaces.

These are baseline architecture, not future roadmap items.

## Roadmap state classification

- **Completed baseline:** #45 Access / sharing / curation / Showcase — the approved research-supervision collaboration scope is complete through Professor oversight, copy-to-own-workspace, explicit read-only sharing/revocation and separate Showcase curation.
- **Living / ongoing domains:** #56 Simulator performance, #65 World/environment capabilities, #273 UI/UX refinement, **#58 Professor capability-request queue/lifecycle**. #58 is operationally living even when its infrastructure is complete because new Grok/Professor capability requests can arrive at any time. Its current nonterminal queue contains two `approved` requests awaiting explicit owner implementation authorization: RNG/controller stochasticity (#57) and heterogeneous agent initialization/state (#304).
- **Foundation built, waiting for a use case:** #124 Artifact capability registry / lifecycle hooks — the architectural seam exists; continue only when a concrete optional executable-artifact use case requires runtime dispatch. #285 Research submission snapshots — preservation infrastructure exists, but no distinct research use case currently justifies a submission workflow; do not implement one until the owner identifies a non-overlapping need.
- **Not started major lanes:** #3 Studies, #202 Code authoring ergonomics, #6 Study results → AI handoff, #119 Research Notes / Research Documents, #301 Security / identity / authorization — initial audit #302 is defined and queued, but no audit execution or remediation policy has started.

The AI maintains this classification as the project evolves: every major epic belongs in exactly one category, and the category should change when its real execution state changes. When creating or reclassifying an epic, state the classification to the owner so it is visible and can be corrected; routine classification maintenance does not require owner approval.

### Capability-request queue invariant

For living epic #58, GitHub issue closure is never evidence that the capability backlog is empty. The authoritative operational backlog is Supabase `capability_requests`. Any project recovery, roadmap review, or “what work remains?” assessment must surface every nonterminal request in `requested`, `approved`, or `in_progress` status. Professor approval does not itself authorize implementation; approved requests remain visible backlog until explicitly declined, implemented, or otherwise resolved by owner-authorized policy.

## Near term

1. Repair #58's capability-request closed loop through #313 before implementing queued scientific capabilities. #310–#312 and #323/#324/#327/#328 are complete. Cleanup epic #330 remains the active gate. The inserted #343 canonical-capability transition has #344 inventory/classification, #345 canonical registry/provenance and #346 typed request/closure refactor are complete; #347 authoring-contract/diagnostic ownership is next, followed by #348 production cutover, #335 fresh-session audit and #336 fresh-chat scientific acceptance. #325/#326 remain paused until this chain finishes.
2. Keep the two existing approved capability requests visible but paused for implementation: RNG/controller stochasticity (#57 with planned #305/#306) and heterogeneous initialization/state (#304).
3. Continue real student and owner use; #273 is dormant after the production-verified Experiment-navigation/supervision pass.
4. Keep #301/#302 security audit work explicitly queued but not started; select it only in a later owner turn.
5. Turn concrete evidence from use into focused fixes; do not activate Studies or other parked/not-started major lanes without the required owner authorization/use case.

## Owner-gated major lane: Studies

Studies are the intended multi-run layer, but they are **not active work until the owner explicitly authorizes them**.

When activated, Study capabilities are expected to grow in bounded slices such as:
- durable Study identity under an originating Experiment;
- pinning to exact Experiment revision(s);
- conditions/parameter sweeps and repetitions/seeds;
- local parallel/headless execution where useful;
- reuse of stable Experiment metric IDs and the existing flat local result-file contract;
- aggregation/statistics and cross-run plots;
- checkpoint/resume semantics where explicitly designed;
- selected Study-result handoff to an authorized research AI.

Study output remains Experiment-first and local-first, directly under `<Experiment>/studies/<Study>/` without an extra `runs/` layer.

## Later analysis and publication layer

Potential later layers include:
- reproducible downstream analysis/figure specifications;
- publication-quality SVG/PDF/PNG generation;
- structured Research Notes;
- Research Documents for papers/reports/thesis chapters;
- selected compact results/plots shared with an authorized research AI;
- research synthesis that does not depend on recovering an old chat transcript.

Live single-run Results should remain an interactive scientific inspection surface rather than becoming a general graphics editor.

## Future execution and science

Potential later capabilities include:
- native workstation execution preserving the same scientific contracts;
- institutional HPC/Slurm adapters;
- richer physics and robot-specific models;
- heterogeneous populations/controllers after explicit capability approval;
- richer observation/action/environment models;
- additional benchmark tasks and scientific modules;
- deeper multi-user collaboration and curated/public research workflows.

## Standing product direction

- preserve the €0 incremental-cost baseline unless the owner explicitly approves otherwise;
- keep simulation compute and raw scientific data local-first by default;
- keep research-AI Experiment access separate from trusted simulator/repository development;
- preserve provider independence and replaceable infrastructure adapters;
- preserve stable versioned scientific/domain contracts as implementation technology evolves.
