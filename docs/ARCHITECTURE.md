# Architecture

## 1. Architectural objective

Virtual Lab must remain useful if any current implementation choice is replaced: GitHub, GitHub Pages, ChatGPT, MCP, the browser renderer, the browser execution target, the controller compiler target, or a future HPC provider. Future-proofing comes from stable scientific/domain contracts and replaceable infrastructure adapters.

## 2. Stable domain model

Core concepts:

- `Workspace`: logical collaborative research space.
- `Actor`: a human, or an AI acting on behalf of a human identity.
- `Experiment`: a named scientific experiment with versioned revisions.
- `ExperimentRevision`: immutable scientific definition once it has generated a run.
- `Controller`: researcher-authored local agent logic plus its compiled representation.
- `Environment`: world geometry/topology and environment-owned semantics.
- `PhysicsModel`: evolution/application semantics for physical state.
- `ObservationModel`: exact information made available to an agent.
- `Metric`: independent scientific measurement definition.
- `Run`: one execution of one exact experiment revision with a concrete seed/configuration.
- `Result`: metric summaries/derived outputs for one or more runs.
- `Artifact`: optional portable controller source, trajectory, plot, replay, result bundle, etc.

Round 1 may implement one local user and one shipped experiment, but IDs/interfaces must avoid assumptions that force later redesign for multiple experiments/users.

## 3. Scientific execution boundaries

### 3.1 Agent/controller

Canonical conceptual interface:

```text
action = agent.step(observation)
```

The agent:

- owns private internal state;
- can update that private state only through its controller execution;
- receives only the observation permitted by the experiment;
- returns an action;
- has no direct access to global world state;
- cannot apply its action directly to physical state;
- has no RNG, seed, clock, filesystem, network, or simulator object in its API.

If a scientific model includes probabilistic decisions, the source language should express a stochastic rule through simulator-owned primitives/semantics. Sampling remains simulator-owned and reproducible.

### 3.2 Simulator/environment

The simulator owns:

- global physical/world state;
- simulation time and scheduling;
- construction of local observations;
- neighbourhood/spatial queries;
- seeds and stochastic sampling;
- sensing noise and actuation noise;
- action application;
- physics/kinematics integration;
- collision/boundary semantics;
- run provenance.

The environment cannot mutate an agent's private controller state.

### 3.3 Metrics

Metrics are independent scientific observers. They may inspect permitted read-only global state because they are measurement apparatus, not perception/control. Metric data flow never leaks into agent observations unless explicitly part of the scientific model.

### 3.4 Independent clocks

Physics, control, rendering, and metrics are distinct scheduling domains:

```text
physics dt  -> evolve/apply physical world dynamics
control dt  -> construct observations and evaluate controllers
render dt   -> sample state for visualization only
metric dt   -> sample scientific measurements
```

Example configurations may use 1000 Hz physics, 20 Hz control, and 60 Hz display. Rates are experiment configuration rather than hard-coded semantics.

Headless execution removes the render consumer while preserving the same scientific trajectory for the same experiment/seed/backend guarantees.

## 4. Controller authoring vs execution

Researchers should edit a familiar Python-like language. Initial direction: a constrained subset, working name `python-vlab`.

Python is the authoring language, not the execution boundary:

```text
Python controller source
  -> parse AST
  -> validate allowed scientific subset
  -> semantic/type check
  -> stable controller IR
  -> executable target
  -> efficient simulation execution
```

There must be no design that invokes an interactive Python interpreter for each agent/control step.

The controller IR must be target-independent enough to support browser/WASM now and native workstation/HPC execution later without changing scientific source semantics.

## 5. Simulation kernel

Current preferred direction: a new Rust core compiled to WebAssembly for browser execution and native binaries later.

Violet (`m-rots/violet`) is a reference implementation and a source of useful MIT-licensed ideas/code, not a required base. Start smaller than Violet and add capabilities through explicit requirements.

Initial replaceable interfaces/concepts should include:

- `PhysicsModel`
- `ObservationModel`
- `NeighbourIndex`
- `ControllerRuntime`
- `MetricRuntime`
- `ExecutionBackend`

