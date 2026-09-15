# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. Detailed accepted technical evidence lives in `PROJECT_STATE.md`; execution-unit rules live in `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The #147 UI/UX redesign is complete and deployed. The accepted Lab workflow remains:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

Neighbour-search architecture is complete and production uses corrected adaptive periodic BVH `adaptive-periodic-bvh/v1` through #193 / PR #194. #168 and #178 are closed; #179 remains deferred until Studies exist.

The active product/scientific frontier is **#195 — Experiment Metrics + live Results**.

- **#196 / #195.1 is complete/deployed:** four compulsory Experiment artifacts plus the constrained read-only Metrics language/contract and explicit measurement phase.
- **#197 / #195.2 is complete/deployed:** validated Metrics IR executes in Rust/WASM with independent per-metric sampling, bounded buffering, batched worker transport, explicit overflow provenance and performance/determinism evidence.
- The next substantial implementation ticket is **#198 / #195.3 — co-located live Results UI with configurable multi-series plot panels**.

A separate editor ergonomics lane is #202. Owner-feedback UI refinement is #207. Neither displaces #195 unless the owner explicitly reprioritizes.

## Near-term strategic frontier — #195 Experiment Metrics + live Results

Owner-approved architecture: `docs/EXPERIMENT_METRICS_RESULTS_ARCHITECTURE_2026-09-15.md`.

### Deployed Experiment + Metrics foundation — #196 complete

A runnable Experiment has four compulsory authored artifacts:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Production registry/interface versions are `vlab.registry-experiment/3` and `vlab.experiment-artifacts/3`. Existing three-artifact Experiments were mechanically backfilled with one compulsory empty Metrics artifact without changing their scientific revision numbers.

Metrics is part of the scientific Experiment definition, not an optional executable artifact. One Metrics artifact contains a generic collection of metric definitions; there is no architecture-level maximum such as 4/6/8 metrics.

Current deployed contracts:

- authoring: `vlab.authoring/0.5`;
- Experiment interface: `7`;
- artifact capabilities: `vlab.artifact-capabilities/0.3`;
- Metrics language: `python-vlab-metrics/0.1`;
- Metrics IR: `vlab.metrics-ir/0.1`;
- metric batch transport: `vlab.metric-sample-batch/0.1`.

Each metric has stable identity, name, optional unit, computation/source and sampling policy/cadence. Metric execution is read-only and cannot mutate simulation state/actions, access controller-private state, unrestricted simulator/host internals, filesystem/network, or bypass simulator-owned information/RNG boundaries.

The measurement lifecycle includes an explicit `measure` phase. The frozen measurement point is `post-physics-wrapped-state/1`: observe canonical physical state after the due physics integration update and periodic wrapping, at the resulting scientific time. Scientific metric formulas and paper-specific sampling intent remain owner/research-AI decisions.

### Deployed multi-metric runtime — #197 complete

#197 executes the already-validated Metrics IR in the Rust/WASM runtime without duplicating physics/controller execution.

Per-metric cadence is preserved exactly. Periodic intervals must be exactly schedulable as integer multiples of `PHYSICS_DT`; an unschedulable interval is rejected rather than rounded. `final()` metrics emit once on explicit run finalization.

The three cadences approved by #195 remain independent:

1. **metric evaluation cadence** — scientific and metric-specific;
2. **worker/UI transport cadence** — approximately 100 ms wall-clock batches, independent of arena rendering;
3. **persistence flush cadence** — not implemented by #197; #199 owns it.

The metric runtime maintains a bounded queue of **262,144 scalar samples**. Ordinary worker transport drains up to **4096 samples per batch**. Overflow is explicit via cumulative dropped-sample count, first dropped scientific time and a `complete` flag; missing samples are never silently represented as complete results.

No synchronous durable storage I/O is performed on the simulation hot path.

Metrics edits use the existing **Apply changes & restart** workflow. #197 deliberately adds no Results visualization.

Accepted runtime/performance record: `docs/METRIC_RUNTIME_FOUNDATION_2026-09-15.md`.

Key #197 evidence:

- exact expected sample counts for tested 20-second runs (200 / 800 / 4,000 / 160 depending on metric count/cadence);
- zero dropped samples in the tested matrix;
- batch serialization/drain measured separately at roughly 0.6–2.9 ms for 160–4,000 samples on CI;
- metric-enabled and zero-metric deterministic trajectories ended in exactly identical state;
- final PR regression/performance workflows green;
- production main build, Pages deployment and deployed-browser smoke green on merge SHA `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`.

### Current next ticket — #198 / #195.3

Build the owner-approved live Results presentation on top of #197's metric-batch stream.

Live Results must stay physically close to the running simulation. Normal metric inspection must not require leaving the Experiment screen, switching browser tabs or opening a separate Results page.

Results use generic plot panels rather than one chart per metric:

