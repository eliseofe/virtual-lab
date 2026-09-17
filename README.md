# Virtual Lab

Virtual Lab is a zero-cost, browser-first scientific laboratory for reproducible experiments on self-organized multi-agent systems. Researchers and authorized AI assistants can define versioned Experiments, run them on local compute, inspect live metrics, persist raw results locally and request explicit simulator capabilities without coupling the scientific system to one AI provider.

Production: https://eliseofe.github.io/virtual-lab/

## Current state — 17 September 2026

The deployed system includes:
- Rust/WASM scientific kernel in a Web Worker;
- constrained Python-like Configuration, Initialization, Controller and Metrics authoring;
- Supabase-backed authenticated Experiment Registry and provider-independent MCP authoring;
- Professor capability-request workflow;
- live multi-metric Results;
- local-first raw result persistence;
- Showcase curation/publication;
- Vite + React + TypeScript + Mantine application presentation;
- self-registration/sign-in for students;
- in-Lab Getting started / Help;
- Grok and Claude production connector onboarding.

The frontend/visual migration and the student-onboarding mini-epic are complete. The current phase is **real student use and real scientific use**, with bounded fixes driven by concrete feedback. Ongoing UI/UX refinement lives in the evidence-driven #273 lane rather than blocking science/product work.

**Studies are not authorized yet.** They remain gated by a later explicit owner decision after more real use.

See `CURRENT.md` for the exact current checkpoint and next action.

## Hard invariants

- zero incremental monetary cost remains the baseline;
- simulation compute and raw scientific results remain local-first;
- research-AI Experiment authoring is separate from trusted simulator/repository development;
- controller receives local observation, owns private state and returns action; simulator owns world state, RNG, perception, action application and physics;
- global position is not a controller observation unless explicitly owner-approved;
- physics, control, rendering, metrics and persistence are separate scheduling concerns;
- researcher-facing source is compiled before execution; no per-agent/per-step host Python interpreter boundary;
- implementation agents do not invent paper-specific science.

## Canonical Experiment model

A runnable Experiment has four compulsory artifacts:
1. Configuration
2. Initialization
3. Controller
4. Metrics

Metrics may be empty. Results presentation/layout state is separate from scientific Experiment revision state.

## Start here

For a new implementation session:
1. read `CURRENT.md`;
2. read the active issue if a bounded repair/feature has been authorized;
3. read only the technical/design files needed for that issue.

`PROJECT_CONTROL.md` and `PROJECT_STATE.md` are deeper references, not mandatory startup reading. Closed issues and Git history are historical evidence.
