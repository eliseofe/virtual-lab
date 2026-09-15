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
- #197 multi-metric runtime sampling/buffered transport: `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`
- #197 production bridge packaging recertification: `a87ad175f3527b404fcf7adf096cb6cb0a1d882e`
- #198 co-located live Results UI: `3197b937a00dbdc7c91fccfc571dfe54fd73ea5a`

## #196 / #195.1 — four compulsory Experiment artifacts — completed/deployed

The canonical Experiment is an ordered typed `artifacts` collection whose required core IDs are exactly:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Each artifact contains `id`, `type`, `label`, `format`, `order`, and `content`. Legacy `config_source`, `initializer_source`, and `controller_source` columns remain synchronized compatibility mirrors for the first three artifacts only; Metrics has no legacy mirror.

An empty Metrics artifact is valid. Existing three-artifact Experiments were mechanically normalized by adding one empty Metrics artifact without changing scientific revision numbers.

Production migration `20260915130000_metrics_fourth_core_artifact.sql` initially failed transactionally because the legacy artifact-sync trigger rewrote attempted v3 schema/interface values back to v2 during backfill. The transaction rolled back cleanly. PR #211 repaired migration ordering by disabling `artifact_sync_experiment_artifacts` and `bump_experiment_revision` only around the mechanical backfill and re-enabling them before commit. Verified live afterward: all 7 existing Experiments are `vlab.registry-experiment/3` / `vlab.experiment-artifacts/3`, all contain exactly one empty compatibility Metrics artifact, revisions match the pre-migration snapshot, and the relevant triggers are enabled.

One compulsory Metrics artifact contains zero or more metric definitions with no architecture-level maximum. Each metric has stable ID, name, optional unit, computation/source, and sampling policy. The language supports periodic `every(seconds)` and `final()` declarations. Metric execution is a read-only global scientific observer; it cannot mutate world/actions, access controller-private state, consume simulator RNG, use filesystem/network, or obtain unrestricted host internals.

Lifecycle vocabulary is:

`setup → initialize → control → measure → finalize`

The frozen periodic measurement phase is `post-physics-wrapped-state/1`: canonical physical state after physics integration and periodic wrapping, at the resulting scientific time. This does not define any paper-specific metric formula or scientific sampling choice.

Production contract versions after #196 remain:

- registry: `vlab.registry-experiment/3`
- artifact interface: `vlab.experiment-artifacts/3`
- authoring: `vlab.authoring/0.5`
- Experiment interface: `7`
- artifact capabilities: `vlab.artifact-capabilities/0.3`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- runtime: `vlab.runtime/0.2`
- Environment capabilities: `vlab.environment-capabilities/0.1`

Supabase `experiment-mcp` v15 remains ACTIVE from the exact merged #196 bundle; full fine-grained Metrics/Results authoring remains #200.

## #197 / #195.2 — multi-metric runtime sampling and buffered transport — completed/deployed/recertified

PR #213 implemented the runtime foundation and merged as `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`.

The native/WASM runtime executes `vlab.metrics-ir/0.1` definitions at `post-physics-wrapped-state/1`, preserves independent periodic/final policies per metric, and rejects periodic intervals that cannot be scheduled exactly on the simulator timestep rather than silently rounding them.

Runtime samples carry stable metric ID plus scientific time. The simulation-side queue is bounded at **262,144 samples**. Overflow is explicit: provenance includes dropped-sample count, first-drop scientific time and completeness state. Worker→UI transport is independent from rendering and is bounded at **4,096 samples per batch** on an approximately **100 ms wall-clock cadence**. No durable storage I/O occurs on the simulator hot path; persistence/export is #199.

Metrics edits participate in the existing Apply & restart flow.

### #197 verification and final production recertification

Dedicated browser/WASM metric profiling used 500 agents, 2,000 physics ticks (20 scientific seconds), 3 repetitions per case. Deterministic trajectories with and without metrics were exactly identical, zero dropped samples occurred in all profiled cases, and expected emitted counts were exact: 200 samples for 1 metric/0.1s; 800 for 4 metrics/0.1s; 4,000 for 4 metrics/0.02s; 160 for 4 metrics/0.5s. Measured batch serialization/drain cost was approximately 0.6/0.9/2.9/0.6 ms for those cases; fresh-worker timing noise showed no metric-induced regression relative to zero-metric cases.

