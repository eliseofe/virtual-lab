# Virtual Lab — Current Project State

Updated: **15 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Detailed older history remains available in Git history and `docs/archive/PROJECT_STATE_pre_117_2026-09-14.md`.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Experiment MCP: **ACTIVE Edge Function version 15**
- MCP server version: **2.5.0**
- MCP health interface version: **7**
- Capability-request interface: **`vlab.capability-request/1`**
- Current registry schema: **`vlab.registry-experiment/3`**
- Current Experiment artifact interface: **`vlab.experiment-artifacts/3`**
- Current authoring contract: **`vlab.authoring/0.5`**
- Current Experiment interface version: **`7`**
- Current runtime contract: **`vlab.runtime/0.2`**
- Current artifact capability contract: **`vlab.artifact-capabilities/0.3`**
- Current Environment capability contract: **`vlab.environment-capabilities/0.1`**
- Current Metrics language: **`python-vlab-metrics/0.1`**
- Current Metrics IR: **`vlab.metrics-ir/0.1`**
- Current metric batch transport: **`vlab.metric-sample-batch/0.1`**
- Metric measurement phase: **`post-physics-wrapped-state/1`**
- Production neighbour strategy: **`adaptive-periodic-bvh/v1`**

Important recent merge SHAs:

- #117 generic Experiment artifact persistence/MCP: `6b31bd5626b5af31804ff7fbaa19ec01c719177f`
- #118 artifact-driven Experiment workspace/UI: `ec3993b07faf12be063863ee609e86e7fa31668b`
- #125 artifact capability/lifecycle metadata: `eaae0dc0a19ef1e5124ca0753f48c89cb3406147`
- #133 Professor role foundation: `064980a68de397b7c9d88f5321886d94b7d2338a`
- #135 durable capability requests: `f14210124150eb220b40999007b515d296cde589`
- #139 Professor inbox/triage: `c4c9e435d430d6d4e316124f13e9777c73246a33`
- #141 trusted developer handoff: `5a0016f3949d0a8f40418b0e612c7576366c6612`
- #143 generic scalar Environment/local scalar observation: `7b4861e90dc00633f811cd5d882617b74301c765`
- #150 simulation-first workspace shell: `9f75ed7f9e2530e8c5681a30f3126b2f4b2a2bdd`
- #153 workspace continuity + unified Experiment switcher: `dfb70a3882176cd28a11fb3f891952eccc28d865`
- #155 authoring + persistence workspace: `694fd544563ff01fe87f061c9240c74d31873eb1`
- #157 collections/organization redesign: `f82eb392a3cf60d5a71ffab76c92b7da8cc4d5c2`
- #193 production adaptive periodic BVH: `740658fc91fd25eafb362b49532e86433c00930d`
- #196 primary Metrics/fourth-artifact merge: `bad877a5c8b60391f12617779763b725f1167bc0`
- #196 production migration-order repair: `082365d0861cda618e68e91960cf2cd949992f00`
- #197 multi-metric runtime sampling/buffering/transport: `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`

## #196 / #195.1 — four compulsory Experiment artifacts — completed/deployed

The canonical Experiment is an ordered typed `artifacts` JSONB collection whose required core IDs are exactly:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Each artifact contains `id`, `type`, `label`, `format`, `order`, and `content`.

Legacy `config_source`, `initializer_source`, and `controller_source` columns remain synchronized compatibility mirrors for the first three artifacts only; they are not a competing source of truth. Metrics has no legacy mirror.

An empty Metrics artifact is valid. The production compatibility migration added one empty Metrics artifact to every existing three-artifact Experiment without creating scientific revisions. Live verification after the repaired migration found all **7** Experiment rows on `vlab.registry-experiment/3` / `vlab.experiment-artifacts/3`, each with exactly one empty compatibility Metrics artifact and unchanged revisions.

### Metrics language and information boundary

One compulsory Metrics artifact contains zero or more metric definitions. There is no architecture-level maximum number of metrics.

Each metric has stable ID, human-readable name, optional unit, computation/source, and sampling policy. The constrained language supports periodic `every(seconds)` and `final()` declarations.

Metric execution is a read-only global scientific observer. It may observe only the explicitly exposed metric snapshot and approved intrinsics. It cannot mutate agents/world/actions, access controller-private state, consume simulator RNG, use filesystem/network, or obtain unrestricted simulator/host internals.

The artifact lifecycle vocabulary is:

`setup → initialize → control → measure → finalize`

The frozen measurement phase is:

`post-physics-wrapped-state/1`

Semantics: observe canonical physical state after the due physics integration update and periodic wrapping, at the resulting `scientific_time`. This is a versioned simulator contract, not a paper-specific metric formula or paper-specific sampling choice.

