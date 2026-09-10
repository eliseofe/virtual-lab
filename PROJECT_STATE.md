# Frozen Project State — 10 September 2026

This file records the design decisions accepted before implementation begins.

## Project identity

- Project: **Virtual Lab**
- Repository: `eliseofe/virtual-lab`
- Initial deployment: standalone static GitHub Pages site
- Future domain: undecided; candidate `lab.` subdomains of already-owned domains
- Relationship to existing academic website: separate application and repository; future relationship may be a simple external link and/or domain mapping

## Long-term vision

A virtual research laboratory where a PI, postdoc, student, or AI research assistant can define reproducible experiments on self-organized multi-agent systems, run them locally or on optional future compute backends, inspect visualizations and quantitative results, and exchange portable experiment/result objects with AI systems.

The motivating metaphor is **AI as graduate student**: the human discusses a paper or hypothesis with an AI, the AI derives an explicit controller/metric/experiment specification, the researcher verifies the interpretation, and the AI uses the lab to create/run/analyze experiments. Future human researchers use their own AI accounts/providers while collaborating in the same lab workspace.

## Accepted architecture

### Scientific agent boundary

```text
action = agent.step(observation)
```

- observation is local and simulator-constructed;
- the agent owns private state;
- the controller is the sole mutator of private agent state;
- the simulator applies returned actions to physical state;
- global state, random generators/seeds, filesystem/network, and simulator objects live outside the controller interface.

### Randomness

Randomness is simulator-owned. This includes initialization, sensing noise, actuation noise, and implementation of probabilistic scientific rules in a reproducible simulator-controlled way.

### Separate subsystems/clocks

Physics/integration, control evaluation, visualization, and metrics are distinct concerns and may use distinct frequencies. Rendering is observational and cannot influence scientific evolution. Headless execution is a rendering choice.

### Controller language

Researchers edit recognizable Python-style controller source. The initial direction is a constrained scientific Python subset compiled before execution to stable controller IR/executable code. Python is an authoring language rather than a per-step cross-runtime interpreter call.

### Engine

Current preferred direction: a new small Rust simulation kernel compiled to WebAssembly for browser execution, preserving a future native/HPC path. Violet is a reference implementation and MIT-licensed source of useful ideas rather than a required base.

### Data and cost

Baseline operation costs €0 beyond already-owned domains/ordinary user hardware. Compute and large data remain local. GitHub/static hosting carries code/specifications and small summaries. Paid compute, databases, object stores, AI APIs, and institutional HPC are optional future adapters.

### Future-proof seams

Permanent/stable seams:

- versioned Experiment format;
- versioned Run/result format;
- controller semantics/IR;
- Lab domain operations;
- `ExecutionBackend` abstraction;
- `ExperimentRepository` abstraction.

Replaceable adapters:

- GitHub transport/repository;
- MCP/HTTP AI interfaces;
- browser/native/HPC compute;
- static hosting provider;
- renderer;
- optional shared storage.

## Near-term rounds

### Round 1

Polished standalone lab + Rust/WASM scientific kernel + Active Elastic Model + visible editable Python controller + Apply/recompile/restart + live visualization + multi-experiment UI foundation + closed-loop browser verification.

### Round 2

Immediately add multiple runs/seeds, parameter sweeps, local parallelism, headless execution, independent metrics, aggregation/statistics, plots, run selection/replay, and local export/provenance.

### Round 3

Complete AI↔Lab workflow using the GitHub adapter first, while preserving portable schemas and future MCP/HTTP adapters.

## First scientific validation target

Active Elastic Model:

- Ferrante, Turgut, Dorigo, Huepe, Physical Review Letters 111, 268302 (2013), DOI `10.1103/PhysRevLett.111.268302`
- Ferrante, Turgut, Dorigo, Huepe, New Journal of Physics 15, 095011 (2013), DOI `10.1088/1367-2630/15/9/095011`

A correct Round 1 must expose the real model/controller semantics rather than a hard-coded flock-like animation. The owner should be able to alter a scientifically meaningful controller rule and observe the corresponding change/failure after recompilation/restart.

## Closed-loop development principle

Implementation agents are expected to close their own loop: implement, build, test, deploy, open the actual deployed application, interact with it, inspect behavior and browser/runtime errors, repair, and repeat before requesting scientific-owner feedback. Human review should focus on scientific fidelity and design judgment rather than elementary software breakage.