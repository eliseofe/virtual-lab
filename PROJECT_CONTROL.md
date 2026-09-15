# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. Detailed historical evidence lives in `PROJECT_STATE.md` and the dedicated documents under `docs/`; execution-unit rules live in `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The #147 UI/UX redesign is complete, deployed and browser-verified. The accepted Lab workflow is:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

The backlog was audited on 15 Sep 2026. Historical Round-1/integration shells #1, #14–#18, #46, #52 and completed capability epic #58 are closed. Remaining work is organized around focused parents/children rather than issue recency.

## Neighbour-search architecture — production decision completed

The #168 comparative neighbour-search investigation converged through #169–#178 and the owner-approved production integration #193 / PR #194.

### Production backend

The normal native and WASM `Simulation` neighbour backend is:

`adaptive-periodic-bvh/v1`

The selected `AdaptivePeriodicBvh` preserves the established generic receiver-radius contract:

- exact receiver-side radius membership;
- arbitrary query radii without constructing tree geometry from a scientific radius;
- periodic minimum-image geometry;
- deterministic sorted neighbour indices;
- one simulator-owned rebuild at each control update;
- no experiment-visible backend selector or BVH tuning parameters.

The production implementation is the corrected #185 design: deterministic widest-AABB-axis median splits, conservative periodic broad-phase pruning with scale-aware floating-point slack, and the exact minimum-image distance test as the authoritative membership decision.

Production provenance is exposed as the stable strategy identifier only. Native `Simulation`, WASM `ProbeSimulation`, the kernel-level provenance function and worker runtime/profile messages can report `adaptive-periodic-bvh/v1`. Leaf capacity, depth and other index internals remain simulator infrastructure.

### Retained alternatives

- `PeriodicGridNeighbourIndex` remains a separate exact test/reference/fallback implementation. It is no longer the normal production backend.
- `BruteForceNeighbourIndex` remains hidden correctness/debug infrastructure only.
- The multi-resolution periodic grid remains benchmark evidence and is not a production backend.
- Faithful ARGoS RAB remains benchmark/reference evidence. There is no separate production ARGoS-style spatial backend; future transmitter-owned routing should use the selected generic exact spatial infrastructure unless a future communication capability requires different semantics.

Durable integration record:

`docs/NEIGHBOUR_SEARCH_PRODUCTION_INTEGRATION_2026-09-15.md`

## Evidence sequence behind the production decision

### #165 — density/resolution measurement

The original approximately-one-cell-per-agent periodic grid can incur avoidable bucket traversal when a query radius spans many small cells. Radius-matched diagnostic grids were often much faster in those sweeps, but scientific radius was explicitly rejected as a global generic index-definition parameter.

Detailed evidence:

`docs/PERFORMANCE_NEIGHBOUR_DENSITY_2026-09-15.md`

### #169 — common exact benchmark contract

#169 / PR #170 froze the common receiver-radius comparison contract before candidate implementation:

- single and simultaneous multiple radii;
- wide radius ratios;
- uniform, clustered and periodic-boundary occupancy;
- one rebuilt candidate serving the ordered radius set;
- exact brute-force equality before timing.

Durable artifacts:

- `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md`;
- `benchmarks/neighbour_search_matrix.json`;
- `crates/kernel/examples/neighbour_strategy_benchmark.rs`.

### #171 — fixed-halo generic adaptation rejected

The fixed-halo stamping + receiver-side multi-cell scan adaptation was exact but slow because of duplicate candidate amplification. It was not faithful ARGoS RAB and was removed from active candidate code.

Historical evidence:

`docs/NEIGHBOUR_SEARCH_FIXED_HALO_ADAPTATION_RESULT_2026-09-15.md`

### #173 — faithful ARGoS RAB transcription

#173 / PR #180 implemented benchmark-only faithful transmitter-owned Range-and-Bearing spatial routing based on maintained ARGoS behavior: range-independent grid resolution, transmitter coverage insertion, receiver point lookup, one candidate-pair distance calculation, and directional transmitter-range tests.

Durable result:

`docs/NEIGHBOUR_SEARCH_ARGOS_RAB_RESULT_2026-09-15.md`

### #174 — multi-resolution periodic grid

The exact hierarchy preserved radius-independent infrastructure geometry and supported arbitrary simultaneous query radii, but paid substantial rebuild/storage cost. It remained a serious candidate through the common tournament rather than being promoted from its own smoke benchmark.

Durable result:

