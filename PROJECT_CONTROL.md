# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for the completed UI/UX sequence read `docs/UI_UX_REDESIGN_CLOSEOUT_2026-09-15.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The #147 UI/UX redesign is complete, deployed and browser-verified. The accepted Lab workflow is:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

The backlog was audited on 15 Sep 2026. Historical Round-1/integration shells #1, #14–#18, #46, #52 and completed capability epic #58 are closed. Remaining work is organized around focused parents/children rather than issue recency.

## Active performance frontier — #56 / #168

Neighbour discovery is an active first-class simulator architecture investigation.

### Production baseline — unchanged

The production backend remains the long-standing #25 / PR #34 `PeriodicGridNeighbourIndex`:

- radius-independent grid geometry;
- `cells_per_axis = ceil(sqrt(N))`;
- one positional cell per agent;
- arbitrary receiver-side query radii served from one rebuilt index;
- exact periodic minimum-image filtering;
- deterministic sorted output.

**No radius-coupled production replacement was ever merged.** The post-#165 radius-aware proposal was stopped before implementation and superseded by #168.

Brute force remains permanent hidden correctness/debug infrastructure and is not intended as a normal Lab user option.

### #165 — density/resolution measurement completed

#165 / PR #167 was measurement-only. It compared the current single-level resolution with half, double and radius-matched/Violet-like diagnostic grids at N=5,000, all checked against brute force.

Result: the current approximately-one-cell-per-agent resolution can create avoidable bucket-lookup work when a radius spans many small cells. The radius-matched diagnostic kept ordinary queries near a 3×3 stencil and was roughly 2–4× faster in the measured query sweeps. This is evidence about the current resolution heuristic, not justification to make one scientific radius define the general index.

PR #167 squash-merged as `bb83b7f774504924a396fc9c961f9e45eaa6df45`. Main workflow `34906602411` passed. Primary evidence: performance run `34905824329`, artifact `10371728802`.

Detailed evidence: `docs/PERFORMANCE_NEIGHBOUR_DENSITY_2026-09-15.md`.

### #168 — comparative architecture investigation

Authoritative history/design record:

`docs/NEIGHBOUR_SEARCH_ARCHITECTURE_INVESTIGATION_2026-09-15.md`

The investigation now deliberately separates two semantic families.

**Generic receiver-radius tournament:**

1. current production single-level periodic grid — general baseline;
2. radius-matched/Violet-like single grid — one-radius performance reference;
3. multi-resolution/hierarchical periodic grid — serious general candidate;
4. adaptive tree/BVH-family index — serious general candidate;
5. brute force — hidden oracle only.

**Faithful transmitter-range RAB comparison:**

- ARGoS-style Range-and-Bearing semantics are evaluated separately because each transmitter owns its range and receivers perform point/location lookup rather than `query(receiver, radius)` scans.
- Equal transmitter ranges provide a bridge to ordinary fixed-radius discovery; heterogeneous transmitter ranges exercise the genuine RAB case.

Production remains unchanged until the evidence-backed integration decision in #178.

### #169 — common contract/harness completed

#169 / PR #170 froze the generic comparative contract before candidate implementation.

Durable artifacts:

- `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md`;
- `benchmarks/neighbour_search_matrix.json`;
- `crates/kernel/examples/neighbour_strategy_benchmark.rs`.

The matrix covers single and simultaneous multiple radii, wide radius ratios, clustered occupancy and periodic boundaries. One candidate rebuild serves the complete ordered radius set; results are accepted only after exact brute-force equality.

PR #170 squash-merged as `70dda6c40039a7e814c75668d7008b4fef8cdf03`. Performance workflow `34909595098` and post-merge production workflow `34909748448` passed.

### #171 — fixed-halo generic coverage adaptation retired

#171 / PR #172 tested a hybrid fixed-halo coverage adaptation: simulator-owned one-cell stamping plus receiver-side multi-cell radius scans. It was exact but produced heavy duplicate candidate work and was slower than the current grid in every nontrivial multi-radius smoke case.

This implementation was **not faithful ARGoS RAB**. It has been removed from active candidate code by #173 and is not a tournament finalist. Its evidence remains only as historical engineering evidence:

`docs/NEIGHBOUR_SEARCH_FIXED_HALO_ADAPTATION_RESULT_2026-09-15.md`

Do not use #171 to make conclusions about ARGoS RAB.

### #173 — faithful ARGoS RAB benchmark completed

#173 / PR #180 replaced the rejected fixed-halo candidate with a benchmark-only faithful transcription of the maintained ARGoS Range-and-Bearing spatial-index/routing mechanism.

Source fidelity was checked directly against `ilpincy/argos3` commit `4bb398cd6bfdd09fc919f24c9cccbff38370849b`:

