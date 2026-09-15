# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. Detailed historical evidence lives in `PROJECT_STATE.md` and dedicated documents under `docs/`; execution-unit rules live in `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The #147 UI/UX redesign is complete, deployed and browser-verified. The accepted Lab workflow remains:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

The neighbour-search architecture investigation is complete and production now uses the corrected adaptive periodic BVH (`adaptive-periodic-bvh/v1`) through #193 / PR #194. #168 and #178 are closed; #179 remains deferred until Studies exist.

The next major product direction approved by the owner is **Experiment Metrics + live Results**, tracked by #195. Basic scientific measurement and one-run live plotting now belong to the Experiment layer and must not be postponed until Studies exist.

A separate code-authoring ergonomics lane is tracked by #202 so large source artifacts are handled by better editor UX rather than by distorting the scientific artifact model.

## Near-term strategic frontier — #195 Experiment Metrics + live Results

Owner-approved architecture is recorded in:

`docs/EXPERIMENT_METRICS_RESULTS_ARCHITECTURE_2026-09-15.md`

### Approved target Experiment model

A runnable scientific Experiment conceptually has **four compulsory authored artifacts**:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Current production still has the deployed three-core-artifact contract until #196 implements and verifies the migration. The approved target is nevertheless four compulsory artifacts. Existing/legacy Experiments may migrate to a compulsory but empty Metrics artifact, so zero defined metrics remains valid.

Metrics is not optional: measurement is part of the Experiment definition. One compulsory Metrics artifact contains a generic collection of metric definitions; do not create one top-level artifact per metric merely to avoid a large source document. There is no scientific/schema maximum such as 4/6/8 metrics.

Each metric has stable identity plus name, optional unit, computation/source and sampling policy/cadence. Metric execution is a read-only scientific observer and may not mutate simulation state/actions, access unrestricted host internals, filesystem/network or bypass simulator-owned information/RNG boundaries.

The exact measurement point relative to control/physics is scientifically meaningful and must be explicit/versioned. #196 owns that contract; implementation agents must not invent scientific timing or metric formulas.

### Experiment Results vs Studies

**Experiment Results:** what happened during this run?

The Experiment defines metrics, samples them during one run, collects scalar observations associated with scientific/run time and shows live Results.

**Studies:** what happened across runs/conditions?

Studies later orchestrate repeated runs/parameter conditions, consume the same stable metric identities, aggregate/compare results and create cross-run analyses such as box/distribution/density/scatter/ensemble plots.

Therefore basic metrics, one-run collection and live time-series plots come **before** the Study foundation. #3 remains important, but it is not a prerequisite for #195.

### Live Results UI rule

Live Results must stay physically close to the running simulation. Normal metric inspection must not require leaving the Experiment screen, switching browser tabs or opening a separate Results page.

Results presentation uses generic plot panels rather than one chart per metric:

- a panel references one or more stable metric IDs;
- several metrics may share one panel;
- the same metric may appear in more than one panel;
- colors are assigned automatically and remain stable within the active presentation;
- panel arrangement/bindings are presentation/workspace state, not scientific metric definitions, and should not by themselves create a new scientific Experiment revision;
- first visualization type is an interactive time-series line plot.

#198 owns the detailed responsive UI composition.

### Performance rule

Do not destroy the simulator performance gains from #56/#168.

Keep three independent cadences:

1. metric evaluation cadence — scientific sampling/computation;
2. UI refresh/transport cadence — live visualization;
3. persistence flush cadence — buffered local durable writes.

Never synchronously write every metric sample to disk/database on the simulation hot path. Metric samples are buffered; UI transport and persistence happen asynchronously/in batches. The user requested a configurable persistence/save frequency distinct from scientific sampling cadence. #197 owns runtime buffering/transport/performance; #199 owns local persistence/flush/export.

### MCP / research-AI completion rule

#195 is not complete until the deployed Virtual Lab MCP/Connector understands the full four-artifact Experiment and Results binding model.

An authorized research AI must be able to create/amend Configuration, Initialization, Controller, metric definitions in the compulsory Metrics artifact, supported sampling policies and plot-panel bindings by stable metric ID. It receives explicit validation/unsupported-capability diagnostics rather than inventing unsupported metric behavior.

Target workflow:

`paper + research AI → four-artifact Experiment + relevant metrics + sensible initial live Results layout`

The AI authors metric definitions and generic presentation bindings; it does not write browser UI code and receives no GitHub/repository/shell/deployment/admin/simulator-development privileges.

#200 owns this MCP/Connector completion layer.

### First scientific acceptance fixture

#201 will use a flocking order parameter as the first real end-to-end metric fixture. Its mathematical definition and scientifically correct sampling semantics are intentionally **not** invented by developer-side ChatGPT; the owner must provide/approve them before that acceptance ticket executes.

### #195 child sequence

Substantial children, executed one independently deployable/testable ticket at a time:

