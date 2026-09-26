# Experiment Authoring Contract

Status: **current contract candidate, 20 September 2026**.

Current machine-readable contract: `vlab.authoring/0.15`, exposed by production `experiment-mcp` server `3.25.0`, interface `17`. Since #577 all code artifacts share one grammar (`code_grammar`): `//` (floor division) and `%` (remainder with the sign of the divisor) on scalars, and `and`/`or`/`not` on booleans with both sides of `and`/`or` always evaluated; `for NAME in range(...)` loops over run constants (numbers and parameters) in the Controller and Metrics; every code artifact, Initialization included, is type-checked before it runs (`code_grammar.static_checking`). Robots are anonymous (D-022): heterogeneity is declared in Initialization as exact groups, each naming its dimension (`group(...)`, `rest_of_group(...)`, `within=`), to which read-only traits (`set_trait(...)`, Controller `NAME = trait(default)`) and sensors (`equip(...)`) attach (D-023; full guide in `docs/HETEROGENEITY_GUIDE.md`), and the Controller cannot read `N`, `ARENA_SIZE` or `EXPERIMENT_DURATION`.

## Canonical Experiment artifacts

A runnable Experiment has exactly four compulsory core artifacts:

1. **Configuration** — restricted Python-like assignments; generic runtime/configuration inputs and experiment-defined parameters.
2. **Initialization** — restricted Python-like initialization program; simulator-owned initialization RNG and placement/state construction.
3. **Controller** — `python-vlab/0.1`; local observation → action program compiled before execution.
4. **Metrics** — `python-vlab-metrics/0.1`; zero or more read-only scientific metric definitions in one compulsory artifact.

The canonical registry representation is the ordered typed `artifacts[]` array under `vlab.experiment-artifacts/3` / `vlab.registry-experiment/3`.

An empty Metrics artifact is valid. The complete ordered typed `artifacts[]` array is the only Experiment-authoring input. Configuration, Initialization, Controller and Metrics must all be supplied explicitly when creating or replacing scientific source.

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

## Authoring skeleton and capability ownership

The authoring contract defines the stable **language/compiler skeleton**: artifact structure, parser/entry-point rules, generic language intrinsics, runtime/measurement invariants, diagnostics and security boundaries.

It does **not** contain the exhaustive list of currently available robot/scientific capabilities.

Canonical semantic capability truth lives in the Supabase capability registry. Each implemented capability is joined at discovery time with its static build-time **authoring surfaces**: the concrete configuration symbol, observation field, action constructor, initializer intrinsic, environment entry, Metrics snapshot field or sampling constructor through which that capability is authored.

Examples of current capability-owned surfaces include:

- `ARENA_SIZE` for the periodic 2-D world capability;
- `Motion(forward, turning)` and its speed/turn limits for forward/turning kinematics;
- `place(...)` and `rng.uniform(...)` for Initialization capabilities;
- controller private scalar state;
- `obs.heading`, `obs.neighbours`, `neighbour.relative_position` and `obs.environmental_scalar`;
- `environmental_scalar(x, y, config)`;
- the implemented Metrics scientific-snapshot surfaces and sampling constructors.

Metrics snapshot surfaces follow the same capability-ownership rule as Controller observations. The compiler derives static snapshot fields/functions from implemented capability bindings, then adds Experiment-specific projections such as declared configuration names, named references and authored per-agent private scientific state. The runtime consumes the single read-only `vlab.scientific-snapshot/0.1` boundary rather than a Metrics-specific list of kernel fields.

The stable Controller language therefore describes forms such as `step(self, obs)`, arithmetic, assignments, loops and capability-backed references/actions. It does not freeze today's observation/action inventory into the language contract.

The simulator/compiler/kernel remain static code and do **not** query Supabase at runtime. Browser and edge validation consume byte-identical static implemented-capability bindings, while production discovery checks those bindings against the canonical registry. A surface absent from the implemented capability set is rejected.

Controller stochastic sampling is available only through the implemented simulator-owned capability `controller.stochastic_distributions`. Its versioned distribution contract is `vlab.controller-stochasticity/1`: `rng.uniform(a, b)`, `rng.bernoulli(p)`, and `rng.normal(mean, stddev)`. Each agent has an independent deterministic controller stream derived from the run seed under `vlab.rng/splitmix64-domain/1`; reset/replay reconstructs the exact streams. Raw stream access, reseeding and host-language/global random APIs remain forbidden. Host filesystem/network access remains a separate security boundary.