- grid resolution independent of transmitter range;
- transmitter-owned ranges;
- `ForCellsInBoxRange(...)` coverage insertion;
- `GetEntitiesAt(receiver.position)` point lookup;
- one exact distance check per unordered candidate pair;
- two independent directional `< GetRange()` tests.

Explicit benchmark adaptations are documented: ARGoS 3D grid → Virtual Lab 2D benchmark world; Virtual Lab periodic wrapping/minimum-image geometry; equal message sizes/no occlusion to isolate spatial indexing/routing.

A dedicated transmitter-range brute-force oracle verified exact deterministic routes for both equal and heterogeneous transmitter ranges, including uniform, clustered and periodic-boundary cases.

Durable result:

`docs/NEIGHBOUR_SEARCH_ARGOS_RAB_RESULT_2026-09-15.md`

Evidence:

- code-head performance run `34942513488`, artifact `10386270725`, fully green;
- final-head normal PR workflow `34942954512`, green;
- final-head performance workflow `34942954496`, fully green after unchanged retries of two unrelated browser-profile flakes;
- PR #180 squash-merged as `cc5d9868d304eef61b6a1898ad5b1a0d78e13f51`;
- post-merge production workflow `34943376032` passed build, GitHub Pages deployment, functional deployed-browser smoke and responsive/focus smoke.

No production neighbour backend changed in #173. No winner is declared from the small smoke-matrix RAB timings; the broader faithful RAB comparison belongs to #177.

### #174 — exact multi-resolution periodic-grid candidate completed

#174 / PR #181 implemented the first serious generic multi-radius challenger while preserving the original #25 invariant: hierarchy geometry is simulator infrastructure, one hierarchy is rebuilt once, and arbitrary simultaneous scientific query radii select among already-built levels without radius-triggered rebuilding.

The benchmark-only hierarchy starts at `4 * ceil(sqrt(N))` cells per axis and approximately halves resolution per level down to one cell. Every agent is indexed once per level; selected-level candidates are filtered by the exact periodic minimum-image test and returned in deterministic sorted order. The finest-level multiplier is an initial internal benchmark policy, not a scientific parameter or declared optimum.

Every frozen #169 smoke scenario/radius matched `BruteForceNeighbourIndex` exactly. The benchmark also asserts that hierarchy geometry remains unchanged across the complete ordered simultaneous-radius set. A separate radius-matched per-radius grid remains a diagnostic performance reference only.

Representative same-run evidence from performance workflow `34944939979`, artifact `10386334821`:

- uniform multi-radius: aggregate query time -29.8% vs current grid; rebuild+query -15.8%;
- uniform wide-radius-ratio: query -53.3%; rebuild+query -47.6%;
- clustered multi-radius: query -26.0%; rebuild+query -20.0%;
- periodic boundary bands: query -1.6%; rebuild+query +18.8%;
- small single-radius: query +31.4%; rebuild+query +120.0%.

The cost is substantial: smoke fixtures use 6–8 levels / index entries per agent and rebuild time is roughly 4.9–10.9× the current single-level grid. The candidate therefore remains promising but **is not yet a production winner**; full candidate comparison and rebuild/query/end-to-end accounting remain required.

Durable result:

`docs/NEIGHBOUR_SEARCH_MULTI_RESOLUTION_RESULT_2026-09-15.md`

PR #181 squash-merged as `6298fba15ae474cc98c3b5eaca6562ebd236a847`. Normal PR workflow `34944939995` and full performance workflow `34944939979` passed on the code head; the final PR commit was documentation-only. Post-merge production workflow `34945372768` passed build, GitHub Pages deployment, functional deployed-browser smoke and responsive/focus smoke.

Production `PeriodicGridNeighbourIndex` remains unchanged.

### #175 — exact adaptive periodic BVH candidate completed

#175 / PR #182 implemented the second serious generic candidate: a deterministic balanced 2D BVH/k-d-style tree built from physical positions only and reused unchanged for every simultaneous query radius.

The benchmark-only tree uses widest-bounding-box-axis median splits and a fixed internal leaf capacity of 8. Periodic queries use only translated arena images required when a search circle crosses a boundary; duplicate candidates are removed, exact periodic minimum-image filtering is authoritative, and results remain deterministically sorted. The leaf capacity is benchmark infrastructure, not an experiment-visible or scientific parameter.

Every frozen #169 smoke scenario/radius matched `BruteForceNeighbourIndex` exactly. Final-head dedicated benchmark `34946443310` passed and retained artifact `10387037408`; standard PR workflow `34946443238` and full performance/browser workflow `34946443341` also passed.

Representative BVH query results versus the current grid from the retained smoke evidence:

- uniform single small: +29.9% slower;
- uniform multi-radius: +2.0% slower;
- uniform wide-radius ratio: 17.0% faster;
- clustered multi-radius: 0.5% faster (effectively tied; rebuild+query +0.6%);
- periodic boundary bands: 26.5% faster.

