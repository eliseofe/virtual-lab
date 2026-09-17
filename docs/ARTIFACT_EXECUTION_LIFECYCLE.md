# Artifact execution lifecycle and capability registry

Status: **current architecture, updated 16 September 2026**.

This document defines required vs optional Experiment artifacts, passive vs executable artifacts, lifecycle hooks, and the boundary between one Experiment run and Study-level orchestration.

Read `AGENTS.md`, `CURRENT_STATUS.md`, and `docs/RESEARCH_MODEL.md` first; consult `ROADMAP.md` for longer-term direction.

## 1. Core invariant

Experiment representation is extensible, but execution is explicit:

> An artifact executes only when the active versioned simulator capability contract registers its type/format/compiler, lifecycle phase, scope and semantics.

An AI cannot create executable simulator behavior merely by inventing an artifact name, label, extension or code-looking content.

## 2. Required core artifacts

A runnable Experiment currently requires exactly these four stable core artifact IDs/types:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

They are compulsory in the canonical `artifacts[]` representation (`vlab.experiment-artifacts/3`). An empty `metrics` artifact is valid.

Current meanings:

- `configuration` — declarative Experiment/runtime inputs and experiment-defined parameters;
- `initialization` — fresh-run initialization program;
- `controller` — repeated per-agent local-observation/action program;
- `metrics` — zero or more read-only scientific measurement definitions.

Legacy three-source compatibility may mechanically add/preserve empty Metrics, but the current executable model is four-artifact.

## 3. Optional artifacts

Additional artifacts can exist in the generic representation.

### Passive optional artifacts

A passive artifact may carry rationale, assumptions, notes, documentation or future definitions. It is persisted/versioned/displayed/round-tripped, but never executed merely because its contents resemble code.

### Executable optional artifacts

A future optional artifact becomes executable only after Virtual Lab registers a concrete capability that defines at least:

- stable artifact/capability ID;
- supported language/format/version;
- compiler/validator;
- lifecycle phase;
- execution scope/cadence;
- ordering/dependency semantics;
- information/security boundary;
- capability contract version.

The currently executable scientific artifacts are the required core artifacts above. No arbitrary optional executable artifact may bypass this registry.

## 4. Lifecycle vocabulary

Current lifecycle vocabulary is:

```text
setup -> initialize -> control -> measure -> finalize
```

These are semantic phases, not unrestricted host callbacks.

### `setup`

Once-per-run construction/setup capabilities that must occur before initialized scientific state is finalized. A future registered world/setup artifact could live here, but none is inferred from names such as `world` or `setup`.

### `initialize`

Establishes fresh initial state. The required `initialization` artifact executes in this phase through its constrained simulator-owned interface.

### `control`

Repeated controller evaluation according to simulator-owned scheduling. The required `controller` artifact runs per agent with the declared local observation and returns an action; it does not mutate world state directly.

### `measure`

Read-only scientific observation. The required `metrics` artifact executes here.

Current Metrics measurement phase is versioned as:

`post-physics-wrapped-state/1`

That means metric evaluation observes the canonical physical state after the relevant physics integration update and periodic wrapping, at the resulting scientific time. Metric sampling policy is independent from control/render/persistence schedules.

Metrics may inspect the allowed read-only global snapshot because they are measurement apparatus, not controller perception. They cannot mutate simulation/controller state or use arbitrary RNG/filesystem/network/host state.

### `finalize`

Once-per-run teardown/final measurement semantics where a registered capability requires them. `final()` Metrics are evaluated according to the Metrics runtime contract; this does not grant a free-form unrestricted teardown hook.

## 5. No implicit execution

Forbidden shortcuts include:

- execute every artifact whose format resembles Python;
- infer lifecycle from artifact names such as `world`, `loop`, `analysis` or `control_parameters`;
- let an AI create a new executable artifact type by choosing a string;
- silently move required semantics out of one of the four core artifacts and claim compatibility;
- grant a host/global artifact unrestricted simulator, filesystem, network, RNG or development access;
- treat Results presentation bindings as executable scientific artifact code.