Scientific randomness itself is governed by the versioned simulator contract in `RNG_CONTRACT.md`. The current contract is `vlab.rng/splitmix64-domain/1`: Initialization and simulator sensing randomness are separate deterministic domains derived from the run seed, and the controller domain is reserved but not yet authorable. A stochastic draw in one domain cannot advance another domain's stream.

## Generic scientific mathematics substrate

Standard scalar mathematics is language substrate rather than a scientific capability. The bounded authoring languages expose exponentiation `**` plus `abs, sqrt, exp, log, sin, cos, tan, asin, acos, atan, atan2, floor, ceil, pow, min, max` wherever scalar expressions are supported.

`**` is canonicalized to the same power operation as `pow(base, exponent)`; it is not a second numerical implementation. Rust-backed artifacts execute these operations through native `f64` functions.

This vocabulary is intentionally independent of any specific paper. Scientific capabilities continue to describe observations, actions, environment semantics, heterogeneous state, stochastic services, or other model-domain abilities—not generic algebra or trigonometry.

## Heterogeneity as groups (#577, D-022, D-023)

The complete authoring rules, with examples, are in `docs/HETEROGENEITY_GUIDE.md`; the MCP contract carries the same rules as `initialization.groups`. In short:

- **Who differs.** `group(name, fraction= | count=, dimension=, within=, placement=)` and `rest_of_group(name, dimension=, within=, placement=)` split the swarm (or, with `within=`, one group) into groups of exact size. Every declaration names its dimension; separate dimensions are independent, nested splits give exact joint counts. Capability `initialization.swarm_groups`.
- **What differs.** `set_trait(group, trait, value)` gives a group a trait (number or True/False) that the Controller declares as `NAME = trait(default)` and may only read (capability `initialization.per_agent_private_state_assignment`); `equip(group, reference, range=)` gives a group a reference sensor (capability `observation.named_reference_relative_position`). `"all"` names every robot.
- **Checks.** Sizes add up per split; no robot receives the same trait or sensor from two groups; traits are declared as traits with the matching type and never assigned by the robot.
- **Binding.** Random groups are dealt per split from initialization stream `1 + split order`, so placement draws (stream 0) are unaffected; explicit groups (whole-swarm dimensions only) are placed with `place(..., group=)`.
- The Rust runtime receives per-agent trait values and sensor lists; traits are stored as numbers, True/False as 1/0 read back as booleans, and the runtime also rejects writes to traits.
- Retired, with errors naming the replacement: `set_agent_state`, `role`, `role_count`, `set_state`, `rest=True`, `partition=`, `set_agent_reference_sensor`.

## Generic Controller control-flow substrate

Controller authoring includes typed booleans, scalar comparisons, `and/or/not`, and `if/elif/else` as generic language substrate. These constructs are not scientific capabilities and do not require capability requests.

Definite-assignment analysis follows control flow: branch-local values may escape an `if` only when every continuing path defines them consistently. The action-return invariant also understands exhaustive conditional returns.

Iteration remains capability-backed and bounded; the current Controller loop domain is the implemented neighbour collection.

## Generic Metrics control-flow substrate

Metrics uses the same bounded boolean/control-flow vocabulary as Controller for read-only scientific measurement definitions:

- boolean literals `True` and `False`;
- scalar comparisons `< <= > >= == !=`;
- boolean composition with `and`, `or` and `not`;
- `if / elif / else`;
- branch-aware definite assignment for scalar/vector locals;
- bounded iteration over capability-backed snapshot collections, currently `snapshot.agents`.

A local introduced by conditional branches is available afterward only when every continuing path defines it with the same type. An exhaustive conditional may satisfy the metric scalar-return requirement when every branch returns a scalar.

This does not widen the Metrics information boundary: Metrics remains read-only and cannot access controller-private state, unavailable snapshot fields, filesystem/network, simulator internals or arbitrary iterables.

## Canonical IR parity

For executable artifacts, successful source compilation is not by itself the execution boundary. The compiler must emit the canonical IR vocabulary accepted by the Rust/WASM runtime.

