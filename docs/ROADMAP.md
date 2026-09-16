# Roadmap

This document describes the long-term product trajectory. It is **not** the current execution authority; current sequencing lives only in `PROJECT_CONTROL.md`.

## Current position — 16 September 2026

The project has moved well beyond the original Round 1 planning state:

- browser Rust/WASM scientific kernel is deployed;
- editable constrained-Python Configuration, Initialization, Controller and Metrics artifacts are deployed;
- authenticated Supabase Experiment Registry is deployed and integrated with production Virtual Lab;
- authenticated provider-independent MCP authoring is deployed;
- live multi-metric Results are deployed;
- local-first flat result persistence and whole-Experiment package export are deployed;
- fine-grained MCP Metrics + Results-panel authoring is deployed.

The current frontier is **#201 / #195.6**, final end-to-end acceptance of this Metrics/Results path using the already owner-authorized Active Elastic polarization fixture. The scientific definition is already supplied; #201 is not waiting for a new formula.

## Foundation — deployed

The first laboratory foundation established:

- standalone GitHub Pages application;
- local browser/WASM execution in a Web Worker;
- simulator-owned randomness;
- stateful agents with local observation → action boundaries;
- environment-owned action application;
- separate physics/control/rendering/metric scheduling;
- constrained Python-like authoring compiled before execution;
- versioned Experiment/registry contracts;
- closed-loop deployed-browser verification;
- Active Elastic as the first scientific diagnostic/showcase.

These are now baseline architecture, not future roadmap items.

## Experiment authoring and AI ↔ Lab — deployed baseline

The original “AI → Lab” transport plan evolved from a GitHub-adapter concept into the deployed authenticated Experiment Registry + MCP architecture.

Current baseline:

1. human/research AI discusses a paper or hypothesis;
2. authorized AI reads the machine-readable Virtual Lab authoring/capability contract;
3. AI authors/edits the four compulsory Experiment artifacts through MCP;
4. unsupported simulator capability becomes an explicit capability request rather than fabricated behavior;
5. production Lab reads the same registry Experiment;
6. human runs/inspects the Experiment locally;
7. Metrics execute as read-only scientific observers;
8. Results panels display configured metric IDs live;
9. raw single-run metric output remains local-first.

The AI authoring channel still has no simulator-development, GitHub, shell, deployment, arbitrary filesystem or admin capability.

## Current Metrics/Results epic — #195

Implemented children:

- #196 — four-artifact Experiment + Metrics language/validation;
- #197 — exact metric sampling, buffering and transport;
- #198 — live co-located multi-series Results;
- #199 — local-first single-run persistence/export;
- #200 — MCP fine-grained Metrics + Results binding authoring.

Current child:

- #201 — final generic end-to-end acceptance using the existing owner-authorized `polarization` metric (`psi = ||sum_i heading_i|| / N`, every 0.1 s for acceptance/display).

Once #201 passes, #195 can close if all completion conditions remain satisfied.

## Next scientific scale — Studies

Studies are the multi-run layer. They answer questions across runs/conditions rather than duplicating single-run Experiment Results.

Planned Study capabilities include:

- repetitions/seeds;
- parameter sweeps/matrices;
- local parallel execution where useful;
- batch/headless execution;
- exact binding to Experiment revision(s);
- reuse of stable Experiment metric IDs and the #199 run-file contract;
- aggregate statistics/uncertainty;
- cross-run plots and comparisons;
- checkpoint/resume semantics where explicitly designed;
- selected Study result → AI handoff.

Filesystem organization remains Experiment-first:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
    studies/
      <Study>/
        runs/
```

Single runs remain flat metric files; do not introduce one directory per run.

## Later analysis and publication layer

Longer-term product scope may include reproducible analysis/figure specifications downstream of Experiment/Study data, including explicit SVG/PDF/PNG export and eventually publication-ready figures. Live Results remains an interactive scientific inspection surface; it should not become a general graphics editor.

## Editor and UI/UX lanes

Separate approved lanes remain:

- #202 editor ergonomics: highlighting, navigation/folding/search, diagnostics/completion;
- #207 coherent UI/UX refinement, including Results affordances/follow-live and identity/save/persistence organization.

These lanes do not displace the current strategic frontier unless the owner reprioritizes.

## Future execution and science

Potential later capabilities include:

- native workstation backend using the same scientific semantics/controller IR;
- institutional HPC/Slurm adapter;
- richer physics and robot-specific models;
- heterogeneous populations/controllers after explicit capability approval;
- richer observation/action/environment models;
- additional benchmark tasks and scientific modules;
- multi-user collaboration and curated/public research workflows;
- selected results/analysis exchange with AI under explicit contracts.

## Development policy

Each substantial implementation ticket closes its own engineering loop:

```text
implement -> test -> deploy -> verify actual artifact -> update durable state -> report
```

Human scientific/product review is not a substitute for elementary software verification. Conversely, developer-side software work must not independently invent new paper-specific scientific definitions; owner/research-AI supplied science is reused exactly as recorded.
