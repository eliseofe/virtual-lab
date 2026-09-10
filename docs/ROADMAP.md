# Roadmap

## Round 1 — Lab shell + scientific kernel

### Objective

Produce the first tangible standalone laboratory and validate the fundamental scientific architecture.

### User-visible outcome

1. Open the independent GitHub Pages URL.
2. See a polished scientific application with visual continuity to the owner's academic website while remaining a separate codebase/deployment.
3. See an experiment collection/selector with the Active Elastic Model experiment selected.
4. See the live simulation visualization.
5. See recognizable editable Python-like controller source.
6. Press Run, Pause, and Restart.
7. Edit controller source, Apply, restart, and observe changed behavior.
8. Receive useful compile/validation errors for invalid controller edits.

### Technical outcome

- new small Rust scientific kernel compiled to WASM unless a documented technical spike finds a materially stronger option;
- simulation executed locally in a Web Worker;
- physics/control/rendering/metric scheduling separated;
- simulator-owned randomness;
- agent private-state + local-observation/action contract;
- replaceable neighbourhood index with brute-force correctness oracle;
- constrained Python authoring language compiled before execution to stable controller IR/executable target;
- no per-agent/per-control-step Python interpreter boundary;
- initial versioned experiment schema and experiment collection UI;
- static GitHub Pages deployment;
- closed-loop browser verification before handoff.

### Scientific validation

Use the Active Elastic Model from Ferrante et al. PRL 111, 268302 (2013) and NJP 15, 095011 (2013). The objective is scientific fidelity, not visually plausible flocking.

Round 1 is accepted only when a meaningful controller modification produces the corresponding changed/failing dynamics and restoring the controller restores expected reference behavior.

## Round 2 — Experimental science

### Objective

Turn the simulator into an actual quantitative laboratory immediately after Round 1.

Add:

- multiple independent seeds/runs;
- parameter sweeps/matrices;
- local parallel execution across independent workers/cores;
- headless execution;
- metric definitions independent of controller code;
- configurable metric sampling;
- aggregation across runs;
- appropriate statistics/uncertainty;
- plots;
- run list/history;
- replay of selected individual realizations;
- local-first persistence;
- compact result export and explicit raw-data export;
- provenance including experiment revision, seed, compiler/core versions, parameters, and execution backend.

## Round 3 — AI ↔ Lab workflow

### Objective

Complete the virtual-student research loop while retaining AI/vendor independence.

Target workflow:

1. AI and researcher inspect a paper/hypothesis.
2. AI produces explicit agent/controller, metric, environment, parameter, and protocol specification.
3. Researcher approves/corrects the scientific interpretation.
4. AI creates a new experiment/revision via the initial GitHub adapter.
5. Lab refreshes and lists the experiment.
6. Researcher selects and runs it.
7. Lab exports compact result/run information.
8. AI reads the result and continues scientific discussion/proposes the next experiment.

Round 3 must exercise the stable Lab domain API/portable schemas rather than expose GitHub mechanics as the scientific interface.

## Round 4 — Collaboration

Add:

- workspace model and identity;
- independent researcher accounts and AI accounts;
- GitHub-backed collaborative experiment registry or equivalent free adapter;
- authorship/revision lineage;
- concurrent independent experiment selection;
- permissions distinguishing experiment editing from simulator/core development;
- clear actor provenance for human actions and AI-on-behalf-of-human actions.

## Future execution

- native local backend using the same scientific semantics/controller IR;
- HPC/Slurm adapter if institutional compute becomes available;
- optional institutional shared storage;
- documented reproducibility guarantees across WASM/native backends.

HPC availability is never a prerequisite for the browser-local laboratory.

## Future scientific capabilities

- heterogeneous populations/controllers;
- dynamic physics and robot-specific models;
- richer observation/action models;
- static/dynamic interaction graphs;
- 3-D environments;
- obstacles/sites/fields;
- additional neighbourhood/topology implementations;
- experiment comparison and lineage;
- richer metric libraries;
- automated paper-reproduction workflows.

## Future interfaces

- direct MCP adapter;
- HTTP/local-service adapter;
- filesystem adapter;
- additional AI clients;
- optional direct AI-driven run requests where authentication and scientific provenance are explicit.

## Development policy across all rounds

Each implementation round closes its own engineering loop:

```text
implement -> test -> deploy -> open actual UI -> exercise -> inspect -> repair -> repeat
```

Human scientific review begins after elementary software/UI/runtime defects have already been found and repaired by the implementing agent.