Routine source aliases remain authorable, but collection/iteration aliases are normalized before IR crosses the runtime boundary. In particular:
- Controller neighbour-list aliases lower to canonical `obs.neighbours` iteration;
- Metrics agent-list aliases lower to canonical `snapshot.agents` iteration, and loop-agent aliases lower to the canonical loop binding.

The basic mathematical surface remains deliberately ordinary: scalar/vector assignment, `+ - * /`, unary negation, vector primitives and the registered mathematical intrinsics such as `pow`, `sqrt`, `min` and `max` where the artifact language advertises them.

Controller validation also requires an unconditional top-level `Motion` return so a syntactically accepted controller cannot fail merely because a neighbour loop executes zero times.

Browser and MCP compilers are mirrored and covered by parity regressions together with the Rust runtime tests. This is a hard authoring invariant: source-changing writes may be persisted only through that validated compiler path.

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

Metrics observe a versioned read-only global snapshot. The currently implemented Metrics capability advertises scientific time, agent count and agent position/heading fields through its capability-owned authoring surfaces. This global measurement access does **not** become controller perception. Metrics cannot mutate simulation state, use unavailable capabilities, access controller-private state, filesystem, network or unrestricted simulator internals.

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

Student and Professor research-AI sessions use `vlab.capability-request/11`. All six owner-approved request classes may be submitted to the durable Professor-visible workflow:

`semantic_capability | authoring_language | runtime_configuration | artifact_workflow | implementation_optimization | security_boundary`

Professor alone approves/declines. The six-class taxonomy remains the classification layer; semantic canonical identity is resolved later during trusted developer generalization.

No-ID research-AI discovery keeps four concepts separate: the stable authoring/platform contract; implemented canonical capabilities with their concrete authoring surfaces; unavailable candidate capabilities; and unavailable candidate contract deltas. Implemented support alone drives authoring acceptance.

A new semantic request is born as a complete candidate capability: stable key/domain/name, scientific/model definition, target artifact/runtime domain, and the concrete authoring surfaces needed to express it. A request in any of the other five classes is born as a candidate contract delta against a precise path in the stable authoring/platform contract. Candidate availability is explicitly unavailable; creating or reusing one never changes compiler validation.

Research AI reuses a candidate when it covers a new requirement and attaches the new paper/Experiment evidence to the same durable request. When a candidate is plausibly related but too narrow or ambiguous, research AI attaches `generalization_needed` evidence to that same candidate for Professor action rather than creating a parallel request. Only a requirement genuinely absent from both implemented and candidate surfaces creates one new candidate/request. Candidate identity survives requested, approved, declined and in-progress lifecycle states until explicitly superseded by implementation or owner-governed resolution.

Validation diagnostics can advertise the relevant request class when the failure is genuinely an extension need. Ordinary type/validation errors remain ordinary validation evidence.

The continuation rule is part of the authoring contract: classify every identified paper/Experiment requirement before request creation. A supported requirement records machine-readable references to implemented canonical capabilities and/or stable contract paths and creates no request. An unsupported requirement must link to a reused/new unavailable candidate request. A scientifically ambiguous requirement stays explicit and blocking without a request. If any unsupported or ambiguous requirement remains, preserve the intended Experiment and whole-Experiment closure analysis through `request_capability`; resume through `resume_capability_closure` + whole-Experiment `revalidate_capability_closure`. Student and Professor research-AI sessions use the same scientific blocking semantics; a Student resumes/revalidates their own blocked Experiment, while a Professor may also supervise visible blocked Experiments. A closure becomes unblocked only when revalidation finds no unsupported requirement and no unresolved scientific ambiguity.

Professor approval is queue/design approval, not implementation authorization or canonicalization. The standing handoff is:

`research AI durable closure/request/reuse → Professor review → developer generalization + canonical reconciliation → explicit owner implementation approval → trusted implementation/deploy → research AI revalidates the blocked Experiment`

## Security boundary

Experiment-domain AI clients have no GitHub/repository, shell, deployment, arbitrary filesystem, arbitrary SQL, Supabase-admin or simulator-development privilege. They also do not receive general simulator-run/control or raw run-result access merely because they can author Experiment/Results definitions.

## Accepted scientific fixture

The authoring contract itself remains science-neutral. Owner-authorized scientific fixtures used for product acceptance are recorded in `docs/SCIENTIFIC_CONTRACT.md`; they are not generic requirements of `vlab.authoring/0.15`.