If requested behavior is not registered, the correct result is an unsupported-capability diagnostic/request—not an invented substitute.

## 6. Representation vs execution

The generic representation may contain more artifacts than the runtime understands. For example:

```text
configuration     required / executable
initialization    required / executable
controller        required / executable
metrics           required / executable (may be empty)
rationale         optional / passive
world-note        optional / passive unless a future capability registers it
```

A later capability may make a previously passive type executable only through an explicit versioned contract change. No storage/UI redesign should be required merely because the generic representation already existed.

## 7. World/environment relationship

Environment/world capabilities remain simulator-owned. Future design may either extend the current Initialization/setup capability family or register a dedicated optional world/setup artifact. Either choice requires a typed capability contract and must preserve controller observation boundaries.

A source decomposition change is an explicit interface/version/migration event, not an AI convention.

## 8. Restart and fresh initialization

Do not model ordinary Restart as arbitrary state mutation.

Fresh restart means conceptually:

1. terminate/dispose the current run and perform registered finalization as applicable;
2. create a new run from the exact Experiment revision/configuration/seed semantics;
3. execute setup/initialization;
4. begin normal physics/control/measure execution.

Applying scientific artifact changes creates/restarts under the new definition according to product semantics; silent mid-run hot-swapping is not the baseline.

## 9. Resume/checkpoint belongs to Study orchestration

A future Study may intentionally continue from a saved checkpoint. This is **resume**, not fresh initialization.

Study metadata must identify fresh vs resumed start, source run/checkpoint identity, exact Experiment revision, runtime/capability/compiler versions and deterministic RNG state/semantics where needed.

Whether setup/initialize phases are skipped or re-entered during resume must be explicit/versioned. Never silently pass resumed state through fresh initialization and call it equivalent.

Issue #127 owns this Study-facing seam.

## 10. Experiment vs Study responsibilities

```text
Experiment
    one-run scientific definition
    configuration / initialization / controller / metrics
    setup / initialize / control / measure / finalize
    live single-run Results

Study
    many-run investigation
    pinned Experiment revision(s)
    parameter conditions
    repetitions/seeds
    fresh/resume policy
    aggregation/statistics
    cross-run plots/analysis
```

Studies consume/reuse stable Experiment metric identities and the #199 single-run storage contract. They do not move the existing single-run Metrics definitions out of the Experiment.

## 11. AI-visible capability contract

The machine-readable authoring contract must let a research AI discover without guessing:

- which core artifacts are compulsory;
- which extra artifact forms can be represented;
- which types are executable vs passive;
- what language/compiler/version applies;
- what lifecycle phase/scope/cadence applies;
- what observations/actions/metric snapshot data are allowed;
- what is unsupported and how a Professor may request missing capability.

Current production authoring contract is `vlab.authoring/0.6`; lifecycle request vocabulary includes `measure`.

## 12. Compatibility/versioning

Current core executable contract is the four-artifact model. Any future decomposition that changes required artifacts or where executable responsibilities live must increment relevant interfaces and define explicit migration/compatibility behavior.

Legacy three-source inputs are bounded compatibility only; they may not be used to erase Metrics or regress the current model.

## 13. Security and scientific guardrail

Artifact execution preserves the structural boundary:

- research AI has no GitHub/deployment/shell/admin/simulator-development access;
- controller information remains local-observation/action constrained;
- simulator owns RNG and action application;
- Metrics are read-only observers;
- rendering remains observational;
- global/world hooks receive only declared typed capabilities.

Implementation agents may design lifecycle plumbing, validation, dispatch and software interfaces. They must not independently invent new paper-specific world dynamics, controller laws, metric formulas, parameter meanings or scientific substitutions. Already owner-authorized scientific definitions may be reused exactly as recorded.
