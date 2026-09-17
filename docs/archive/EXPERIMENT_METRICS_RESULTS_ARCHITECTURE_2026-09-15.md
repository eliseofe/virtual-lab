# Experiment Metrics and live Results architecture — 15 September 2026

Status: **owner-approved product/architecture direction; implementation pending through #195 children**.

This document is the durable record of the Metrics/Results discussion that followed completion of the neighbour-search production architecture. It exists so a context-free future session can recover the decisions without reconstructing chat history.

Current production still uses the deployed three-core-artifact contract until #196 implements the migration described here. This document records the approved target architecture and supersedes older design assumptions where they conflict.

## 1. Core product decision: an Experiment has four compulsory artifacts

A scientific Experiment is conceptually defined by four compulsory authored artifacts:

1. **Configuration** — parameters/runtime inputs;
2. **Initialization** — initial world/swarm/run state;
3. **Controller** — agent behaviour/control program;
4. **Metrics** — what the Experiment measures.

Metrics is **not optional**. Measurement is part of the Experiment definition just as initialization and control are. The project was previously missing this fourth core concept.

Backward compatibility remains straightforward: an old/simple Experiment may contain a compulsory but **empty Metrics artifact**, i.e. zero metric definitions. Existing three-artifact Experiments should be normalized/migrated to that empty fourth artifact without changing their current runtime behaviour.

This means the approved target supersedes the older statement that the executable Experiment core is permanently exactly three artifacts. The migration is a deliberate contract/version event, owned by #196.

## 2. One Metrics artifact, many metric definitions

Do not create one top-level Experiment artifact per metric merely to avoid a large source document.

The Experiment has one compulsory `metrics` artifact containing a generic collection of metric definitions. The collection has no scientific/schema maximum such as 4, 6 or 8 metrics. Implementations may protect the browser from pathological workloads, but the model is `metrics[]`, not `metrics[0..8]`.

Each metric needs durable identity and enough metadata for runtime, Results and AI authoring, conceptually including:

- stable metric ID;
- human-readable name;
- optional unit;
- computation/source definition;
- sampling policy/cadence;
- compiler/capability/version provenance as applicable.

Metric names are presentation labels. Result/plot binding uses the stable metric ID, so renaming a metric label does not break collected data or presentation bindings.

## 3. Metric execution is a read-only scientific observer

Metric execution must not be a back door into simulator mutation.

A metric may observe only the simulator state/capabilities explicitly exposed by the metric execution contract. It must not:

- alter agent/world state;
- produce actions;
- mutate controller private state;
- write files or use the network;
- access unrestricted simulator/host internals;
- bypass simulator-owned randomness/information boundaries.

The exact measurement phase relative to control/physics is scientifically meaningful and must be explicit/versioned. Do not silently call metrics a normal `control` hook merely for implementation convenience if that leaves observation timing ambiguous. #196 must freeze this contract with owner involvement where a scientific timing decision is required.

Implementation agents may design the plumbing/compiler/runtime boundary but must not invent scientific metric formulas or substitute scientific definitions.

## 4. Experiment Results vs Study Results

The project boundary is now:

**Experiment Results answer: _what happened during this run?_**

An Experiment may define metrics, evaluate them during one run, collect scalar observations associated with scientific/run time and display those observations live.

**Studies answer: _what happened across runs/conditions?_**

Studies later orchestrate repeated runs/parameter combinations, consume the same stable metric identities, aggregate results and construct cross-run analyses.

Therefore basic metric definition, one-run collection and live plotting must **not** wait for the Study system.

Examples of later Study-facing visualizations/analyses include box plots, distributions/density plots, parameter-vs-result scatter plots, ensemble intervals/statistics and other multi-run comparisons. The first Experiment Results visualization is deliberately time-series oriented.

## 5. Metric sampling model

A metric emits scalar observations associated with scientific/run time.

This common representation can support:

- repeatedly sampled time-varying metrics;
- metrics sampled at a lower cadence than control/physics;
- metrics sampled at selected times;
- a final-only scalar metric if/when that sampling policy is supported.

