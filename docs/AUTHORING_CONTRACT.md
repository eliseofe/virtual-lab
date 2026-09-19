# Experiment Authoring Contract

Status: **current deployed contract, 19 September 2026**.

Current machine-readable contract: `vlab.authoring/0.7`, exposed by production `experiment-mcp` server `3.9.0`, interface `13`.

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

## Canonical capability ownership and authoring bindings

Canonical semantic capability truth lives in the Supabase canonical capability registry. The registry owns stable capability UUID/key, generic meaning, implementation state/version and minimal publication provenance.

The authoring contract does **not** duplicate that truth. It carries only static references from implemented canonical capability IDs to the existing authoring/runtime surfaces that expose them. The current bindings cover the frozen 11 implemented semantic capabilities and point to existing constructs such as:

- `ARENA_SIZE` for the periodic 2-D world;
- `Motion(forward, turning)` and speed/turn limits for forward/turning kinematics;
- `place(i, x, y, heading)` and `rng.uniform(a, b)` for Initialization;
- controller scalar private state;
- `obs.heading`, `obs.neighbours`, `neighbour.relative_position` and `obs.environmental_scalar`;
- `environmental_scalar(x, y, config)`;
- the current Metrics snapshot fields and `every(...)` / `final()` sampling surfaces.

The simulator/compiler/kernel remain static code and do **not** query Supabase at runtime. Build/static consistency tests tie these bindings to the frozen canonical registry identities so the two layers cannot silently drift.

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

Invalid writes are rejected with structured diagnostics. Low-level compiler categories remain available as evidence, while the public diagnostic classification distinguishes:

- `semantic_capability` — a missing simulator/product semantic mechanism;
- `authoring_language` — restricted-language syntax/expressivity not currently supported;
- `runtime_configuration` — runtime/configuration contract failure;
- `forbidden_security_boundary` — currently forbidden information/action boundary;
- `type_validation` — ordinary syntax/type/validation failure that is not itself an extension request.

When a diagnostic directly represents one of the six durable extension-request classes, it also carries the corresponding `request_class`. This prevents an unsupported language feature from being mislabeled as a simulator semantic capability. Validation does not run the scientific simulation and does not add missing scientific semantics.

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

## Classified extension requests

Student and Professor research-AI sessions use `vlab.capability-request/6`. All six owner-approved request classes may be submitted to the durable Professor-visible workflow:

`semantic_capability | authoring_language | runtime_configuration | artifact_workflow | implementation_optimization | security_boundary`

Professor alone approves/declines. The six-class taxonomy remains the classification layer; semantic canonical identity is resolved later during trusted developer generalization.

No-ID research-AI discovery includes the implemented canonical capability registry plus a sanitized catalog of active `requested | approved | in_progress` extension requests. Research AI reuses an active request whenever its scientific/model meaning can reasonably cover a new requirement. A new request represents a clearly and materially distinct scientific/model ability and is stated primarily in scientific/model language, using source-publication terminology where useful. Multiple papers/blocked Experiments may therefore attach evidence to one request.

Validation diagnostics can advertise the relevant request class when the failure is genuinely an extension need. Ordinary type/validation errors remain ordinary validation evidence.

The continuation rule is part of the authoring contract: when the Lab already represents the intended semantics exactly, author normally. When a required scientific/model semantic is outside the current contract, preserve the intended Experiment and whole-Experiment closure analysis through `request_capability`, keep that work blocked on its durable request state, and resume through `resume_capability_closure` + whole-Experiment `revalidate_capability_closure`. Student and Professor research-AI sessions use the same scientific blocking semantics; a Student resumes/revalidates their own blocked Experiment, while a Professor may also supervise visible blocked Experiments. A closure becomes unblocked only when revalidation finds no unsupported requirement and no unresolved scientific ambiguity.

Professor approval is queue/design approval, not implementation authorization or canonicalization. The standing handoff is:

`research AI durable closure/request/reuse → Professor review → developer generalization + canonical reconciliation → explicit owner implementation approval → trusted implementation/deploy → research AI revalidates the blocked Experiment`

## Security boundary

Experiment-domain AI clients have no GitHub/repository, shell, deployment, arbitrary filesystem, arbitrary SQL, Supabase-admin or simulator-development privilege. They also do not receive general simulator-run/control or raw run-result access merely because they can author Experiment/Results definitions.

## Accepted scientific fixture

The authoring contract itself remains science-neutral. Owner-authorized scientific fixtures used for product acceptance are recorded in `docs/SCIENTIFIC_CONTRACT.md`; they are not generic requirements of `vlab.authoring/0.7`.
