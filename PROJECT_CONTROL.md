# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. Detailed accepted technical evidence lives in `PROJECT_STATE.md`; execution-unit rules live in `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The #147 UI/UX redesign is complete and deployed. The accepted Lab workflow remains:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

Neighbour-search architecture is complete and production uses corrected adaptive periodic BVH `adaptive-periodic-bvh/v1` through #193 / PR #194. #168 and #178 are closed; #179 remains deferred until Studies exist.

The active product/scientific frontier is **#195 — Experiment Metrics + live Results**. #196 / #195.1 is now complete and deployed: the canonical Experiment has four compulsory artifacts (`configuration`, `initialization`, `controller`, `metrics`), with an empty Metrics artifact valid for compatibility. The next substantial implementation ticket is **#197 / #195.2 — multi-metric runtime sampling, buffering and performance isolation**.

A separate editor ergonomics lane is #202. A new owner-feedback UI refinement lane is #207. Neither displaces #195 unless the owner explicitly reprioritizes.

## Near-term strategic frontier — #195 Experiment Metrics + live Results

Owner-approved architecture: `docs/EXPERIMENT_METRICS_RESULTS_ARCHITECTURE_2026-09-15.md`.

### Deployed four-artifact foundation — #196 complete

A runnable Experiment now has four compulsory authored artifacts:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Production registry/interface versions are `vlab.registry-experiment/3` and `vlab.experiment-artifacts/3`. Existing three-artifact Experiments were mechanically backfilled with one compulsory empty Metrics artifact without changing their scientific revision numbers.

Metrics is part of the scientific Experiment definition, not an optional executable artifact. One Metrics artifact contains a generic collection of metric definitions; there is no architecture-level maximum such as 4/6/8 metrics.

The deployed authoring/validation contract is `vlab.authoring/0.5`, Experiment interface `7`, artifact-capability contract `vlab.artifact-capabilities/0.3`, Metrics language `python-vlab-metrics/0.1`, Metrics IR `vlab.metrics-ir/0.1`.

Each metric has stable identity, name, optional unit, computation/source and sampling policy/cadence. Metric execution is read-only and cannot mutate simulation state/actions, access controller-private state, unrestricted simulator/host internals, filesystem/network, or bypass simulator-owned information/RNG boundaries.

The measurement lifecycle now includes an explicit `measure` phase. The frozen periodic measurement point is `post-physics-wrapped-state/1`: observe canonical physical state after the physics integration update and periodic wrapping, at the resulting scientific time. This matches the pre-existing dormant kernel metric hook and is now explicit/versioned. Scientific metric formulas and paper-specific sampling intent remain owner/research-AI decisions.

### Current next ticket — #197 / #195.2

Implement multiple metric streams during one run while preserving simulator throughput and deterministic semantics.

Keep three independent cadences:

1. metric evaluation cadence — scientific sampling/computation;
2. UI refresh/transport cadence — live visualization transport;
3. persistence flush cadence — buffered local durable writes.

The hot simulation path may evaluate due metrics and append compact samples to memory, but must not synchronously perform durable storage I/O. UI transport and persistence happen asynchronously/in batches. Performance acceptance must separate unavoidable scientific metric-computation cost from avoidable framework/serialization/transport cost.

#197 must stop at the runtime sampling/buffering/transport foundation. Do not begin #198 live Results UI or #199 persistence inside #197.

### Experiment Results vs Studies

**Experiment Results:** what happened during this run?

An Experiment defines metrics, samples them during one run, collects scalar observations associated with scientific/run time and shows live Results.

**Studies:** what happened across runs/conditions?

Studies later orchestrate repeated runs/parameter conditions, consume the same stable metric identities, aggregate/compare results and create cross-run analyses such as box/distribution/density/scatter/ensemble plots.

Basic metrics and one-run live Results therefore precede the Study foundation. #3 remains important but is not a prerequisite for #195.

### Live Results UI rule — #198

Live Results must remain physically close to the running simulation. Normal metric inspection must not require leaving the Experiment screen, switching browser tabs or opening a separate Results page.

Results use generic plot panels:

- a panel references one or more stable metric IDs;
- several metrics may share one panel;
- the same metric may appear in more than one panel;
- colors are assigned automatically and remain stable within the active presentation;
- panel arrangement/bindings are presentation/workspace state, not scientific metric definitions;
- first visualization type is an interactive time-series line plot.

### Local persistence — #199

Single-run result persistence is local-first. Never synchronously write every metric sample on the simulation hot path. Preserve complete scientific samples according to the declared sampling policy even if rendering uses a reduced display representation for long series.

Persist/export enough provenance to identify the exact Experiment/revision, metric IDs/definitions, sampling policies, scientific/run time, configuration/seed/runtime/capability versions and result/export identity.

### MCP / research-AI completion — #200

#196 deployed the four-artifact Metrics-aware validation/authoring contract, but #195 is not complete until #200 exposes the full intended authoring workflow including fine-grained metric definition operations and Results plot-panel bindings.

Target workflow:

`paper + research AI → four-artifact Experiment + relevant metrics + sensible initial live Results layout`