- **#196 / #195.1** — make Metrics the fourth compulsory Experiment artifact; freeze metric language/validation/read-only execution + measurement timing contract;
- **#197 / #195.2** — multi-metric runtime sampling, buffered transport and performance isolation;
- **#198 / #195.3** — co-located live Results UI with configurable multi-series plot panels;
- **#199 / #195.4** — local single-run result persistence, buffered flush policy, export/provenance;
- **#200 / #195.5** — extend Virtual Lab MCP/Connector to author Metrics and Results bindings end to end;
- **#201 / #195.6** — owner-defined flocking-order-parameter acceptance.

Do not implement #195 monolithically.

## Separate UI/UX lane — #202 code authoring ergonomics

Large Metrics source is an editor problem, not a reason to split the Metrics artifact into arbitrary top-level pieces.

#202 applies to Configuration, Initialization, Controller, Metrics and future authored artifacts. Approved direction includes:

- syntax highlighting;
- semantic highlighting where parser/compiler information supports it;
- line numbers and robust indentation/editing;
- useful styling of comments/decorative separators;
- parser-derived symbol outline/navigation;
- jump-to-definition;
- code folding;
- current symbol/section indication;
- in-artifact search;
- source-linked diagnostics gutter;
- later lightweight contract-derived completion where justified.

Program structure comes from parser/compiler semantics, not magic strings such as `==== PARAMETERS ====`.

Children:

- **#203 / #202.1** — editor foundation + syntax/semantic highlighting;
- **#204 / #202.2** — parser-derived outline/navigation + folding/search;
- **#205 / #202.3** — source-linked diagnostics + constrained-language completion.

#202 is important but separate from #195 scientific/runtime semantics. It may be sequenced when appropriate; do not use it to block the core Metrics contract unnecessarily.

## Neighbour-search architecture — production decision completed

The normal native and WASM `Simulation` neighbour backend is:

`adaptive-periodic-bvh/v1`

The selected `AdaptivePeriodicBvh` preserves exact receiver-side radius membership, arbitrary simultaneous query radii, periodic minimum-image geometry, deterministic sorted neighbour indices and simulator-owned infrastructure geometry. No experiment-visible backend selector or BVH tuning is exposed.

Retained alternatives:

- `PeriodicGridNeighbourIndex` — exact test/reference/fallback, not normal production;
- `BruteForceNeighbourIndex` — hidden correctness/debug oracle;
- multi-resolution periodic grid — benchmark evidence only;
- faithful ARGoS RAB — benchmark/reference only, not separate production spatial backend.

Durable records:

- `docs/NEIGHBOUR_SEARCH_PRODUCTION_INTEGRATION_2026-09-15.md`;
- `docs/NEIGHBOUR_SEARCH_TOURNAMENT_2026-09-15.md`;
- `docs/NEIGHBOUR_SEARCH_RAB_COMPARISON_2026-09-15.md`;
- `docs/NEIGHBOUR_SEARCH_ENVIRONMENT_SIZE_MATRIX_2026-09-15.md`.

#56 remains the living performance umbrella. #179 remains a deferred future reproducible Study and is **not** the next execution ticket.

## Studies / research workflow after #195 foundation

- **#3:** Study epic remains near-term, but the first concrete Study object/workspace foundation child still needs to be decomposed when Studies become the active frontier.
- **#4:** local Study result storage/provenance; downstream of actual Study/run/result implementation. It should reuse/compose the single-run result identities/contracts introduced by #195/#199 rather than inventing an incompatible result layer.
- **#127:** fresh vs resume/checkpoint Study semantics; implement when Study execution becomes real.
- **#6 / #166:** selected Study-result → AI handoff; important after stable Study/result identities exist.
- **#179:** encode neighbour-search benchmark as persistent Study only after Study/results infrastructure is mature.
- **#119 / #120:** Research Notes/Documents and later AI synthesis after stable Study/result identities.

The research model boundary is now: single-run Metrics/Results at Experiment level; cross-run orchestration/aggregation at Study level.

## Parallel product lane — access / acceptance

- **#45 / #162:** production Virtual Lab OAuth/login surface and explicit enrollment policy. Requires owner decision between controlled enrollment and open signup + monitoring before changing admission semantics.
- **#115 / #163:** owner acceptance for collection creation/rename/assignment/moves.
- **#118 / #164:** owner acceptance for artifact-driven authoring workspace.
- **#149:** optional first-paper refinement / optional Showcase decision.

## Parallel research-AI capability requests — approved, design pending

The Professor approved both current Grok capability requests for the informed-robot aggregation experiment on 15 Sep 2026. They remain at developer-design discussion only; approval does not itself authorize implementation.

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`, lifecycle hook `control`. Requirement: generic simulator-owned deterministic/reproducible RNG with different probability distributions.
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`, lifecycle hook `initialize`. Requirement: generic heterogeneous swarm initialization beyond a boolean flag, capable of representing different private information and later heterogeneous sensors/capabilities.

