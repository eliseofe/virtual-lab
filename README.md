# Virtual Lab

A zero-cost, browser-first scientific laboratory for reproducible experiments on self-organized multi-agent systems. Human researchers and authorized AI research assistants can define versioned Experiments, run them locally, inspect live scientific metrics, preserve local results, and extend the simulator through explicit capability requests without coupling the scientific system to one AI provider or compute vendor.

## Current state — 16 September 2026

Virtual Lab is already a deployed working system, not the original Round 1 prototype plan.

Current production capabilities include:

- Rust/WebAssembly scientific kernel running locally in a Web Worker;
- constrained Python-like Configuration, Initialization, Controller and Metrics authoring;
- four compulsory Experiment artifacts with empty Metrics valid;
- authenticated Supabase Experiment Registry integrated with production Lab;
- authenticated provider-independent MCP Experiment authoring;
- Professor capability-request workflow for unsupported simulator needs;
- live co-located multi-metric Results with generic multi-series time-series panels;
- local-first flat metric-file persistence under a user-selected workspace root;
- whole-Experiment package export as a secondary convenience;
- fine-grained MCP creation/update/removal of Metrics and Results panel bindings.

The active frontier is **#201 / #195.6**, final end-to-end acceptance of the Metrics/Results path using the already owner-authorized Active Elastic polarization metric. It is not waiting for a new scientific formula.

Current production Lab:

`https://eliseofe.github.io/virtual-lab/`

## Vision

The long-term goal is a virtual research laboratory in which a PI, researcher, student or authorized AI research assistant can:

1. start from a scientific paper or original hypothesis;
2. express the scientific model as an explicit versioned Experiment;
3. inspect/edit familiar researcher-facing source;
4. run efficiently on researcher-owned compute;
5. observe scientifically defined Metrics during a run;
6. persist raw result data locally in ordinary files;
7. organize reproducible multi-run Studies and parameter campaigns;
8. compute/inspect aggregate results and reproducible figures;
9. exchange selected compact scientific outputs with authorized AI clients;
10. collaborate across independent human/AI identities;
11. optionally add native/HPC/institutional backends without changing Experiment semantics.

The project begins with collective-motion/swarm systems but keeps domain/compute/transport seams general.

## Hard invariants

- **Zero incremental monetary cost is the required baseline.** Current lightweight registry/Auth/MCP uses Supabase Free; simulation compute and raw scientific data remain local.
- **Compute is local by default.** Browser/WASM uses researcher-owned CPU.
- **Raw scientific results are local-first.** Browser-private storage and Supabase are not the canonical bulk archive.
- **AI-provider independence.** MCP/domain semantics are not tied to ChatGPT, Claude, Grok or another provider.
- **Experiment domain is separate from simulator development.** Research AI authoring has no GitHub, shell, deployment or simulator-source privileges.
- **Agent autonomy boundaries are scientific gatekeepers.** Controller receives local observation, owns private state and returns action; simulator owns world state, RNG, physics, perception and action application.
- **Global position is not a controller observation capability** unless explicitly owner-approved in the future.
- **Physics, control, rendering, metrics and persistence are separate scheduling concerns.** Rendering/storage cannot change scientific dynamics/sampling.
- **Researcher-facing source is compiled before execution.** No per-agent/per-step host Python interpreter boundary.
- **New paper-specific science is not invented by implementation agents.** Owner/research-AI scientific definitions are implemented as supplied; unsupported capabilities become explicit requests.

## Canonical Experiment model

A runnable Experiment currently has exactly four compulsory core artifacts:

1. Configuration
2. Initialization
3. Controller
4. Metrics

Metrics contains zero or more read-only scientific metric definitions. Results plot-panel layout is separate presentation/workspace state and therefore does not create a scientific Experiment revision.

Current canonical contracts include:

- registry: `vlab.registry-experiment/3`
- Experiment artifacts: `vlab.experiment-artifacts/3`
- authoring: `vlab.authoring/0.6`
- Metrics: `python-vlab-metrics/0.1`
- Results presentation: `vlab.results-presentation/1`

## Scientific execution boundary

Conceptually:

```text
action = agent.step(local_observation)
```

The simulator/environment owns global physical state, time/scheduling, neighbourhood queries, stochastic sampling, observations, action application and physics.

Metrics are different from controller perception: they are read-only measurement apparatus and may inspect only the versioned global snapshot fields exposed by the Metrics contract. Metric access never leaks into controller observations.

Visualization is observational only.

## Registry and AI authoring

The canonical remote Experiment Registry is currently Supabase-backed. Production Virtual Lab and authenticated AI clients operate over the same versioned Experiment domain.

AI-facing transport is the deployed Experiment MCP endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Current MCP server is `3.0.0`, interface `8`. It supports whole-Experiment authoring plus fine-grained Metrics/Results binding authoring. Professor users can create durable requests for unsupported capabilities.

GitHub is the trusted simulator repository/CI/deployment workflow, **not** the normal research-AI Experiment transport.

## Local result storage

Standalone metric output is deliberately simple and user-visible:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      polarization_000001.csv
      angular_momentum_000001.csv
      polarization_000002.csv
      ...
    studies/
      <Study>/
        runs/
          ...same flat run-file contract...
```

There is no directory per simulation run. Files with the same numeric suffix belong to the same run. Compact machine-managed bookkeeping stays outside ordinary `runs/`.

## Active Elastic scientific fixture

Active Elastic remains the first scientific validation/showcase model, based on work by Ferrante, Turgut, Dorigo and Huepe.

For the current Metrics/Results acceptance path, the owner has already authorized and accepted the deployed polarization metric:

`psi = ||sum_i heading_i|| / N`

sampled every `0.1 s` for Virtual Lab acceptance/display. That cadence is not claimed as the paper's analysis/output sampling cadence.

The built-in showcase also contains a separately owner-authorized normalized instantaneous angular-momentum/milling complement used to verify generic multi-metric presentation.

## Long-term research model

The durable conceptual layers are:

```text
Experiment    one-run scientific definition
Study         reproducible multi-run/condition investigation
Research Note structured scientific memory
Research Document paper/report/thesis narrative scope
```

Studies remain attached to/pinned against exact Experiment revision(s) and reuse stable Experiment metric IDs plus the local single-run storage contract.

## Start here

For any implementation session, read in this order:

1. `AGENTS.md`
2. `PROJECT_CONTROL.md`
3. `docs/EXECUTION_GRANULARITY.md`
4. `PROJECT_STATE.md`
5. the active issue and relevant current design document

`PROJECT_CONTROL.md` is the only repository document that decides the current strategic frontier. Older/date-stamped documents and closed issues are historical evidence, not competing live roadmaps.