- a panel references one or more stable metric IDs;
- several metrics may share one panel;
- the same metric may appear in more than one panel;
- colors are assigned automatically and remain stable within the active presentation;
- panel arrangement/bindings are presentation/workspace state, not scientific metric definitions, and should not create a scientific Experiment revision by themselves;
- first visualization type is an interactive time-series line plot.

#198 consumes the live runtime stream but must not implement #199 durable storage/export or #200 MCP completion.

### Experiment Results vs Studies

**Experiment Results:** what happened during this run?

An Experiment defines metrics, samples them during one run, collects scalar observations associated with scientific/run time and shows live Results.

**Studies:** what happened across runs/conditions?

Studies later orchestrate repeated runs/parameter conditions, consume the same stable metric identities, aggregate/compare results and create cross-run analyses such as box/distribution/density/scatter/ensemble plots.

Basic metrics and one-run live Results therefore precede the Study foundation. #3 remains important but is not a prerequisite for #195.

### Local persistence — #199

Single-run result persistence is local-first. Never synchronously write every metric sample on the simulation hot path. Preserve complete scientific samples according to declared sampling policy even if rendering uses a reduced display representation for long series.

Persist/export enough provenance to identify the exact Experiment/revision, metric IDs/definitions, sampling policies, scientific/run time, configuration/seed/runtime/capability versions and result/export identity.

### MCP / research-AI completion — #200

#195 is not complete until #200 exposes the full intended authoring workflow including metric definitions and Results plot-panel bindings.

Target workflow:

`paper + research AI → four-artifact Experiment + relevant metrics + sensible initial live Results layout`

Research AI authors scientific Experiment artifacts and generic Results bindings through supported contracts. It receives explicit validation/unsupported-capability diagnostics and no GitHub/repository/shell/deployment/admin/simulator-development privileges.

### First scientific acceptance fixture — #201

#201 will use a flocking order parameter as the first real end-to-end metric fixture. Its mathematical definition and scientifically intended sampling semantics are intentionally not invented by developer-side ChatGPT; the owner must provide/approve them before that acceptance ticket executes.

### #195 child sequence

- **#196 / #195.1 — COMPLETE/DEPLOYED** — four compulsory artifacts + Metrics language/validation/read-only execution contract + explicit measurement phase.
- **#197 / #195.2 — COMPLETE/DEPLOYED** — multi-metric runtime sampling, bounded buffering, batched transport and performance isolation.
- **#198 / #195.3 — NEXT** — co-located live Results UI with configurable multi-series plot panels.
- **#199 / #195.4** — local single-run result persistence, buffered flush policy, export/provenance.
- **#200 / #195.5** — MCP/Connector fine-grained Metrics + Results binding authoring end to end.
- **#201 / #195.6** — owner-defined flocking-order-parameter acceptance.

Do not implement #195 monolithically.

## Separate editor lane — #202 code-authoring ergonomics

Large Metrics source is an editor problem, not a reason to fragment the Metrics artifact.

Approved direction applies to Configuration, Initialization, Controller, Metrics and future authored artifacts: syntax/semantic highlighting, line numbers, robust indentation/editing, useful comment styling, parser-derived outline/navigation, jump-to-definition, folding, current-symbol indication, search, source-linked diagnostics and later constrained completion.

Program structure comes from parser/compiler semantics, not magic comment strings.

Children: #203 editor foundation/highlighting; #204 outline/navigation/folding/search; #205 diagnostics/completion.

#202 is important but does not block #198.

## Owner-feedback UI/UX refinement lane — #207

The owner reviewed the deployed #147 redesign on 15 Sep 2026. It is materially improved but not final. This feedback is durable and does **not** displace #195 by default.

- **#208 / #207.1** — unify the current top Experiment area and bottom Save/Persistence area into one coherent Experiment identity/save/save-as-new/organization flow; remove redundancy and fix action hierarchy, including Organize.
- **#209 / #207.2** — reconcile duplicate-looking Account and Professor entry surfaces; preserve sign-in/out/session controls and Professor capability approvals in one comprehensible account/role model.
- **#210 / #207.3** — global microcopy/typography/responsive hierarchy cleanup: delete unnecessary tiny explanatory text, enlarge/reposition necessary text, strengthen titles/section hierarchy, and design for desktop/mobile rather than uniformly shrinking.

Simulation and Authoring remain acceptable structural baselines for this refinement pass. Do not mix #207 structural work into unrelated Metrics/runtime tickets merely because UI files overlap.

## Neighbour-search architecture — production decision complete

Production native/WASM `Simulation` neighbour backend: `adaptive-periodic-bvh/v1`.

It preserves exact receiver-side radius membership, arbitrary simultaneous query radii, periodic minimum-image geometry, deterministic sorted neighbour indices and simulator-owned infrastructure geometry. No experiment-visible backend selector or BVH tuning is exposed.