Post-merge runtime/neighbour workflows at `95d3e64...` were green, but an owner-requested triple-check of the actual Pages artifact uncovered a production packaging defect the old smoke missed: `index.html` referenced `./metrics-runtime-bridge.js` while the file existed only under the hashed asset directory.

PR #215 repaired production asset rewriting and strengthened browser smoke so it explicitly requires `globalThis.__vlabMetricRuntime`. Final production run `35008691715` at `a87ad175f3527b404fcf7adf096cb6cb0a1d882e` passed build, Pages deployment, bridge-aware deployed-browser smoke and responsive/focus smoke. Independent inspection of Pages artifact `10413175270` confirmed `index.html` references `./assets-8046738c757c87df/metrics-runtime-bridge.js` and that exact file exists. This is the final #197 certification evidence.

#197 does not require a Supabase schema/MCP deployment because it changes runtime/browser execution and transport, not the persisted Experiment contract or authoring API.

## #198 / #195.3 — co-located live Results UI — completed/deployed

PR #216 merged as `3197b937a00dbdc7c91fccfc571dfe54fd73ea5a`.

The production Experiment screen now contains a live Results surface physically co-located with the running simulation. On desktop the arena and Results are adjacent; on smaller screens Results reflow below the arena without requiring a second page or tab.

Current Results behavior:

- generic plot panels reference stable metric IDs rather than metric-specific UI code;
- a panel may contain one or many metric series;
- the same metric may appear in multiple panels;
- metric colors are deterministically assigned from stable IDs within the active presentation;
- users may add/remove panels and independently change each panel's series bindings without editing scientific metric code;
- panel/binding state is presentation/workspace state only and does not create an Experiment scientific revision;
- first visualization is an interactive time-series line plot with hover inspection, horizontal pan/zoom and reset-view;
- all received scientific samples are retained in full in the in-memory result store; display rendering may reduce very long visible series separately and never mutates the preserved sample arrays;
- Results redraw is throttled at 250 ms independently of #197's scientific evaluation/transport cadence;
- rendering is skipped while the document is hidden and for non-visible plot panels.

#198 deliberately contains no durable result persistence/export, no Study orchestration, no MCP authoring, and no scientific metric formula invention.

### #198 verification evidence

Before merge:

- Round 1A PR run `35009414282` — success;
- performance-profile run `35009414213` — success, including native and browser/WASM profiling.

Production Pages run `35009612243` at merge `3197b937a00dbdc7c91fccfc571dfe54fd73ea5a` passed:

- Rust/kernel tests;
- compiler/browser build and static artifact verification;
- GitHub Pages deployment;
- ordinary deployed-browser kernel/editor smoke;
- dedicated deployed **live Results** smoke;
- responsive hierarchy/focus smoke.

The dedicated Results smoke verified exact sample accumulation into the full UI-side store, two independently configurable plot panels, one metric bound to multiple panels, multi-series binding in a panel, a rendered plot beside the arena on desktop, and stacked Results with no horizontal overflow at a 390×844 mobile viewport. No JavaScript exception was accepted by that smoke.

This is a meaningful owner-visible UI checkpoint. Scientific correctness of a real metric series is intentionally not claimed here; the first owner-defined scientific acceptance fixture remains #201.

## Canonical Experiment/browser state

Browser load/apply/capture/dirty/save behavior is artifact-driven. Configuration, Initialization and Controller retain specialized execution/editor wiring. Metrics is required core, executes through the #197 runtime transport foundation, and now feeds the #198 co-located live Results surface. Metrics still uses the generic source editor presentation until #202 improves editor ergonomics.

Supported passive extra text artifacts remain representable and round-trippable. Unsupported formats fail explicitly rather than disappearing. Optional code-looking artifacts never execute by inference. #126 remains blocked because Metrics is compulsory core and does not use optional-executable-artifact dispatch.

## UI/UX accepted state and owner-feedback lane

