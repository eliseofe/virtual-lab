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

## #196 / #195.1 — four compulsory Experiment artifacts — completed/deployed

#196 establishes the durable Metrics foundation. The canonical Experiment is now an ordered typed `artifacts` JSONB collection whose required core IDs are exactly:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Each artifact contains `id`, `type`, `label`, `format`, `order`, and `content`.

Legacy `config_source`, `initializer_source`, and `controller_source` columns remain synchronized compatibility mirrors for the first three artifacts only; they are not a competing source of truth. Metrics has no legacy mirror.

An empty Metrics artifact is valid. Existing three-artifact Experiments were normalized mechanically by adding one empty Metrics artifact. This compatibility migration did **not** create scientific revisions.

### Production migration evidence

Migration: `20260915130000_metrics_fourth_core_artifact.sql` / Supabase migration `metrics_fourth_core_artifact`.

The first production attempt failed transactionally because the legacy `artifact_sync_experiment_artifacts` trigger rewrote attempted v3 schema/interface values back to v2 during the backfill, causing the new v3 check constraint to reject the transaction. The transaction rolled back completely; production data remained unchanged.

PR #211 repaired the migration ordering: both `artifact_sync_experiment_artifacts` and `bump_experiment_revision` are disabled only around the mechanical backfill and re-enabled before commit. Regression coverage freezes that ordering.

Verified live after the repaired migration:

- all **7** existing Experiment rows are `vlab.registry-experiment/3` / `vlab.experiment-artifacts/3`;
- all 7 contain exactly one `metrics` core artifact;
- all 7 compatibility Metrics artifacts are empty;
- every Experiment revision exactly matches the pre-migration revision snapshot;
- `artifact_sync_experiment_artifacts`, `bump_experiment_revision`, and collection-owner validation triggers are enabled after migration.

### Metrics language and read-only boundary

One compulsory Metrics artifact contains zero or more metric definitions. There is no architecture-level maximum number of metrics.

Each metric has stable ID, human-readable name, optional unit, computation/source, and sampling policy. Current constrained language supports periodic `every(seconds)` and `final()` declarations at the contract/compiler layer; runtime execution/buffering is #197.

Metric execution is a read-only global scientific observer. It may observe only the explicitly exposed metric snapshot and approved intrinsics. It cannot mutate agents/world/actions, access controller-private state, consume simulator RNG, use filesystem/network, or obtain unrestricted simulator/host internals.

The artifact lifecycle vocabulary is now:

`setup → initialize → control → measure → finalize`

The frozen periodic measurement phase is:

`post-physics-wrapped-state/1`

Semantics: observe canonical physical state after one physics integration update and periodic wrapping, at the resulting `scientific_time`. This makes explicit the measurement point already present in the dormant Rust `MetricRuntime` hook. It does not define any paper-specific metric formula or scientific sampling choice.

### #196 contract versions

- registry: `vlab.registry-experiment/3`
- artifact interface: `vlab.experiment-artifacts/3`
- authoring: `vlab.authoring/0.5`
- Experiment interface: `7`
- artifact capabilities: `vlab.artifact-capabilities/0.3`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- runtime remains: `vlab.runtime/0.2`
- Environment capabilities remain: `vlab.environment-capabilities/0.1`

### #196 build/deployment evidence

PR #206 completed the implementation. Its final normal and performance CI suites were green before merge. PR #211 added only the production migration-order repair and regression assertion; its normal CI passed.

Latest production Pages workflow on main, run `34991392084` at SHA `082365d0861cda618e68e91960cf2cd949992f00`, completed successfully:

- Rust/kernel tests: success;
- python-vlab/compiler tests: success;
- WASM/browser build: success;
- static artifact verification: success;
- GitHub Pages deployment: success;
- deployed browser kernel/editor smoke: success;
- deployed responsive hierarchy/focus smoke: success.

Supabase `experiment-mcp` **v15 is ACTIVE** with `verify_jwt=false` preserved because authentication is implemented inside the function through the existing Supabase OAuth/JWT middleware. v15 bundle hash: `d8cd3b44f319ea7d8038d27b324cb241b8610647a7b09219a3ae27ea9d587e74`.

