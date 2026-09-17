# Experiment Metrics contract — #196

Status: implementation contract for #195.1, 15 September 2026.

## Scope

This document records the first bounded Metrics foundation only. Runtime execution/collection of compiled metrics is #197; live Results UI is #198; persistence/export is #199; MCP end-to-end metric/panel authoring is #200.

## Four compulsory Experiment artifacts

The canonical runnable Experiment contract is versioned from three required artifacts to four:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Metrics is compulsory because measurement is part of the Experiment definition. Empty Metrics content is valid, so existing experiments migrate mechanically without acquiring new scientific behavior.

Registry/artifact versions after #196:

- registry schema: `vlab.registry-experiment/3`
- artifact interface: `vlab.experiment-artifacts/3`
- authoring contract: `vlab.authoring/0.5`
- Experiment interface: `7`
- artifact capability contract: `vlab.artifact-capabilities/0.3`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`

The scientific runtime contract remains `vlab.runtime/0.2`; #196 freezes an already-existing kernel measurement phase rather than changing physics/control behavior.

## Compatibility

Existing three-artifact registry rows receive one empty Metrics artifact. The migration disables the existing revision-bump trigger during this mechanical backfill so scientific revision numbers do not change merely because representation gains an empty compulsory artifact.

The three legacy source columns remain compatibility mirrors only for Configuration, Initialization and Controller. Metrics exists only in the canonical artifact array; it does not gain a fourth legacy source column.

Browser/MCP normalization also accepts a legacy three-artifact array and appends empty Metrics before validation/persistence.

## Metrics source model

One compulsory Metrics artifact contains zero or more metric definitions. There is no architectural metric-count maximum.

Initial declaration form:

```python
@metric(id="stable_id", name="Display name", unit=None, sampling=every(0.1))
def stable_id(snapshot):
    ...
    return scalar_value
```

or `sampling=final()`.

Each metric has:

- stable metric ID;
- human-readable name;
- optional unit;
- compiled scalar computation;
- sampling policy.

The first language slice supports scalar/vector arithmetic, local variables, iteration over `snapshot.agents`, and approved pure intrinsics sufficient to express generic aggregate scalar observables. Scientific metric formulas are not supplied by the simulator contract.

## Read-only information boundary

Metric code is a read-only run-level observer. The initial snapshot contract exposes only:

- `snapshot.scientific_time`
- `snapshot.agent_count`
- `snapshot.agents[].position`
- `snapshot.agents[].heading`
- `snapshot.agents[].heading_angle`

Metric code cannot mutate world/agent/action state and cannot access controller-private state, simulator internals, RNG/randomness, filesystem, network, actuator/action APIs, or arbitrary host state.

Approved initial pure intrinsics are `Vec2`, `dot`, `norm`, `abs`, `sqrt`, `pow`, `min`, and `max`.

## Measurement phase

#196 adds the lifecycle vocabulary `measure` and identifies Metrics as a required core read-only executable observer.

Measurement phase ID:

`post-physics-wrapped-state/1`

Semantics: observe the canonical physical state **after one physics integration update and periodic wrapping**, at the resulting `scientific_time`.

This is not a newly invented scientific ordering. The Rust kernel already contains the dormant generic `MetricRuntime` hook at exactly this point in the scheduler. #196 names and versions that existing phase so later metric execution cannot silently choose another timing convention.

Per-metric `every(seconds)` declarations are syntactically validated here; #197 owns exact runtime scheduling and therefore must enforce that requested periods are representable by the simulator clock rather than silently approximating them.

`final()` is likewise declared here and executed only when #197 implements runtime metric collection/finalization semantics.

## Optional artifact relationship

Metrics is **not** an optional executable artifact and does not activate #126.

The four core artifacts have explicit built-in semantics. Optional executable artifact dispatch remains empty and blocked until a genuinely optional executable artifact capability is owner-approved.

## UI state at this boundary

#196 makes Metrics visible/editable as a compulsory artifact using the existing generic artifact editor adapter and includes it in validation/save/load behavior.

It deliberately does not:

- execute compiled Metrics in the simulation worker;
- collect samples;
- render plots;
- persist/export run results;
- add Results panel bindings.

Those remain the separate children #197–#200.

## Scientific guardrail

The contract defines mechanism only. Developer-side implementation must not invent a flocking order parameter or any other scientific metric formula. #201 remains blocked on explicit owner/research-AI scientific definition.
