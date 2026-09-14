# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for the completed UI/UX sequence read `docs/UI_UX_REDESIGN_CLOSEOUT_2026-09-15.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The #147 UI/UX redesign is complete, deployed and browser-verified. The accepted Lab workflow is:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

The backlog was audited on 15 Sep 2026. Historical Round-1/integration shells #1, #14–#18, #46, #52 and completed capability epic #58 are closed. Remaining work is organized around focused parents/children rather than issue recency.

## Active performance frontier — #56 / #165 → #168

The owner promoted simulator performance back to active work, specifically the strong dependence on neighbour density / interaction radius.

### #165 measurement result

#165 added a deterministic N=5,000 profiler and compared the current periodic grid (`ceil(sqrt(N))` cells per axis) with half-resolution, double-resolution and radius-matched internal geometries. All alternatives were checked against the brute-force neighbour oracle and returned identical sorted neighbour sets.

Authoritative PR evidence: #167 performance workflow `34905824329`, artifact `10371728802`; normal PR workflow `34905824660` is green. The profiler workflow was also hardened with `pipefail` so a failing `cargo run | tee` cannot be misreported as success.

Key result: the current one-cell-per-agent grid introduces a material avoidable penalty when the query radius spans many small grid cells. The radius-matched candidate kept normal queries at 9 visited cells and was about 2–4× faster in the diagnostic query sweep across all seven measured density/radius cases. Dense experiments still retain unavoidable cost proportional to the actual returned-neighbour count and controller work.

Detailed evidence: `docs/PERFORMANCE_NEIGHBOUR_DENSITY_2026-09-15.md`.

### Next performance child

**#168 — implement radius-aware periodic grid resolution without changing neighbour semantics.**

#168 is the recommended next implementation checkpoint after #165 is merged/closed. It must preserve exact periodic membership, sorted deterministic order, the brute-force oracle, and all scientific parameters. Internal grid/hash resolution remains simulator infrastructure and must not become a user-visible experiment parameter.

Do not silently bundle later performance ideas into #168.

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

Software performance work may measure and optimize simulator infrastructure while preserving exact scientific semantics. Query radius is scientific input; using that already-declared value only to choose internal index geometry is an implementation concern, not permission to change the radius.

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
3. current dedicated closeout/performance design documents;
4. `PROJECT_STATE.md` for accepted technical state/evidence;
5. current design documents;
6. active issue scope;
7. older issues/chats as history only.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**#165 measured a real avoidable neighbour-index penalty and recommends #168 as the next performance implementation child once #167 is merged and #165 is closed; no production neighbour semantics have changed yet. #162/#166 remain parallel near-term lanes, and the two Grok capability requests remain requested/unapproved.**