The v15 management-API deployment entrypoint is pinned to exact merged main commit `082365d0861cda618e68e91960cf2cd949992f00`; Supabase bundled that immutable module and its relative dependencies at deployment time. The live contract therefore comes from the same merged #196 sources while avoiding an unpinned moving-branch dependency.

The deployed MCP contract advertises Experiment interface 7 and `vlab.authoring/0.5`; full fine-grained Metrics/Results authoring remains #200.

Security advisor after migration reported only the already-unrelated project findings: informational RLS-with-no-policy on `preserved_experiment_snapshots` and account-level leaked-password protection disabled. #196 introduced no new authorization surface or RLS policy.

## Canonical Experiment/browser state

Browser load/apply/capture/dirty/save behavior is artifact-driven. Configuration, Initialization and Controller retain their specialized execution/editor wiring. Metrics is now a required core artifact and uses the generic source editor presentation until #202 improves editor ergonomics and #198 introduces live Results UI.

Supported passive extra text artifacts remain representable and round-trippable. Unsupported formats fail explicitly rather than disappearing. Optional code-looking artifacts never execute by inference.

`#126` remains blocked: Metrics is compulsory core and does not use optional-executable-artifact dispatch.

## UI/UX accepted state and new owner-feedback lane

The #147 redesign is deployed and materially improved the Lab. Core accepted direction remains simulation-first with one Experiment finder/switcher, one authoring workspace and secondary organization rather than collection-first navigation.

Engineering-complete items still awaiting a later consolidated owner live pass include:

- **#115** — collection choice during Save as new and clean owned-experiment moves;
- **#118** — artifact-driven Experiment workspace behavior.

On 15 Sep 2026 the owner supplied a new refinement pass, now tracked by #207:

- #208 — unify the top Experiment and bottom Save/Persistence areas into one Experiment identity/save/save-as-new/organization flow;
- #209 — reconcile duplicate-looking Account and Professor entry surfaces while preserving sign-in/out and Professor capability approvals;
- #210 — audit all tiny microcopy/labels, remove nonessential explanatory prose, strengthen retained text/title hierarchy and verify responsive desktop/mobile presentation.

Simulation and Authoring are acceptable structural baselines for this pass. #207 is durable parallel UI work and does not replace #195 as the current scientific/product frontier.

## Professor capability-request loop

Production role model: `student | professor`, with Professor a strict permission superset using the same ordinary Experiment code path.

Durable flow:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted GitHub handoff → deploy/verify → implemented → research AI resumes`

The first real Karagüzel et al. scalar-environment capability request completed this full loop successfully through #143. The simulator capability is generic: static deterministic `environmental_scalar(x, y, config)` is defined through Initialization, evaluated by simulator-owned Environment code, sensed only as local `obs.environmental_scalar`, and rendered from the same evaluator.

Two later informed-robot aggregation capability requests are currently **approved by the Professor but not implementation-authorized**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`.

Live database verification on 15 Sep shows both lifecycle state `approved`. They require developer architecture discussion and explicit owner implementation approval before any coding.

Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

## Neighbour-search / performance state

The neighbour-search investigation is complete. Production native and WASM `Simulation` use `adaptive-periodic-bvh/v1` with exact receiver-radius membership, arbitrary simultaneous radii, periodic minimum-image geometry and deterministic sorted neighbour indices.

Retained reference/benchmark alternatives:

- `PeriodicGridNeighbourIndex` — exact reference/fallback;
- `BruteForceNeighbourIndex` — hidden correctness oracle;
- multi-resolution periodic grid — benchmark evidence only;
- faithful ARGoS RAB — benchmark/reference only.

#56 remains the living performance umbrella. #111 established that around N≈5,000 the dominant measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas/snapshot transfer. #197 must preserve the performance gains from #56/#168 when adding metric execution/transport.

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

**#196 is complete/deployed. The active next substantial implementation ticket is #197 / #195.2: multi-metric runtime sampling, buffered transport and performance isolation.**

Then: #198 live co-located Results UI → #199 local result persistence/export → #200 full MCP/Connector Metrics + Results authoring → #201 owner-defined scientific end-to-end acceptance.

#202 remains the separate editor-ergonomics lane. #207 records the newly approved UI refinement round. Studies remain downstream of the single-run Metrics/Results foundation. The two approved aggregation capability requests remain design-pending and are not authorized for implementation.