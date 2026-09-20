# Architecture

Status: **current architecture, 16 September 2026**.

Current project status lives in `CURRENT_STATUS.md`; strategic direction lives in `ROADMAP.md`.

## 1. Architectural objective

Virtual Lab must remain useful if current infrastructure choices are replaced: GitHub Pages, Supabase, MCP, an AI provider, the browser renderer, execution target or future HPC provider.

Future-proofing comes from stable scientific/domain contracts and replaceable infrastructure adapters.

## 2. Stable research/domain concepts

Core concepts include:

- `Workspace` — logical collaborative context;
- `Actor` — human or authorized AI acting through a human/registry identity;
- `Experiment` — named versioned single-run scientific definition;
- `ExperimentRevision` — exact scientific definition referenced by runs/Studies;
- `Artifact` — typed authored component of an Experiment/Study;
- `Metric` — read-only scientific measurement definition inside the Experiment Metrics artifact;
- `ResultsPresentation` — non-scientific panel/layout bindings by stable metric ID;
- `Run` — one execution of one exact Experiment revision with concrete run configuration/seed;
- `Study` — reproducible multi-run/condition investigation pinned to Experiment revision(s);
- `Result` — derived scientific output tied to exact run/Study identities;
- future `ResearchNote` / `ResearchDocument` — durable scientific memory/narrative objects.

IDs/revisions must avoid assumptions that force redesign for multiple Experiments/users/providers.

## 3. Canonical Experiment model

A runnable Experiment currently has exactly four compulsory core artifacts:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

The Metrics artifact may contain zero definitions and still be valid.

The canonical registry representation is a generic ordered typed artifact array (`vlab.experiment-artifacts/3`, registry `vlab.registry-experiment/3`). Legacy three-source fields are bounded compatibility only and cannot erase Metrics.

Optional artifacts are representable, but they execute only if a versioned simulator capability explicitly registers their format/compiler/lifecycle/scope.

## 4. Scientific execution boundaries

### Agent/controller

Canonical interface:

```text
action = agent.step(observation)
```

The controller:

- owns private internal state;
- receives only declared local observations;
- returns an action;
- has no unrestricted global world/agent access;
- does not apply actions directly;
- has no arbitrary host RNG/filesystem/network/simulator object;
- does not receive global position unless a future owner-approved capability explicitly changes that gatekeeper.

### Simulator/environment

The simulator/environment owns:

- global physical/world state;
- scientific time/scheduling;
- neighbourhood/spatial queries;
- observation construction;
- seeds/stochastic sampling/noise semantics;
- action interpretation/application;
- physics/kinematics integration;
- boundary/topology semantics.

### Metrics

Metrics are independent read-only scientific observers, not controller perception. They may inspect only the versioned global snapshot fields exposed by the Metrics contract.

Current Metrics measurement phase: `post-physics-wrapped-state/1`.

Metric data never leaks into controller observations unless a separate scientific observation capability explicitly says so.

### Independent schedules

Scientific/runtime concerns remain decoupled:

```text
physics     evolve/apply physical dynamics
control     construct local observations + execute controllers
measure     evaluate metric definitions at scientific cadence
render      visualize accumulated/current state
persist     flush buffered scientific samples to durable local files
```

Changing render/persist cadence must not change scientific trajectory or metric sampling.

## 5. Authoring vs execution

Researchers edit constrained Python-compatible source. Python-like source is an authoring interface, not a per-step interpreter boundary.

Conceptually:

```text
source
 -> parse/validate allowed subset
 -> semantic/type/capability checks
 -> stable internal representation
 -> efficient runtime execution
```

Current families include Configuration, Initialization, `python-vlab/0.1` Controller and `python-vlab-metrics/0.1` Metrics.

The controller/metrics compiler contracts remain target-independent enough to preserve future native/HPC possibilities without changing scientific source meaning.

## 6. Scientific kernel and browser execution

Current production kernel is Rust/WASM running inside a Web Worker.

Main browser thread owns UI/visualization/editing/orchestration. Worker/WASM owns scientific run execution. Visualization remains observational.

Production neighbour search is `adaptive-periodic-bvh/v1`, with exact/reference implementations retained as correctness oracles/fallbacks.

## 7. Experiment Registry and transport abstraction

The canonical remote Experiment Registry is currently implemented with Supabase. Production Virtual Lab and authenticated MCP AI clients operate over that same Experiment-domain state.

The stable architecture is the **Experiment domain contract**, not Supabase itself.

Conceptually:

```text
ExperimentRepository
  list/get
  create/edit with revision checks
  organize/archive/restore/delete
  read/write presentation state
```

Current adapters:

- browser client → Supabase Registry;
- AI client → authenticated Experiment MCP → same domain/RLS boundary.