### #196 production infrastructure evidence

PR #206 implemented the four-artifact contract; PR #211 repaired production migration ordering after the first migration attempt correctly rolled back transactionally.

Supabase `experiment-mcp` **v15 is ACTIVE**. The deployed authoring contract advertises Experiment interface 7 and `vlab.authoring/0.5`; full fine-grained Metrics/Results authoring remains #200.

## #197 / #195.2 — multi-metric runtime sampling, buffering and transport — completed/deployed

Accepted detailed record: `docs/METRIC_RUNTIME_FOUNDATION_2026-09-15.md`.

PR #213 merged as `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`.

### Runtime execution

Validated `vlab.metrics-ir/0.1` now executes in the production Rust/WASM runtime.

The implementation wraps the existing `Simulation`; it does not duplicate physics or controller semantics. Advances are split only when required to land exactly on a due metric tick. The metric then reads the resulting canonical physical state in Rust/WASM at the already-frozen `post-physics-wrapped-state/1` phase.

Periodic metric intervals must be exact integer multiples of `PHYSICS_DT`. Unschedulable intervals are rejected rather than rounded. `final()` metrics execute exactly once at explicit run finalization.

Metrics remain read-only and do not receive action/mutation/RNG/controller-private-state/filesystem/network APIs.

### Runtime buffering / transport

The three approved cadences are separated:

1. metric evaluation — each metric's scientific sampling policy;
2. worker/UI sample transport — independent batched transport;
3. durable persistence flush — not implemented yet; #199 owns it.

Runtime buffer capacity: **262,144 scalar samples**.

Ordinary worker transport:

- transport cadence: approximately **100 ms wall-clock**;
- maximum ordinary drain batch: **4096 samples**;
- arena rendering remains independently approximately **60 Hz**.

Each transported sample contains stable metric ID, scientific time and scalar value.

Overflow semantics are explicit. Status/batch metadata contains capacity, remaining samples, cumulative dropped-sample count, first dropped scientific time and a `complete` flag. Data loss is therefore detectable and cannot silently masquerade as a complete result.

No durable database/local-storage write occurs on the simulation hot path.

### Authoring/browser integration

The required Metrics artifact is compiled before worker initialization/restart and passed as Metrics IR.

Metrics edits participate in the existing **Apply changes & restart** workflow. Metrics-only changes use the same visible action; Metrics changes combined with Configuration/Initialization/Controller piggyback the same restart.

There is intentionally no live Results presentation yet. #198 owns visualization of the runtime metric-batch stream.

### #197 correctness evidence

Automated tests cover:

- multiple independent periodic cadences and stable metric identities;
- one-time final metrics;
- rejection of unschedulable cadence instead of rounding;
- explicit overflow reporting;
- unchanged deterministic simulation trajectory under metric observation/drain;
- separate rendering and metric-transport cadences;
- absence of persistence/database I/O in worker metric collection;
- Metrics integration with existing apply/restart authoring flow.

### #197 performance evidence

PR-head performance workflow `34999061762`: **success**.

Dedicated browser/WASM matrix used 500 agents, 2,000 physics ticks (20 scientific seconds), and 3 repetitions per case.

Expected/observed emitted sample counts:

- one metric every 0.1 s: **200**;
- four metrics every 0.1 s: **800**;
- four metrics every 0.02 s: **4,000**;
- four metrics every 0.5 s: **160**.

Every tested case reported **0 dropped samples**.

Measured batch serialization/drain cost on the CI runner was approximately:

- 200 samples: **0.6 ms**;
- 800 samples: **0.9 ms**;
- 4,000 samples: **2.9 ms**;
- 160 samples: **0.6 ms**.

Fresh-worker advance timings were noisy and are not interpreted as a scientific or negative-overhead claim. The matrix showed no measurable framework regression relative to the zero-metric cases.

The deterministic trajectory comparison passed exactly: final metric-enabled state equaled final zero-metric state value-for-value.

Final PR-head regression workflows on `bb31be8e1995fce72b2b58c276058c0c3934beaf` all passed:

- Round 1A build: `34999061792`;
- canonical neighbour regime matrix: `34999061946`;
- performance profile: `34999061762`;
- faithful RAB strategy comparison: `34999062387`;
- generic neighbour tournament: `34999061926`.

Production main workflow `34999390621` on merge SHA `95d3e64e4ccb79ef4551411f0f19cdba78d31c32` completed successfully:

- Rust/kernel tests: success;
- compiler/Node tests: success;
- WASM/browser build: success;
- static artifact verification: success;
- GitHub Pages deployment: success;
- deployed browser kernel/editor smoke: success;
- deployed responsive hierarchy/focus smoke: success.