`docs/NEIGHBOUR_SEARCH_MULTI_RESOLUTION_RESULT_2026-09-15.md`

### #175 / #185 — adaptive periodic BVH

#175 introduced the deterministic balanced periodic BVH. #185 later corrected a floating-point periodic-boundary broad-phase omission found by the larger #176 tournament. The correction made pruning conservative while leaving exact minimum-image final membership authoritative; an exhaustive N=5,000 periodic-boundary regression checked 25,000 queries over radii 0.1, 0.25, 1, 4 and 10 against brute force.

Durable result:

`docs/NEIGHBOUR_SEARCH_ADAPTIVE_BVH_RESULT_2026-09-15.md`

### #176 — common generic tournament

Three retained attempts over 34 scaling/crossover scenarios produced median winners:

- adaptive periodic BVH: **26/34**;
- multi-resolution periodic grid: **5/34**;
- original current periodic grid: **3/34**.

The tournament showed no universal winner but made BVH the strongest broad/default candidate. The current grid retained narrow low-overhead crossover regions; multi-resolution retained some specialized wide-radius wins.

Durable result:

`docs/NEIGHBOUR_SEARCH_TOURNAMENT_2026-09-15.md`

### #177 — faithful transmitter-range RAB comparison

Under the same directed transmitter-owned-range relation, combined rebuild+route winners were:

- BVH generic adapter: **23/34**;
- faithful ARGoS RAB: **5/34**;
- current periodic-grid adapter: **3/34**;
- multi-resolution adapter: **3/34**.

Faithful ARGoS remained competitive for a few simple modest-range cases but suffered strong coverage-stamping storage/rebuild amplification. This removed the performance case for a separate production RAB spatial backend.

Durable result:

`docs/NEIGHBOUR_SEARCH_RAB_COMPARISON_2026-09-15.md`

### #191 — independent environment-size 2×2×2×2 decision matrix

#191 / PR #192 removed the remaining environment-size/local-density confound by keeping the occupied swarm footprint fixed while independently changing periodic environment extent.

At **high scale**, all eight winners were stable across all three runs:

- BVH: **7/8**;
- original current grid: **1/8**;
- multi-resolution: **0/8**.

The only robust non-BVH high-scale cell was low environment + low local density + single radius, where the current grid beat BVH by 1.43×. Holding N, local spacing and radius fixed but increasing the environment side 4× flipped that controlled pair to BVH, which beat second-place multi-resolution by 1.42×. Thus the isolated grid crossover did not justify multiple normal production engines or an automatic/user-visible selector.

Durable result:

`docs/NEIGHBOUR_SEARCH_ENVIRONMENT_SIZE_MATRIX_2026-09-15.md`

### #178 / #193 — production integration

Owner decision: the evidence is sufficient to select one normal backend. #193 / PR #194 promotes the corrected exact adaptive periodic BVH into the production kernel, switches native/WASM `Simulation` to it, preserves the former grid as reference/fallback infrastructure, exposes stable provenance, and introduces no user-visible selector or tuning.

The production integration is accepted only with green Rust/native exactness, WASM/browser performance regression, generic/canonical/RAB regressions, Pages deployment, functional deployed-browser smoke and responsive/focus smoke.

#168 and #178 close after that verified integration. #179 remains a separate deferred future Study and is not part of the production switch.

## Performance frontier after neighbour-search integration

- **#56:** remains the living performance umbrella.
- **#168:** comparative neighbour-search architecture investigation is complete after #193 verification.
- **#179 / #168.9:** persistent neighbour-search scalability benchmark as a reproducible Study is deferred until Studies/results infrastructure is mature.

Do not re-open backend selection from isolated microbenchmarks without new materially different evidence or semantics.

## Near-term parallel product/research lanes

- **#45 / #162:** production Virtual Lab OAuth/login surface and explicit enrollment policy. Current Supabase baseline at audit time had only the owner Professor + Student test identities.
- **#3 / #4:** Studies and local result/provenance infrastructure.
- **#6 / #166:** first explicit selected Study-result → AI handoff contract.
- **#119 / #120:** Research Notes/Documents and later AI synthesis; important near-future work after stable Study/result identities.
- **#115 / #163:** owner acceptance for collection creation/rename/assignment/moves.
- **#118 / #164:** owner acceptance for artifact-driven authoring workspace.
- **#149:** optional first-paper refinement / optional Showcase decision.

## Parallel research-AI capability requests — approved, design pending