Neighbour querying should include a brute-force reference implementation. Optimized spatial hash/grid/index implementations must be tested against the reference.

## 6. Browser execution

Round 1 runs fully client-side.

Recommended separation:

```text
Main browser thread
  UI + visualization + source editor

Web Worker(s)
  WASM simulation kernel
  compiled controller
  run state
```

Visualization may use Canvas initially and later WebGL/PixiJS or another renderer. Renderer choice is not scientific state and must not affect simulation semantics.

## 7. Experiment workspace

The UI is designed as a collection of experiments from the first round.

Conceptual operations:

```text
list_experiments()
create_experiment(spec)
get_experiment(id, revision?)
create_revision(id, spec)
archive_experiment(id)
select_experiment(id)              # session/UI state
run_experiment(id, revision, config)
list_runs(experiment_id)
get_run(run_id)
export_experiment(id, revision)
export_run(run_id)
```

"Active experiment" means the experiment selected in a particular UI/session. It is not a global laboratory singleton. Different collaborators may select/run different experiments concurrently.

Executed revisions are immutable. Editing an executed definition creates another revision.

## 8. Portable scientific formats

Versioned Experiment and Run formats are permanent interoperability seams. They must remain independent of storage and transport.

Examples:

```text
vlab.experiment/0.x -> eventually vlab.experiment/1
vlab.run/0.x        -> eventually vlab.run/1
```

Schemas live under `schemas/`. Schema changes require explicit versioning/migration rather than silent reinterpretation.

## 9. Repository/transport abstraction

GitHub is the first convenient zero-cost transport/collaboration adapter, not the architecture.

Conceptual interface:

```text
ExperimentRepository
  list()
  get(id, revision)
  save(draft/revision)
  archive(id)
```

Initial implementation may map these operations to files/commits. Future implementations may map them to filesystem, HTTP, MCP, a database, or another store. Domain/UI/simulator code must not depend directly on GitHub paths or API semantics.

## 10. Compute abstraction

Conceptual interface:

```text
ExecutionBackend
  run(experiment, run_config)
  status(run_id)
  cancel(run_id)
```

Initial backend: `BrowserExecutionBackend`.

Possible future adapters:

- `NativeLocalExecutionBackend`
- `SlurmExecutionBackend`
- `KubernetesExecutionBackend`
- other institutional/cloud batch backends

The experiment format does not know where it runs.

For parallel science, prefer parallelizing independent runs/parameter points across cores/workers rather than prematurely parallelizing one small swarm trajectory.

## 11. Data architecture

Large run data is local-first.

Git is appropriate for:

- source code;
- experiment/controller/metric specifications;
- compact provenance;
- small derived summaries.

Git is not the default store for:

- large trajectories;
- Monte Carlo bulk outputs;
- large videos/matrices.

Browser-local storage may serve active/recent runs. Valuable scientific output must support explicit export to the researcher's filesystem. Future institutional/shared storage is an optional adapter.

## 12. Multi-user architecture

Workspaces own experiments. AI-provider accounts do not.

Each human authenticates independently to the collaboration layer. Each may use their own ChatGPT, Claude, custom agent, or no AI. Provenance distinguishes human actions from AI-on-behalf-of-human actions.

Potential roles:

- PI/research owner;
- researcher;
- simulator/core developer;
- AI actor acting for an authenticated human.

Ordinary experiment authors modify controllers/metrics/experiment definitions. Trusted developer operations modify the scientific kernel/compiler/infrastructure.

## 13. Static hosting and project isolation

Initial application must be static-hostable on GitHub Pages. Simulation compute is client-side. There is no required server process.

The repository is fully standalone. It shares no code, CI, deployment, runtime, storage, or Vercel project with the existing academic website. Visual continuity may be used as design inspiration only. A custom `lab.` domain may be attached later without coupling the applications.

## 14. Closed-loop engineering

A build is not accepted merely because CI passes. Implementation agents must test the actual deployed application through a browser:

```text
implement -> test -> deploy -> open -> interact -> inspect -> diagnose -> fix -> repeat
```

For Round 1 this includes running the scientific experiment, editing controller source, recompiling/restarting, checking changed behavior, checking invalid-source errors, and inspecting console/runtime errors before owner handoff.