## Canonical Experiment/browser state

Browser load/apply/capture/dirty/save behavior is artifact-driven. Configuration, Initialization and Controller retain their specialized execution/editor wiring. Metrics is a required core artifact using the generic source editor presentation until #202 improves editor ergonomics.

#197 adds the runtime metric stream but no Results panel. #198 is therefore the first owner-visible live Results implementation ticket.

Supported passive extra text artifacts remain representable and round-trippable. Unsupported formats fail explicitly rather than disappearing. Optional code-looking artifacts never execute by inference.

#126 remains blocked: Metrics is compulsory core and does not use optional-executable-artifact dispatch.

## UI/UX accepted state and owner-feedback lane

The #147 redesign is deployed and materially improved the Lab. Core accepted direction remains simulation-first with one Experiment finder/switcher, one authoring workspace and secondary organization rather than collection-first navigation.

Engineering-complete items still awaiting a later consolidated owner live pass include #115 collection choice/moves and #118 artifact-driven Experiment workspace behavior.

Owner refinement feedback is tracked by #207:

- #208 — unify the top Experiment and bottom Save/Persistence areas into one Experiment identity/save/save-as-new/organization flow;
- #209 — reconcile duplicate-looking Account and Professor entry surfaces while preserving sign-in/out and Professor capability approvals;
- #210 — remove nonessential tiny microcopy, strengthen necessary text/title hierarchy and verify responsive desktop/mobile presentation.

Simulation and Authoring remain acceptable structural baselines for this pass. #207 does not replace #195 as the active scientific/product sequence.

## Professor capability-request loop

Production role model: `student | professor`, with Professor a strict permission superset using the same ordinary Experiment code path.

Durable flow:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted GitHub handoff → deploy/verify → implemented → research AI resumes`

The first real Karagüzel et al. scalar-environment capability request completed this full loop successfully through #143. The simulator capability is generic: static deterministic `environmental_scalar(x, y, config)` is defined through Initialization, evaluated by simulator-owned Environment code, sensed only as local `obs.environmental_scalar`, and rendered from the same evaluator.

Two later informed-robot aggregation capability requests are **approved by the Professor but not implementation-authorized**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`.

They require developer architecture discussion and explicit owner implementation approval before coding. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

## Neighbour-search / performance state

Production native and WASM `Simulation` use `adaptive-periodic-bvh/v1` with exact receiver-radius membership, arbitrary simultaneous radii, periodic minimum-image geometry and deterministic sorted neighbour indices.

Retained reference/benchmark alternatives: `PeriodicGridNeighbourIndex` exact reference/fallback; `BruteForceNeighbourIndex` hidden correctness oracle; multi-resolution periodic grid and faithful ARGoS RAB benchmark/reference only.

#56 remains the living performance umbrella. #111 established that around N≈5,000 the dominant measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas/snapshot transfer. #197's metric runtime passed the existing neighbour/performance regression suites.

## Success-only durable completion reporting

GitHub issue #145 is the central success-report stream for ChatGPT-managed `eliseofe/*` work.

- discussion/planning: no report;
- failed/retrying/partial work: no success report;
- verified terminal success: append one `[SUCCESS REPORT]` comment;
- `.github/workflows/success-report-notifier.yml` reposts as `github-actions[bot]` mentioning `@eliseofe`, allowing normal GitHub notification/email delivery.

Issue #146 is complete: GitHub Actions email delivery was disabled at the account level while failed-workflow notifications on GitHub remain enabled.

## Scientific guardrail

Developer-side ChatGPT must not independently perform scientific derivations, equilibrium/model analysis, retuning or substitutions about the simulated scientific system. Software architecture/implementation reasoning is allowed.

For Metrics specifically, generic execution/compiler/buffering/persistence/UI plumbing is software work. Metric formulas, scientific interpretation, paper-specific sampling cadence/timing choices and claims of scientific equivalence require explicit owner/research-AI input.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, explicit read-only metric boundaries, scientific timing/integration semantics and rendering as an observer unless the owner explicitly approves a scientific change.

## Current frontier

**#196 and #197 are complete/deployed. The active next substantial implementation ticket is #198 / #195.3: co-located live Results UI with configurable multi-series plot panels consuming the deployed runtime metric stream.**

Then: #199 local result persistence/export → #200 full MCP/Connector Metrics + Results authoring → #201 owner-defined scientific end-to-end acceptance.

#202 remains the separate editor-ergonomics lane. #207 records the owner-approved UI refinement round. Studies remain downstream of the single-run Metrics/Results foundation. The two approved aggregation capability requests remain design-pending and are not authorized for implementation.
