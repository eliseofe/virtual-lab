# Virtual Lab

A zero-cost, browser-first scientific laboratory for reproducible experiments on self-organized multi-agent systems, designed so that human researchers and AI research assistants can define experiments, execute them locally, inspect them visually, and exchange portable experiment/result artifacts without coupling the scientific system to any specific AI provider or cloud-compute vendor.

## Vision

The long-term goal is a **virtual research laboratory** in which a principal investigator, postdoc, student, or AI research assistant can:

1. Start from a scientific paper or an original hypothesis.
2. Convert the scientific description into an explicit experiment specification: agent/controller rules, environment/physics, parameters, and collective metrics.
3. Review and edit the scientific controller in a familiar researcher-facing language (initially a constrained Python subset).
4. Run the experiment efficiently on the user's own machine, with live visualization or headless execution.
5. Run multiple stochastic realizations and parameter sweeps in parallel.
6. Compute collective metrics, aggregate statistics, make plots, and replay selected runs.
7. Export compact, reproducible experiment and result bundles back to an AI assistant for scientific discussion.
8. Collaborate with multiple researchers, each using their own AI account/provider and their own compute.
9. Optionally add future execution backends such as native workstation execution, Slurm/HPC, cloud batch systems, or other providers without changing experiment semantics.

The project begins with collective-motion and swarm-systems experiments, but the architecture should remain general enough for other self-organized multi-agent systems.

## Hard invariants

These are architectural requirements, not temporary MVP shortcuts.

- **Zero incremental monetary cost is the default operating mode.** The core laboratory requires no paid compute, no paid database, no paid object storage, no required OpenAI API, and no always-on backend.
- **Compute is local by default.** Browser/edge execution uses the researcher's CPU. Large raw results remain local unless the researcher explicitly exports/shares them.
- **AI-provider independence.** ChatGPT may be the first AI client, but the laboratory must not depend on a specific AI vendor, account, or protocol.
- **Simulator independence from transport/storage.** GitHub may be the first collaboration/transport adapter; GitHub is not part of the scientific semantics.
- **Scientific reproducibility and provenance.** Executed experiment revisions are immutable. Every run records enough provenance to reproduce the execution.
- **Agent autonomy boundaries are scientific gatekeepers.** The agent receives a local observation, owns its private internal state, and returns an action. The simulator owns world state, stochastic sampling, physics, time, perception construction, and action application.
- **Physics, control, visualization, and metrics are separate clocks/subsystems.** Rendering cannot change simulation results. Control updates need not occur at the physics integration frequency. A future physics model can change from kinematic to dynamic without rewriting the controller contract.
- **Researcher-facing controller code is visible and editable.** Rust/WebAssembly may power the engine, but controllers are authored in a familiar language. The initial direction is a constrained Python subset compiled before execution, not interpreted across the simulator boundary at every control step.

## Reference implementation and validation papers

### Violet

Violet (`m-rots/violet`) is a reference implementation and source of design lessons, not a required dependency. It contains useful ideas including deterministic seeded simulation, spatial-neighborhood acceleration, headless execution, heterogeneous agent classes, snapshots/metrics, and replay. The new laboratory may adapt MIT-licensed code or ideas where beneficial, while redesigning abstractions that do not fit the scientific contract.

Repository: https://github.com/m-rots/violet

### Active Elastic Model

The first validation experiment is the Active Elastic Model (AEM), because it is scientifically diagnostic: correct emergent behavior depends on simulator/controller semantics being correct, so it is a stronger test than a cosmetic flocking demo.

- E. Ferrante, A. E. Turgut, M. Dorigo, C. Huepe, “Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms,” Physical Review Letters 111, 268302 (2013). DOI: 10.1103/PhysRevLett.111.268302
- E. Ferrante, A. E. Turgut, M. Dorigo, C. Huepe, “Collective motion dynamics of active solids and active crystals,” New Journal of Physics 15, 095011 (2013). DOI: 10.1088/1367-2630/15/9/095011

## Architecture at a glance

```text
Human researcher
      |
      v
AI client (ChatGPT / Claude / future)
      |
      v
AI adapter (GitHub initially, MCP/HTTP/etc. later)
      |
      v
Lab domain API / portable experiment contract
      |
      +-----------------------------+
      |                             |
      v                             v
Experiment repository         Result/run artifacts
      |                             |
      v                             v
ExecutionBackend              Export / analysis
      |
      +------------------+------------------+
      |                  |                  |
      v                  v                  v
Browser/WASM       Native workstation    HPC/Slurm
(initial)          (future)              (future)
```

The stable seams are the **experiment/run formats**, **scientific controller contract**, **Lab domain API**, and **execution interfaces**. Hosting, GitHub, AI protocol, visualization technology, and compute backend are replaceable adapters.

## Roadmap

### Round 1 — tangible scientific kernel

A polished standalone GitHub Pages application that runs entirely in the browser and demonstrates the Active Elastic Model using the real scientific architecture. The user sees and edits the Python controller, applies the change, restarts, and observes the resulting behavior. The implementation uses a new scientific kernel rather than forcing Violet into the browser.

Round 1 is complete only after closed-loop browser verification: build, deploy, open the deployed application, run the model, edit the controller, re-run, inspect errors/console/behavior, repair defects, and repeat until the implementation is fit for human scientific review.

### Round 2 — real experimental science

Multiple runs/seeds, parameter sweeps, browser-local parallel execution, metric computation, aggregation/statistics, plots, and replay of selected realizations. This follows immediately after Round 1.

### Round 3 — AI ↔ lab experiment workflow

A paper can be discussed with an AI assistant, converted to the portable experiment format, added to the experiment workspace through the initial GitHub adapter, and then selected/run in the lab. Results can be exported in a compact machine-readable bundle and returned to the AI.

### Later

Collaborative workspaces and identities; multiple human researchers each using their own AI provider/account; native/HPC execution adapters; richer physics engines; heterogeneous populations; richer experiment provenance; optional direct MCP/HTTP adapters; and additional simulator modules.

## Project separation

This project is intentionally independent from the existing academic website and from any Vercel project. It has its own repository, build, deployment, issue tracker, and eventual domain. A future academic website may link to the lab as an external application, but Virtual Lab does not share code, build configuration, deployment state, storage, or runtime infrastructure with that website.

## Start here

Read `PROJECT_STATE.md`, then the documents under `docs/`, especially `docs/SCIENTIFIC_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/ZERO_COST.md`, `docs/AI_LAB_PROTOCOL.md`, and `docs/ROADMAP.md`. The GitHub issues are the executable work plan.