Retained alternatives: `PeriodicGridNeighbourIndex` as exact reference/fallback; `BruteForceNeighbourIndex` as hidden correctness oracle; multi-resolution periodic grid and faithful ARGoS RAB as benchmark/reference only.

#56 remains the living performance umbrella. #179 remains a deferred future reproducible Study and is not the current execution ticket.

## Studies / research workflow after #195

- **#3:** Study epic; decompose the first concrete Study object/workspace foundation when Studies become active.
- **#4:** local Study result storage/provenance; compose the single-run identities/contracts from #195/#199 rather than creating an incompatible result layer.
- **#127:** fresh vs resume/checkpoint Study semantics.
- **#6 / #166:** selected Study-result → AI handoff after stable Study/result identities exist.
- **#179:** encode neighbour benchmark as a persistent Study only after Study/results infrastructure is mature.
- **#119 / #120:** Research Notes/Documents and later AI synthesis after stable Study/result identities.

Boundary: one-run Metrics/Results at Experiment level; cross-run orchestration/aggregation at Study level.

## Parallel product/access lane

- **#45 / #162:** production OAuth/login surface and explicit enrollment policy; owner decision still needed before changing admission semantics.
- **#115 / #163:** owner acceptance for collection creation/rename/assignment/moves.
- **#118 / #164:** owner acceptance for artifact-driven authoring workspace.
- **#149:** optional first-paper refinement / Showcase decision.

## Parallel research-AI capability requests — approved, design pending

The Professor approved both current informed-robot aggregation capability requests on 15 Sep 2026. Approval authorizes design discussion only, not implementation.

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`, hook `control`: generic simulator-owned deterministic/reproducible RNG with multiple probability distributions.
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`, hook `initialize`: generic heterogeneous swarm initialization beyond a boolean flag, extensible toward different private information/sensors/capabilities.

Durable record: `docs/CAPABILITY_APPROVALS_2026-09-15.md`. #57 is the likely architecture discussion vehicle for RNG. No coding begins until developer design is discussed and the owner explicitly approves implementation.

## Artifact lifecycle implications

#124 remains the artifact capability/lifecycle epic. Production deliberately has four required core artifacts, and lifecycle vocabulary includes explicit `measure` for compulsory Metrics.

Metrics does not activate #126. #126 remains blocked until a genuinely optional executable artifact type is owner-approved.

## Professor capability-request boundary

Standing flow:

`paper + research AI → Experiment draft → missing capability → durable request → Professor approve/decline → developer design discussion → explicit owner implementation approval → trusted developer handoff → capability implementation/deploy → deployed-contract verification → request implemented → research AI resumes preserved draft`

Research AI asks/uses; Professor decides; developer-side ChatGPT implements/certifies. Professor approval alone never starts engineering. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

## Scientific / architecture guardrail

Developer-side ChatGPT must not independently invent or derive the scientific model being simulated. Scientific equivalence, paper-specific equations/parameters, controller logic, metric formulas, paper-specific sampling semantics, retuning and model analysis belong to the Professor/research-AI discussion unless explicitly authorized.

Software architecture/performance work may design metric execution plumbing, buffering, persistence, UI transport and editor tooling while preserving exact scientific semantics. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, explicit metric read-only observation boundaries, scientific timing/integration semantics and rendering as an observer.

## Execution granularity — mandatory

Approval breadth is not execution breadth. Default to one substantial independently deployable/testable ticket at a time:

1. implement or measure;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop before the next substantial ticket unless the owner's current message explicitly requests a broader sequence.

Full rule: `docs/EXECUTION_GRANULARITY.md`.

## Success-only durable reporting

Issue #145 is the central success-report stream for ChatGPT-managed `eliseofe/*` work.

- pure discussion/planning: no report;
- failed/retrying/partial work: no success report;
- verified terminal implementation success: append one `[SUCCESS REPORT]` comment.

## Source precedence

When sources disagree:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md` for priority/sequencing;
3. `docs/EXPERIMENT_METRICS_RESULTS_ARCHITECTURE_2026-09-15.md` for the Metrics/Results architecture;
4. `PROJECT_STATE.md` for accepted deployed technical state/evidence;
5. focused current design/evidence docs, including `docs/METRIC_RUNTIME_FOUNDATION_2026-09-15.md`;
6. active focused issue scope;
7. older issues/chats as history only.

Older statements fixing the runnable core permanently at three artifacts or assigning all Metrics/Results exclusively to Studies are superseded.

## Current one-line status

**#196 and #197 are complete/deployed: Virtual Lab has four compulsory Experiment artifacts, a constrained read-only Metrics contract, exact versioned measurement timing, and a performance-isolated multi-metric runtime with bounded buffering and batched sample transport. The next substantial product ticket is #198: show those live metric streams in co-located configurable multi-series Results panels. #207 records the owner’s next UI refinement round but does not displace #195; #202 remains the separate editor-ergonomics lane; Studies remain downstream of basic one-run Metrics/Results.**