Its index-entry proxy is roughly 1.2–1.4 entries per agent in these fixtures, substantially lower than the 6–8 entries per agent of the #174 hierarchy. Rebuild cost is generally much closer to the current grid than the multi-resolution hierarchy, while query performance is mixed. This makes BVH a serious low-storage/general finalist, **not a declared winner**.

Durable result:

`docs/NEIGHBOUR_SEARCH_ADAPTIVE_BVH_RESULT_2026-09-15.md`

PR #182 squash-merged as `b1cd5f518a1822fd64db333f4b6f444119ed2735`. Post-merge dedicated benchmark `34946622192` passed. Post-merge production workflow `34946622156` passed build, GitHub Pages deployment, functional deployed-browser smoke and responsive/focus smoke.

Production `PeriodicGridNeighbourIndex` remains unchanged.

### Agreed execution sequence under #168

- **#174 / #168.4 — multi-resolution periodic grid. Completed.** Exact benchmark-only candidate retained; production unchanged.
- **#175 / #168.5 — adaptive tree/BVH. Completed.** Exact low-storage benchmark-only candidate retained; production unchanged.
- **#176 / #168.6 — generic tournament. Next performance ticket.** Current vs Violet reference vs multi-resolution vs tree/BVH; brute force hidden oracle.
- **#177 / #168.7 — faithful transmitter-range RAB comparison.** Compare exact structures under genuine RAB semantics, including heterogeneous ranges.
- **#178 / #168.8 — production decision/integration.** Select one or several justified backends, any deterministic `auto` policy, provenance, and whether a specialized RAB backend is retained.
- **#179 / #168.9 — persistent scalability Study.** Deferred until Studies/results infrastructure is mature.

Each child is a separate measured/tested checkpoint. Do not promote a candidate from its own implementation ticket merely because it looks promising.

## Near-term parallel product/research lanes

- **#45 / #162:** production Virtual Lab OAuth/login surface and explicit enrollment policy. Current Supabase baseline has only the owner Professor + Student test identities; no unknown accounts were present at audit time.
- **#3 / #4:** Studies and local result/provenance infrastructure.
- **#6 / #166:** first explicit selected Study-result → AI handoff contract.
- **#119 / #120:** Research Notes/Documents and later AI synthesis; important near-future work after stable Study/result identities.
- **#115 / #163:** owner acceptance for collection creation/rename/assignment/moves.
- **#118 / #164:** owner acceptance for artifact-driven authoring workspace.
- **#149:** optional first-paper refinement / optional Showcase decision.

## Parallel research-AI capability requests — approved, design pending

The Professor approved both current Grok capability requests for the informed-robot aggregation experiment on 15 Sep 2026. They are at the **developer-design discussion** stage only; approval does not itself authorize implementation.

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`, lifecycle hook `control`. Professor note: the generic capability must support **different probability distributions** while preserving simulator-owned deterministic/reproducible RNG.
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`, lifecycle hook `initialize`. Professor note: this must become a **generic heterogeneous swarm initialization capability**, not an `informed` boolean; heterogeneity may include information/private state and potentially heterogeneous sensors/capabilities.

Neither request yet has a developer design conclusion, explicit implementation approval, GitHub implementation issue/handoff, or development start. Durable approval record: `docs/CAPABILITY_APPROVALS_2026-09-15.md`.

#57 is the likely generic architecture discussion vehicle for the RNG request, but no coding starts until the developer design is discussed and the owner explicitly approves implementation.

## Living architecture / infrastructure parents

- **#2:** scientific validation/reproducibility guardrails. Keep open as a living correctness umbrella; concrete tests belong in the implementation child that needs them.
- **#65:** world/environment capabilities and sensor queries. Keep open as a living architecture epic; concrete capabilities get focused children.
- **#124:** artifact capability registry/run lifecycle. #126 remains blocked until a concrete owner-approved optional executable artifact exists; #127 is future Study run semantics.
- **#57:** canonical deterministic domain-separated RNG architecture; now directly relevant to the approved RNG capability request, but implementation still awaits developer design + explicit owner approval.
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
3. `docs/NEIGHBOUR_SEARCH_ARCHITECTURE_INVESTIGATION_2026-09-15.md` for neighbour-search architecture/investigation state;
4. `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md` for the frozen comparative generic contract/matrix rules;
5. current dedicated closeout/performance design documents;
6. `PROJECT_STATE.md` for accepted technical state/evidence;
7. current design documents;
8. active issue scope;
9. older issues/chats as history only.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**#175 is complete: the exact adaptive periodic BVH is retained alongside #174 multi-resolution as a serious generic finalist, with much lower storage/rebuild overhead but mixed query performance. Production generic neighbour search remains unchanged, and faithful ARGoS RAB remains separately completed in #173. The next performance child is #176 generic tournament, followed by #177 faithful RAB comparison, #178 integration decision and #179 persistent Study. The two Grok aggregation capability requests are Professor-approved but design-pending and not implementation-authorized.**