Research AI authors scientific Experiment artifacts and generic Results bindings through supported contracts. It receives explicit validation/unsupported-capability diagnostics and no GitHub/repository/shell/deployment/admin/simulator-development privileges.

### First scientific acceptance fixture — #201

#201 will use a flocking order parameter as the first real end-to-end metric fixture. Its mathematical definition and scientifically intended sampling semantics are intentionally not invented by developer-side ChatGPT; the owner must provide/approve them before that acceptance ticket executes.

### #195 child sequence

- **#196 / #195.1 — COMPLETE/DEPLOYED** — four compulsory artifacts + Metrics language/validation/read-only execution contract + explicit measurement phase.
- **#197 / #195.2 — NEXT** — multi-metric runtime sampling, buffered transport and performance isolation.
- **#198 / #195.3** — co-located live Results UI with configurable multi-series plot panels.
- **#199 / #195.4** — local single-run result persistence, buffered flush policy, export/provenance.
- **#200 / #195.5** — MCP/Connector fine-grained Metrics + Results binding authoring end to end.
- **#201 / #195.6** — owner-defined flocking-order-parameter acceptance.

Do not implement #195 monolithically.

## Separate editor lane — #202 code-authoring ergonomics

Large Metrics source is an editor problem, not a reason to fragment the Metrics artifact.

Approved direction applies to Configuration, Initialization, Controller, Metrics and future authored artifacts:

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

Program structure comes from parser/compiler semantics, not magic comment strings.

Children: #203 editor foundation/highlighting; #204 outline/navigation/folding/search; #205 diagnostics/completion.

#202 is important but does not block #197.

## Owner-feedback UI/UX refinement lane — #207

The owner reviewed the deployed #147 redesign on 15 Sep 2026. It is a clear improvement but not final. This feedback is durable in #207 and does **not** displace #195 by default.

Highest-priority structural follow-up:

- **#208 / #207.1** — unify the current top Experiment area and bottom Save/Persistence area into one coherent Experiment identity/save/save-as-new/organization flow; remove redundancy and fix action hierarchy, including Organize.
- **#209 / #207.2** — reconcile duplicate-looking Account and Professor entry surfaces; preserve sign-in/out/session controls and Professor capability approvals in one comprehensible account/role model.
- **#210 / #207.3** — global microcopy/typography/responsive hierarchy cleanup: aggressively delete unnecessary tiny explanatory text, enlarge/reposition retained necessary text, strengthen titles/section hierarchy, and design for desktop/mobile rather than uniformly shrinking.

Simulation and Authoring are acceptable structural baselines for this refinement pass. Do not mix #207 structural work into unrelated Metrics/runtime tickets merely because UI files overlap.

## Neighbour-search architecture — production decision complete

Production native/WASM `Simulation` neighbour backend: `adaptive-periodic-bvh/v1`.

It preserves exact receiver-side radius membership, arbitrary simultaneous query radii, periodic minimum-image geometry, deterministic sorted neighbour indices and simulator-owned infrastructure geometry. No experiment-visible backend selector or BVH tuning is exposed.

Retained alternatives:

- `PeriodicGridNeighbourIndex` — exact test/reference/fallback;
- `BruteForceNeighbourIndex` — hidden correctness/debug oracle;
- multi-resolution periodic grid — benchmark evidence only;
- faithful ARGoS RAB — benchmark/reference only.

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

Durable record: `docs/CAPABILITY_APPROVALS_2026-09-15.md`.

#57 is the likely architecture discussion vehicle for RNG. No coding begins until developer design is discussed and the owner explicitly approves implementation.

## Artifact lifecycle implications

#124 remains the artifact capability/lifecycle epic. Production now deliberately has **four required core artifacts**, and lifecycle vocabulary includes explicit `measure` for compulsory Metrics.

Metrics does not activate #126. #126 remains blocked until a genuinely optional executable artifact type is owner-approved.

## Living architecture / infrastructure parents

- **#2:** scientific validation/reproducibility guardrails.
- **#56:** simulator performance profiling/optimization.
- **#65:** world/environment capabilities and sensor queries.
- **#124:** artifact capability registry/run lifecycle.
- **#57:** canonical deterministic domain-separated RNG architecture candidate.
- **#8/#9/#102:** future native/HPC, richer physics/heterogeneity and numerical-integrator evaluation.
- **#145:** global success-only completion stream.

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
5. focused current design docs;
6. active focused issue scope;
7. older issues/chats as history only.

Older statements fixing the runnable core permanently at three artifacts or assigning all Metrics/Results exclusively to Studies are superseded.

## Current one-line status

**#196 is complete and deployed: Virtual Lab now has four compulsory Experiment artifacts with a constrained read-only Metrics contract and explicit `post-physics-wrapped-state/1` measurement phase. The next substantial product ticket is #197: execute multiple metrics with buffered, performance-isolated runtime sampling/transport. #207 records the owner’s next UI refinement round but does not displace #195. #202 remains the separate editor-ergonomics lane; Studies remain downstream of basic one-run Metrics/Results.**