Sampling cadence is scientifically relevant provenance. The implementation must not silently reduce scientific sampling frequency in order to improve rendering/storage performance.

The first real scientific acceptance fixture will be a flocking order parameter. Its mathematical definition and scientifically intended sampling timing/cadence are **not defined by this architecture document** and must come from explicit owner input. See #201.

## 6. Plot panels are presentation objects, not one plot per metric

Do not hard-code one metric = one chart.

The live Results presentation uses configurable **plot panels**. Conceptually:

```text
Metric definitions
  polarization      id=m1
  mean_speed        id=m2
  another_metric    id=m3

Plot panel A -> [m1, m2]
Plot panel B -> [m3]
```

Rules:

- a panel references an ordered set of stable metric IDs;
- one panel may contain one or multiple time-series lines;
- the same metric may appear in more than one panel when useful;
- line colors are assigned automatically and remain stable within the active presentation;
- the user can change which metrics share a panel without editing metric science;
- there is no architecture-level maximum of one panel per metric or eight panels;
- panel layout/bindings are workspace/presentation state, not scientific metric definitions and should not by themselves create a new scientific Experiment revision.

The first plot type is an interactive time-series line plot. Later Study plots are a separate layer.

## 7. Hard UI/UX requirement: Results stay with the simulation

The user must be able to see the metric evolving **together with the simulation**.

Normal live Results inspection must not require:

- navigating to a separate Results page;
- opening a different browser tab;
- replacing the simulation with a disconnected analysis view.

The exact responsive layout is an implementation decision owned by #198. A collapsible/resizable Results region, drawer-like secondary surface, beside/below composition or responsive reflow are all possible, provided opening Results keeps the running simulation visible/available.

Do not render every available metric as a giant separate chart by default. The generic panel model should let users choose useful combinations while keeping the simulation primary.

## 8. Performance architecture: separate three cadences

The Metrics/Results feature must preserve the performance gains from #56/#168 rather than attaching I/O/rendering directly to the hot simulation loop.

Keep three distinct frequencies:

1. **Metric evaluation cadence** — when the scientific metric is actually computed;
2. **UI refresh/transport cadence** — when accumulated samples are transferred/redrawn for live visualization;
3. **Persistence flush cadence** — when buffered samples are written to durable local storage.

These frequencies are independent.

A plausible run may compute a metric every control step, refresh the plot only several times per real-time second, and flush storage substantially less frequently. Changing UI/persistence cadence must not change the scientific sample series.

The hot path should conceptually be:

```text
simulate
  -> evaluate metrics that are due
  -> append compact samples to memory buffer
  -> continue simulation
```

Other asynchronous/batched paths handle:

```text
buffer -> UI transport/render
buffer -> local durable persistence
```

Never synchronously write each sample to disk/database inside the simulation hot path.

The user requested the ability to control persistence/save frequency. This is an infrastructure/workspace/runtime control distinct from scientific sampling cadence. #199 owns the exact UX/default/buffering semantics.

For very long series the renderer may use a reduced/decimated display representation for performance, but the preserved scientific samples must remain complete according to the declared sampling policy.

Performance work must distinguish unavoidable cost of computing a scientific metric from avoidable framework/serialization/message/render/persistence overhead.

## 9. Local-first single-run data and provenance

One-run metric data should be local-first. Supabase/cloud registry must not become the mandatory bulk trajectory/time-series warehouse.

Stored/exported run results should be attributable to at least:

- exact Experiment/revision;
- exact metric IDs/metric-definition versions;
- sampling policies;
- scientific/run timestamps;
- configuration/seed/runtime/capability versions as applicable;
- local result/export identity.

#199 owns local buffering, flush policy, export and failure/finalize durability semantics.

Future #3/#4 Study storage should compose/reuse these identities/contracts rather than creating an incompatible second result representation.

## 10. MCP / Virtual Lab Connector is part of epic completion