The Professor approved both current Grok capability requests for the informed-robot aggregation experiment on 15 Sep 2026. They are at the **developer-design discussion** stage only; approval does not itself authorize implementation.

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`, lifecycle hook `control`. Requirement: generic simulator-owned deterministic/reproducible RNG with different probability distributions.
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`, lifecycle hook `initialize`. Requirement: generic heterogeneous swarm initialization beyond a boolean flag, capable of representing different private information and later heterogeneous sensors/capabilities.

Neither request has a developer design conclusion, explicit implementation approval, implementation handoff, or development start. Durable approval record:

`docs/CAPABILITY_APPROVALS_2026-09-15.md`

#57 is the likely generic architecture discussion vehicle for the RNG request, but no coding starts until developer design is discussed and the owner explicitly approves implementation.

## Living architecture / infrastructure parents

- **#2:** scientific validation/reproducibility guardrails. Keep open as a living correctness umbrella; concrete tests belong in the implementation child that needs them.
- **#65:** world/environment capabilities and sensor queries. Keep open as a living architecture epic; concrete capabilities get focused children.
- **#124:** artifact capability registry/run lifecycle. #126 remains blocked until a concrete owner-approved optional executable artifact exists; #127 is future Study run semantics.
- **#57:** canonical deterministic domain-separated RNG architecture; relevant to the approved RNG request, but implementation still awaits developer design + explicit owner approval.
- **#8/#9/#102:** future native/HPC, richer physics/heterogeneity, and numerical-integrator evaluation.

## Professor capability-request loop — durable boundary

Standing flow:

`paper + research AI → Experiment draft → missing capability → durable request → Professor approve/decline → developer design discussion → explicit owner implementation approval → trusted developer handoff → capability implementation/deploy → deployed-contract verification → request implemented → research AI resumes preserved draft`

Responsibility boundary:

- research AI **asks and uses**;
- Professor **decides**;
- developer-side ChatGPT **implements and certifies**.

Professor approval alone never starts engineering. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

Current deployed capability-loop foundation includes #133, #135, #139, #141 and the first generic paper-driven capability #143 / PR #144. The first real Professor/Grok capability loop is accepted as a successful end-to-end round. Generic static scalar Environment + `obs.environmental_scalar` are deployed and usable. Showcase promotion remains optional Professor curation, not a paper-loop completion condition.

## Scientific / architecture guardrail

While building the simulator, developer-side ChatGPT must not independently invent or derive the scientific model being simulated. Scientific equivalence, paper-specific equations/parameters, controller logic, retuning and model analysis belong to the Professor/research-AI discussion unless the owner explicitly authorizes scientific reasoning.

Software performance work may measure and optimize simulator infrastructure while preserving exact scientific semantics. Query/transmitter ranges are declared scientific inputs; infrastructure may use them only according to the explicitly chosen exact query semantics. No scientific radius may silently become the one global generic index-definition parameter.

For paper-driven capabilities, apply `docs/CAPABILITY_GENERALIZATION_GATE.md`. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, scientific timing/integration semantics, and rendering as an observer unless explicitly approved otherwise.

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

- pure discussion: no report;
- failed/retrying/partial work: no success report;
- verified terminal success: append one `[SUCCESS REPORT]` comment; the notifier reposts it mentioning `@eliseofe`.

## Source precedence

When sources disagree:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md` for priority/sequencing;
3. `docs/NEIGHBOUR_SEARCH_PRODUCTION_INTEGRATION_2026-09-15.md` for the selected neighbour production architecture;
4. `docs/NEIGHBOUR_SEARCH_ARCHITECTURE_INVESTIGATION_2026-09-15.md` and the dedicated #176/#177/#191 reports for investigation history/evidence;
5. `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md` for the frozen comparative generic contract/matrix rules;
6. current dedicated closeout/performance design documents;
7. `PROJECT_STATE.md` for accepted technical state/evidence;
8. current design documents;
9. active issue scope;
10. older issues/chats as history only.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**The neighbour-search production decision is adaptive periodic BVH (`adaptive-periodic-bvh/v1`): #193 / PR #194 integrates the corrected exact BVH into native/WASM `Simulation` with no selector or user tuning, while the former grid remains reference/fallback infrastructure and faithful ARGoS remains benchmark-only. #168/#178 close after verified integration; #179 remains deferred. The two Grok aggregation capability requests are Professor-approved but design-pending and not implementation-authorized.**
