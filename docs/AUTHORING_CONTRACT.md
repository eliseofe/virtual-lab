# Experiment Authoring Contract

Status: **current deployed contract, 16 September 2026**.

Current machine-readable contract: `vlab.authoring/0.6`, exposed by production `experiment-mcp` server `3.0.0`, interface `8`.

## Canonical Experiment artifacts

A runnable Experiment has exactly four compulsory core artifacts:

1. **Configuration** — restricted Python-like assignments; generic runtime/configuration inputs and experiment-defined parameters.
2. **Initialization** — restricted Python-like initialization program; simulator-owned initialization RNG and placement/state construction.
3. **Controller** — `python-vlab/0.1`; local observation → action program compiled before execution.
4. **Metrics** — `python-vlab-metrics/0.1`; zero or more read-only scientific metric definitions in one compulsory artifact.

The canonical registry representation is the ordered typed `artifacts[]` array under `vlab.experiment-artifacts/3` / `vlab.registry-experiment/3`.

An empty Metrics artifact is valid. Legacy three-source clients remain supported only as a bounded compatibility input; they normalize mechanically to the four-artifact model by adding/preserving Metrics. They are not a second source of truth.

## Science-free software contract boundary

The authoring contract contains **no paper-specific model, reference experiment, metric formula, scientific parameter values or scientific interpretation**. Its job is to describe what the Virtual Lab software can represent and validate.

The contract may describe:

- artifact/language/compiler versions;
- grammar and accepted source structure;
- simulator-owned runtime requirements;
- observation/action/intrinsic capabilities;
- Metrics read-only snapshot capabilities;
- lifecycle/measurement semantics;
- forbidden capabilities;
- diagnostic categories;
- execution/security boundaries;
- Results-presentation binding structure.

Scientific content comes from the researcher/research-AI workflow. Developer-side tooling validates support; it must not invent a substitute scientific model when requested semantics are unsupported.

## Validation path

AI-authored Experiment writes use server-side **compile-without-simulation** validation aligned with the production browser/compiler contracts.

Validation covers, as applicable:

- configuration parsing and generic runtime requirements;
- initialization parsing/evaluation under simulator-owned validation semantics;
- initial-state/runtime compatibility;
- controller parsing/type/capability validation;
- environment/controller compatibility for registered environment capabilities;
- Metrics parsing/type/capability validation;
- stable metric IDs, name/unit metadata and supported sampling declarations.

Invalid writes are rejected with structured diagnostics. Validation does not run the scientific simulation and does not add missing scientific semantics.

## Metrics contract

Metrics is compulsory as an Experiment artifact because measurement is part of the single-run Experiment definition. Its content may be empty.

Current language: `python-vlab-metrics/0.1`.

Current IR: `vlab.metrics-ir/0.1`.

Current measurement phase: `post-physics-wrapped-state/1`.

Metric declaration shape:

```python
@metric(id="stable.id", name="Display name", unit=None, sampling=every(0.1))
def metric(snapshot):
    ...
    return scalar
```

Supported sampling forms are periodic `every(seconds)` and `final()`, subject to runtime exact-schedulability rules.

Metrics observe a versioned read-only global snapshot. Current snapshot fields include scientific time, agent count and agent position/heading information required by the Metrics contract. This global measurement access does **not** become controller perception. Metrics cannot mutate simulation state, use arbitrary RNG, access controller-private state, filesystem, network or unrestricted simulator internals.

## Fine-grained MCP authoring

The deployed `author_metrics_results` tool supports:

- `read`
- `create_metric`
- `update_metric`
- `remove_metric`
- `upsert_panel`
- `remove_panel`

Metric updates preserve stable metric identity. Changing an ID requires explicit remove/create. Removing a metric prunes saved Results bindings that refer to it.

Whole-Experiment `create_experiment` / `edit_experiment` remain available for canonical artifact-array authoring. Fine-grained metric edits should use `author_metrics_results` so unrelated artifacts are not rewritten.

## Results presentation contract

Results presentation is **not** part of the scientific Experiment revision.

Schema: `vlab.results-presentation/1`.

Initial supported panel type: `time-series`.

A panel has a stable presentation-local ID and an ordered non-empty list of stable metric IDs. Multiple metrics can share a panel; the same metric can appear in multiple panels.

Presentation state has its own optimistic revision. Changing panels therefore does not increment the scientific Experiment revision. The browser loads saved connector-authored presentation state when present; otherwise it uses the normal Lab default layout.

No arbitrary plotting code is accepted through the MCP contract.

## Capability requests

Unsupported simulator capabilities are not emulated by the authoring layer.

For Professor users, supported validation paths can expose the durable `vlab.capability-request/1` request workflow. The lifecycle-hook vocabulary includes:

```text
setup | initialize | control | measure | finalize
```

Professor approval of a capability request is not implementation authorization. The standing handoff remains:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted implementation/deploy → research AI resumes`

## Security boundary

Experiment-domain AI clients have no GitHub/repository, shell, deployment, arbitrary filesystem, arbitrary SQL, Supabase-admin or simulator-development privilege. They also do not receive general simulator-run/control or raw run-result access merely because they can author Experiment/Results definitions.

## Current accepted scientific fixture

The contract itself remains science-neutral. Separately, the product has an owner-authorized Active Elastic acceptance fixture used by #198/#201:

- `polarization`
- `psi = ||sum_i heading_i|| / N`
- sampled every 0.1 s for Virtual Lab acceptance/display

That scientific definition is recorded in `PROJECT_CONTROL.md` / `PROJECT_STATE.md`, not embedded as a generic requirement of `vlab.authoring/0.6`.
