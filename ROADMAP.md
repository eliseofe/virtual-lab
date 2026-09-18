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
- Showcase publication/curation surfaces.

These are baseline architecture, not future roadmap items.

## Roadmap state classification

- **Started and unfinished:** #45 Access / sharing / curation / Showcase — active research-supervision work now focuses on Professor read-only visibility into student/researcher Experiments, copy-to-own-workspace, explicit read-only sharing and revocation; Showcase remains a separate curator action.
- **Living / ongoing domains:** #56 Simulator performance, #65 World/environment capabilities, #273 UI/UX refinement — completed slices accumulate as evidence or new capability requests appear; the open parent does not mean abandoned unfinished work.
- **Foundation built, waiting for a use case:** #124 Artifact capability registry / lifecycle hooks — the architectural seam exists; continue only when a concrete optional executable-artifact use case requires runtime dispatch. #285 Research submission snapshots — preservation infrastructure exists, but no distinct research use case currently justifies a submission workflow; do not implement one until the owner identifies a non-overlapping need.
- **Not started major lanes:** #3 Studies, #202 Code authoring ergonomics, #6 Study results → AI handoff, #119 Research Notes / Research Documents.

The AI maintains this classification as the project evolves: every major epic belongs in exactly one category, and the category should change when its real execution state changes. When creating or reclassifying an epic, state the classification to the owner so it is visible and can be corrected; routine classification maintenance does not require owner approval.

## Near term

1. Continue #45 through bounded research-supervision collaboration slices. Professor read-only visibility is production-complete (#287); next is copy-to-own-workspace (#288), followed by explicit sharing (#289) and revocation/boundary completion (#290).
2. Continue real student and owner use of the production Lab.
3. Turn concrete evidence from use into focused fixes, including #273 UI/UX refinement when warranted.
4. Do not activate parked or not-started major lanes without the required use case or owner authorization.

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
