# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for the completed UI/UX sequence read `docs/UI_UX_REDESIGN_CLOSEOUT_2026-09-15.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The #147 UI/UX redesign is complete, deployed and browser-verified. The accepted Lab workflow is:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

The backlog was audited on 15 Sep 2026. Historical Round-1/integration shells #1, #14–#18, #46, #52 and completed capability epic #58 are closed. Remaining work is organized around focused parents/children rather than issue recency.

## Active performance frontier — #56 / #168

The owner promoted simulator performance back to active work, specifically the strong dependence on neighbour density / interaction radius.

### #165 measurement result — completed

#165 added a deterministic N=5,000 profiler and compared the current periodic grid (`ceil(sqrt(N))` cells per axis) with half-resolution, double-resolution and radius-matched internal geometries. All alternatives were checked against the brute-force neighbour oracle and returned identical sorted neighbour sets.

PR #167 squash-merged as `bb83b7f774504924a396fc9c961f9e45eaa6df45`. Final-head normal PR workflow `34906284691` passed. Performance workflow `34906284696` hit the known Chrome `DevToolsActivePort` startup race on its first attempt; the unchanged failed-job rerun passed completely. Main production workflow `34906602411` passed build, GitHub Pages deployment, functional deployed-browser smoke and responsive/focus smoke. Primary measurement artifact: performance run `34905824329`, artifact `10371728802`.

Key result: the current one-cell-per-agent grid introduces a material avoidable penalty when the query radius spans many small grid cells. The radius-matched candidate kept normal queries at 9 visited cells and was about 2–4× faster in the diagnostic query sweep across all seven measured density/radius cases. Dense experiments still retain unavoidable cost proportional to the actual returned-neighbour count and controller work.

Detailed evidence: `docs/PERFORMANCE_NEIGHBOUR_DENSITY_2026-09-15.md`.

### #168 is now a serious architecture investigation, not a radius-coupled implementation

The original #25 design rule remains authoritative: **scientific radii and spatial-index geometry are separate concerns, and one built index architecture must support arbitrary simultaneous radii without experiment-author tuning.**

The narrow proposal to implement a production grid configured from one query radius is superseded. #165 proved that the current single-level resolution is inefficient in some regimes; it did not prove that production should couple itself to one scientific radius.

Authoritative investigation document:

`docs/NEIGHBOUR_SEARCH_ARCHITECTURE_INVESTIGATION_2026-09-15.md`

#168 now compares exact strategies under one correctness contract:

- brute force — oracle / small-N baseline;
- current single-level periodic grid — production baseline;
- radius-matched single grid — Violet-like performance reference, not assumed general target;
- ARGoS-style coverage stamping;
- multi-resolution / hierarchical periodic grids;
- adaptive tree / BVH-family indexing.

The multi-resolution strategy is currently the strongest architectural hypothesis, but **there is no declared winner**. Every strategy must return the exact same periodic neighbour set and deterministic ordering as brute force, including when several different radii are queried during the same control update.

The investigation should eventually support a common internal strategy interface. If evidence shows different strategies dominate different workload regions, production may keep several exact implementations with an ordinary-user `auto` policy and an expert benchmarking override. Strategy/version must be provenance; strategy choice must never change scientific semantics.

Once Studies/results exist, the complete scalability matrix should become a persistent Virtual Lab Study covering N, density, one/multiple radii, spatial heterogeneity, rebuild/query decomposition, memory and end-to-end throughput. Publication/novelty claims require a separate literature review; that review is explicitly deferred.

No candidate implementation is authorized merely by the existence of #168. Proceed by focused child issues under normal execution granularity.

### #169 contract/harness checkpoint — completed

#169 froze the comparative contract before any competing implementation was allowed to enter the tournament. PR #170 squash-merged as `70dda6c40039a7e814c75668d7008b4fef8cdf03`.

Durable artifacts:

- `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md` — exact semantic, timing, fairness and reporting contract;
- `benchmarks/neighbour_search_matrix.json` — machine-readable full-tournament axes and deterministic CI smoke scenarios;
- `crates/kernel/examples/neighbour_strategy_benchmark.rs` — candidate-independent baseline/oracle harness.

The frozen smoke matrix explicitly covers single and simultaneous multiple radii, a wide smallest/largest-radius ratio, clustered occupancy and periodic-boundary bands. One candidate rebuild is reused across each ordered radius set. The current production grid matched `BruteForceNeighbourIndex` exactly for every agent/radius in all five smoke scenarios.

PR performance workflow `34909595098` passed the new contract smoke plus the full existing native/WASM/browser performance tail; evidence artifact `10373957403`. Post-merge production workflow `34909748448` passed build, GitHub Pages deployment, functional deployed-browser smoke and responsive/focus smoke.

No ARGoS-stamping, multi-resolution, tree/BVH or auto-selection implementation was started in #169. The next candidate must be a focused child of #168 and must use the frozen contract rather than altering the benchmark to fit itself.

## Near-term parallel product/research lanes

- **#45 / #162:** production Virtual Lab OAuth/login surface and explicit enrollment policy. Current Supabase baseline has only the owner Professor + Student test identities; no unknown accounts were present at audit time.
- **#3 / #4:** Studies and local result/provenance infrastructure.
- **#6 / #166:** first explicit selected Study-result → AI handoff contract.
- **#119 / #120:** Research Notes/Documents and later AI synthesis; important near-future work after stable Study/result identities.
- **#115 / #163:** owner acceptance for collection creation/rename/assignment/moves.
- **#118 / #164:** owner acceptance for artifact-driven authoring workspace.
- **#149:** optional first-paper refinement / optional Showcase decision.

## Parallel research-AI capability requests — not engineering work

Two Grok requests for the informed-robot aggregation experiment are durable but remain **requested only**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`, lifecycle hook `control`;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`, lifecycle hook `initialize`.

Neither has Professor approval, developer handoff, GitHub implementation issue, or implementation authorization.

#57 is the likely generic architecture discussion vehicle if the RNG request is later approved, but request existence does not authorize coding.

## Living architecture / infrastructure parents

- **#2:** scientific validation/reproducibility guardrails. Keep open as a living correctness umbrella; concrete tests belong in the implementation child that needs them.
- **#65:** world/environment capabilities and sensor queries. Keep open as a living architecture epic; concrete capabilities get focused children.
- **#124:** artifact capability registry/run lifecycle. #126 remains blocked until a concrete owner-approved optional executable artifact exists; #127 is future Study run semantics.
- **#57:** canonical deterministic domain-separated RNG architecture; relevant but not yet authorized.
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

Software performance work may measure and optimize simulator infrastructure while preserving exact scientific semantics. Query radii are scientific inputs; neighbour-index strategies may read already-declared query scales only to route exact infrastructure work, but no scientific radius may silently become the one global index-definition parameter.

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
3. `docs/NEIGHBOUR_SEARCH_ARCHITECTURE_INVESTIGATION_2026-09-15.md` for neighbour-search architecture/investigation state;
4. `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md` for the frozen comparative neighbour-search contract/matrix rules;
5. current dedicated closeout/performance design documents;
6. `PROJECT_STATE.md` for accepted technical state/evidence;
7. current design documents;
8. active issue scope;
9. older issues/chats as history only.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**#169 is complete and the exact multi-radius neighbour-search contract/matrix is frozen and verified. #168 remains the serious architecture investigation; no candidate has won or been implemented yet. The next performance work must be a focused candidate child using the frozen tournament contract. #162/#166 remain parallel near-term lanes, and the two Grok capability requests remain requested/unapproved.**