#195 is not complete when the browser can merely execute/display Metrics.

The machine-readable authoring contract and deployed Virtual Lab MCP/Connector must understand the complete four-artifact Experiment model so an authorized research AI can create/amend scientific measurement and Results presentation.

Target workflow:

> Professor: "Find this paper and make an Experiment."

Subject to supported simulator capabilities and the science supplied by the paper/Professor/research AI, the research AI should be able to:

1. author Configuration;
2. author Initialization;
3. author Controller;
4. identify/author relevant metric definitions in Metrics;
5. specify supported metric sampling policies;
6. create a sensible initial Results plot-panel layout;
7. later add/remove/amend metric definitions and panel bindings without rewriting unrelated artifacts.

The AI does **not** write browser UI code. It authors metric definitions and generic presentation bindings that the Lab understands.

The contract must expose supported metric syntax/information boundaries and return explicit validation/unsupported-capability diagnostics. Unsupported requested science/capability goes through the established Professor capability-request flow rather than being invented.

Research AI still receives no GitHub/repository/shell/deployment/admin/simulator-development privileges.

#200 owns this MCP/Connector completion layer.

## 11. Relationship to optional executable artifacts / #126

Metrics no longer supplies the concrete use case for #126.

The older lifecycle architecture distinguished three required core artifacts plus possible optional executable artifacts. The approved target now has **four required core artifacts**. Metrics executes through the core Experiment contract, not through the optional-executable-artifact dispatch mechanism.

#126 remains blocked until a genuinely optional executable artifact type is owner-approved. Do not activate #126 merely because Metrics is executable.

## 12. Separate editor/code-authoring UX epic

Large Metrics source is an editor ergonomics concern, not a reason to fragment the scientific artifact model.

#202 is the separate code-authoring ergonomics epic applying to all Experiment artifacts. Its approved direction includes:

- syntax highlighting;
- semantic highlighting where parser/compiler information supports it;
- line numbers/indentation;
- useful styling of comments/decorative separators;
- parser-derived symbol outline/navigation;
- jump-to-definition;
- code folding;
- current section/symbol indication;
- search within the active artifact;
- source-linked diagnostic gutter;
- later lightweight contract-derived completion where justified.

Actual program structure comes from parser/compiler semantics, not magic decorative comment strings such as `==== PARAMETERS ====`.

This lets one Metrics artifact remain scientifically coherent even when it contains many metric definitions.

## 13. Issue hierarchy / execution order

Parent:

- #195 — Experiment Metrics, live Results and interactive plotting.

Bounded children:

- #196 / #195.1 — four compulsory artifacts + Metrics language/validation/read-only execution contract;
- #197 / #195.2 — multi-metric sampling/buffering/transport/performance isolation;
- #198 / #195.3 — co-located live Results UI + multi-series plot panels;
- #199 / #195.4 — local single-run persistence, buffered flush policy, export/provenance;
- #200 / #195.5 — MCP/Connector authoring of Metrics and Results bindings;
- #201 / #195.6 — owner-defined flocking-order-parameter end-to-end acceptance.

Separate editor hierarchy:

- #202 — code authoring ergonomics epic;
- #203 / #202.1 — editor foundation + syntax/semantic highlighting;
- #204 / #202.2 — parser-derived outline/navigation + folding/search;
- #205 / #202.3 — source-linked diagnostics + constrained-language completion.

Follow `docs/EXECUTION_GRANULARITY.md`: these are substantial children and should be completed one independently deployable/testable ticket at a time unless the owner explicitly requests a broader uninterrupted sequence.

## 14. Source precedence

For Metrics/Results questions, use:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md`;
3. this document;
4. current #195 child issue;
5. older `RESEARCH_MODEL.md` / `ARTIFACT_EXECUTION_LIFECYCLE.md` text where it does not conflict.

In particular, older statements assigning all metrics/results/plots exclusively to Studies or fixing the runnable core permanently at exactly three artifacts are superseded by this approved direction, while current production remains three artifacts until #196 is implemented and verified.
