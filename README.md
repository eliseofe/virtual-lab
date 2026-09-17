# Virtual Lab

Virtual Lab is a zero-cost, browser-first scientific laboratory for reproducible experiments on self-organized multi-agent systems. Researchers and authorized AI assistants can define versioned Experiments, run them on local compute, inspect live metrics, persist raw results locally and request explicit simulator capabilities without coupling the scientific system to one AI provider.

Production: https://eliseofe.github.io/virtual-lab/

## Deployed baseline

The production system includes:
- Rust/WASM scientific execution in a Web Worker;
- constrained Python-like Configuration, Initialization, Controller and Metrics authoring;
- Supabase-backed authenticated Experiment Registry and provider-independent MCP authoring;
- Professor capability requests for unsupported simulator capabilities;
- live multi-metric Results and local-first raw-result persistence;
- Showcase curation/publication;
- Vite + React + TypeScript + Mantine presentation;
- student self-registration/sign-in and Getting started/Help;
- Grok and Claude connector onboarding.

A runnable Experiment has four compulsory artifacts: Configuration, Initialization, Controller and Metrics. Metrics may be empty. Results presentation/layout state is separate from scientific Experiment revision state.

## Core invariants

- €0 incremental infrastructure cost is the baseline;
- simulation compute and raw scientific results remain local-first;
- research-AI Experiment authoring is separate from trusted simulator/repository development;
- controller input is local observation and output is action; controller private state is encapsulated;
- simulator owns world state, RNG, perception, action application and physics;
- global position is not a controller observation unless explicitly owner-approved;
- physics, control, rendering, metrics and persistence remain separable scheduling concerns;
- implementation agents do not invent paper-specific science.

## Repository map

- `AGENTS.md` — entry point for development agents.
- `DEVELOPMENT_WORKFLOW.md` — authoritative development procedure.
- `CURRENT_STATUS.md` — current project position and explicit gates.
- `ROADMAP.md` — longer-term direction.
- `CONTRIBUTING.md` — contribution standards.
- `docs/` — detailed architecture, scientific, authoring, deployment and domain reference documentation.
- `docs/archive/` — historical evidence that is not current authority.

Studies are an owner-gated future lane; consult `CURRENT_STATUS.md` for the current activation state.