GitHub is the trusted simulator source/CI/deployment system. It is **not** the ordinary Experiment-domain transport for research AI.

## 8. Optimistic revisions

Scientific Experiment state uses its own monotonic revision. Stale writes are rejected instead of silently overwriting newer state.

Results presentation (`vlab.results-presentation/1`) has a separate revision because changing panels/layout is not a scientific Experiment change.

Executed run data identifies exact scientific revision/configuration/runtime context through Lab-managed metadata.

## 9. Results presentation architecture

Live Results remain physically co-located with the running Experiment UI.

Generic time-series panels reference ordered stable metric IDs:

- one panel may display several metrics;
- a metric may appear in several panels;
- deterministic colors are presentation behavior;
- panel edits do not mutate metric definitions or scientific revision;
- display reduction/redraw cadence remains separate from complete retained scientific samples.

Arbitrary plotting code is not part of the current MCP authoring surface.

## 10. Local scientific data architecture

Canonical raw single-run metric output is ordinary user-visible files under a user-selected Virtual Lab workspace root where direct writable-directory access is supported.

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      <other-metric-id>_000001.csv
      ...
    .vlab/
      ...compact machine-managed bookkeeping...
    studies/
      <Study>/
        <metric-id>_000001.csv
        ...same flat run contract...
```

There is no directory per run and no extra `runs/` layer inside a Study. Browser-private storage is not the scientific archive. Supabase/Git are not bulk scientific result stores.

Persistence is buffered/asynchronous and separate from metric evaluation/UI rendering. Whole-Experiment package export is a secondary convenience, not the canonical path on browsers with selected-folder access.

## 11. Studies

Studies are the multi-run layer, not another way to define one-run Metrics.

A Study initially binds/pins one exact Experiment revision and orchestrates conditions/repetitions/seeds, consuming stable Experiment metric IDs for aggregation/comparison. Future checkpoint/resume or multi-Experiment Study behavior requires explicit versioned design.

The local hierarchy keeps Studies under their Experiment so origin is visible. Current activation state is recorded in `CURRENT_STATUS.md`.

## 12. AI capability boundary

Research AI can author only the Experiment-domain semantics exposed by the current machine-readable contract.

Current production MCP supports whole four-artifact authoring plus fine-grained Metrics/Results panel authoring. Professor role can create durable requests for unsupported simulator capabilities.

Research AI receives no GitHub, shell, deployment, arbitrary filesystem/SQL/admin or simulator-source privileges. Unsupported science/capability is surfaced explicitly rather than approximated silently.

## 13. Capability-development loop

Standing flow:

```text
research AI identifies unsupported need
 -> Professor request/review
 -> developer architecture/design discussion
 -> explicit owner implementation approval
 -> trusted GitHub implementation/test/deploy
 -> versioned capability becomes advertised
 -> research AI resumes
```

Professor approval alone is not coding authorization.

## 14. Scientific authority boundary

Implementation agents may design software mechanisms but must not independently invent new paper-specific scientific equations, controller laws, metric formulas, retuning or sampling semantics.

Already owner-authorized scientific definitions may be reused exactly as recorded. They should not be re-requested simply because an older issue/doc contains stale “owner input required” text.

## 15. Compute abstraction

Current execution backend is browser/WASM. Future adapters may include native workstation, Slurm/HPC or other institutional compute while preserving stable Experiment/controller/metric semantics.

Parallel science should generally parallelize independent runs/conditions before attempting unnecessary intra-trajectory parallelism.

## 16. Multi-user/provider architecture

Registry/workspace identities are independent of AI-provider identities. Different collaborators can use different AI clients/providers or none at all. Provenance/attribution distinguishes human and AI-on-behalf-of-human actions where relevant.

## 17. Development procedure

Repository development procedure is defined only in `DEVELOPMENT_WORKFLOW.md`. Architecture documents specify system contracts; they do not redefine the execution workflow.

## 18. Replaceability rule

Supabase, MCP, GitHub Pages, Rust/WASM and specific browser APIs are current implementations. Replacement is permitted when justified, but replacements must preserve versioned scientific/domain contracts and the zero-cost/local-first baseline unless the owner explicitly approves a change.


## Opt-in runtime profiles (fork contribution)

Experiments declaring `RUNTIME_PROFILE` with schema `vlab.runtime-profile/1`
use a shared identity, local observation and lifecycle adapter around the same
compiled Rust controller/metric runtimes. Physics dispatches to unicycle
kinematics or Bullet/CF2X rigid bodies. Experiments without this declaration
retain the existing periodic kernel. Scientific force laws are authored in
experiment artifacts, not selected by the engine. See
[Swarm vs Swarm implementation](SWARM_VS_SWARM.md) for the contract, limitations
and executable validation. Access-control and capability-approval boundaries
are unchanged; this fork does not deploy registry capabilities.