The #147 redesign is deployed and materially improved the Lab. Core accepted direction remains simulation-first with one Experiment finder/switcher, one authoring workspace and secondary organization rather than collection-first navigation.

Engineering-complete items still awaiting a later consolidated owner live pass include #115 collection choice/moves and #118 artifact-driven workspace behavior.

The owner supplied a new refinement pass tracked by #207:

- #208 — unify top Experiment identity and bottom Save/Persistence surfaces into one coherent identity/save/save-as-new/organization flow;
- #209 — reconcile duplicate-looking Account and Professor entry surfaces while preserving sign-in/out and Professor approvals;
- #210 — remove unnecessary microcopy, strengthen retained typography/hierarchy, and verify responsive desktop/mobile presentation.

Simulation and Authoring are acceptable structural baselines. #207 is parallel UI work and does not replace #195 as the active scientific/product frontier.

## Professor capability-request loop

Production role model: `student | professor`, with Professor a strict permission superset using the same ordinary Experiment code path.

Durable flow:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted GitHub handoff → deploy/verify → implemented → research AI resumes`

The first real Karagüzel et al. scalar-environment request completed this loop through #143. The capability is generic: deterministic `environmental_scalar(x, y, config)` is defined through Initialization, evaluated by simulator-owned Environment code, sensed only as local `obs.environmental_scalar`, and rendered from the same evaluator.

Two informed-robot aggregation requests are **approved by the Professor but not implementation-authorized**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`.

They require developer architecture discussion and explicit owner implementation approval before coding. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

## Neighbour-search / performance state

Production native/WASM `Simulation` uses `adaptive-periodic-bvh/v1` with exact receiver-radius membership, arbitrary simultaneous radii, periodic minimum-image geometry and deterministic sorted neighbour indices.

Retained alternatives:

- `PeriodicGridNeighbourIndex` — exact reference/fallback;
- `BruteForceNeighbourIndex` — hidden correctness oracle;
- multi-resolution periodic grid — benchmark evidence only;
- faithful ARGoS RAB — benchmark/reference only.

#56 remains the living performance umbrella. #111 established that around N≈5,000 the dominant measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas/snapshot transfer. #197 preserved deterministic simulator semantics and transport isolation; #198 keeps rendering separately throttled. #199 must likewise keep persistence flush cadence independent.

## Success-only durable completion reporting

GitHub issue #145 is the central success-report stream for ChatGPT-managed `eliseofe/*` work.

- discussion/planning: no report;
- failed/retrying/partial work: no success report;
- verified terminal success: append one `[SUCCESS REPORT]` comment;
- `.github/workflows/success-report-notifier.yml` reposts as `github-actions[bot]` mentioning `@eliseofe`.

Issue #146 is complete: GitHub Actions email delivery was disabled at the account level while failed-workflow notifications on GitHub remain enabled.

## Scientific guardrail

Developer-side ChatGPT must not independently perform scientific derivations, equilibrium/model analysis, retuning, substitutions, paper-specific metric definitions or scientific sampling choices about the simulated scientific system. Software architecture/implementation reasoning is allowed.

For Metrics/Results, generic execution/compiler/buffering/persistence/UI plumbing is software work. Metric formulas, scientific interpretation, paper-specific sampling cadence/timing choices and claims of scientific equivalence require explicit owner/research-AI input.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, explicit read-only metric boundaries, scientific timing/integration semantics and rendering as an observer unless the owner explicitly approves a scientific change.

Standing observation gatekeeper: global position is disallowed as a robotics observation capability unless the owner explicitly reverses that decision.

## Current frontier

**#196, #197 and #198 are complete/deployed. The active next substantial implementation ticket is #199 / #195.4: local single-run result persistence, buffered flush policy, export and provenance.**

Then: #200 full MCP/Connector Metrics + Results authoring → #201 owner-defined scientific end-to-end acceptance.

#202 remains the separate editor-ergonomics lane. #207 records the owner-approved UI refinement round. Studies remain downstream of the single-run Metrics/Results foundation. The two approved aggregation capability requests remain design-pending and are not authorized for implementation.