Durable approval record:

`docs/CAPABILITY_APPROVALS_2026-09-15.md`

#57 is the likely generic architecture discussion vehicle for the RNG request. No coding starts until developer design is discussed and the owner explicitly approves implementation.

## Artifact lifecycle implications

#124 remains the artifact capability/lifecycle epic, but the approved #195 target deliberately changes the **core** Experiment from three compulsory artifacts to four. Current production remains three until #196 lands.

Metrics is therefore **not** the concrete optional-executable-artifact use case for #126. #126 remains blocked until a genuinely optional executable artifact type is owner-approved.

#196 must reconcile/version the core artifact and lifecycle contract explicitly rather than routing Metrics through optional artifact dispatch.

## Living architecture / infrastructure parents

- **#2:** scientific validation/reproducibility guardrails; living correctness umbrella.
- **#56:** simulator performance profiling/optimization; living performance umbrella. Neighbour selection itself is complete.
- **#65:** world/environment capabilities and sensor queries; living architecture epic.
- **#124:** artifact capability registry/run lifecycle; core Metrics evolution belongs to #196, while #126 remains blocked for a future genuinely optional executable artifact.
- **#57:** canonical deterministic domain-separated RNG architecture; design candidate for the approved RNG request.
- **#8/#9/#102:** future native/HPC, richer physics/heterogeneity and numerical-integrator evaluation.
- **#145:** global success-only completion stream.

## Professor capability-request loop — durable boundary

Standing flow:

`paper + research AI → Experiment draft → missing capability → durable request → Professor approve/decline → developer design discussion → explicit owner implementation approval → trusted developer handoff → capability implementation/deploy → deployed-contract verification → request implemented → research AI resumes preserved draft`

Responsibility boundary:

- research AI **asks and uses**;
- Professor **decides**;
- developer-side ChatGPT **implements and certifies**.

Professor approval alone never starts engineering. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

#200 extends the authoring surface to Metrics/Results bindings but does not weaken this boundary.

## Scientific / architecture guardrail

While building the simulator, developer-side ChatGPT must not independently invent or derive the scientific model being simulated. Scientific equivalence, paper-specific equations/parameters, controller logic, metric formulas, sampling semantics, retuning and model analysis belong to the Professor/research-AI discussion unless the owner explicitly authorizes scientific reasoning.

Software architecture/performance work may design metric execution plumbing, buffering, persistence, UI transport and editor tooling while preserving exact scientific semantics.

For paper-driven capabilities, apply `docs/CAPABILITY_GENERALIZATION_GATE.md`. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, explicit metric read-only observation boundaries, scientific timing/integration semantics and rendering as an observer unless explicitly approved otherwise.

## Execution granularity — mandatory

Approval breadth is not execution breadth. Default to one substantial independently deployable/testable ticket at a time:

1. implement or measure;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop unless the owner's current message explicitly requests a broader sequence.

Full rule: `docs/EXECUTION_GRANULARITY.md`.

## Success-only durable reporting

GitHub issue #145 is the central success-report stream for ChatGPT-managed `eliseofe/*` work.

- pure discussion/planning: no report;
- failed/retrying/partial work: no success report;
- verified terminal implementation success: append one `[SUCCESS REPORT]` comment.

The current issue/doc creation pass is roadmap/design work, not a terminal deployed implementation and therefore does not emit a success report.

## Source precedence

When sources disagree:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md` for priority/sequencing;
3. `docs/EXPERIMENT_METRICS_RESULTS_ARCHITECTURE_2026-09-15.md` for approved Metrics/Results target architecture;
4. `docs/NEIGHBOUR_SEARCH_PRODUCTION_INTEGRATION_2026-09-15.md` for selected neighbour production architecture;
5. `PROJECT_STATE.md` for accepted deployed technical state/evidence;
6. current design documents;
7. active focused issue scope;
8. older issues/chats as history only.

For Metrics/Results specifically, older statements that all metrics/results/plots belong exclusively to Studies or that the runnable core is permanently exactly three artifacts are superseded by #195 and the Metrics/Results architecture document. Current production remains three artifacts until #196 is implemented/verified.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**Neighbour search is complete and production uses `adaptive-periodic-bvh/v1`. The new near-term product frontier is #195: evolve the Experiment to four compulsory artifacts by adding Metrics, collect multiple read-only metric streams with performance-isolated buffering, show configurable live multi-series Results beside the simulation, persist/export single-run results locally, and extend the MCP/Connector so research AI can author Metrics + plot bindings end to end. #202 separately owns syntax/semantic highlighting and parser-derived code navigation. Studies remain important but basic Metrics/Results now precede them; #179 stays deferred. The two approved Grok aggregation capability requests remain design-pending and not implementation-authorized.**
