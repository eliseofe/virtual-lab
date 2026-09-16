# Virtual Lab — Current Project State

Updated: **16 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Older implementation history remains available in Git history and date-stamped/archive documents.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Experiment MCP Edge Function: version **16**, ACTIVE
- MCP server version: **3.0.0**
- MCP interface: **8**
- Capability request interface: `vlab.capability-request/1`
- Registry schema: `vlab.registry-experiment/3`
- Experiment artifact interface: `vlab.experiment-artifacts/3`
- Authoring contract: `vlab.authoring/0.6`
- Results presentation schema: `vlab.results-presentation/1`
- Runtime contract: `vlab.runtime/0.2`
- Artifact capability contract: `vlab.artifact-capabilities/0.3`
- Environment capability contract: `vlab.environment-capabilities/0.1`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Metrics measurement phase: `post-physics-wrapped-state/1`
- Production neighbour strategy: `adaptive-periodic-bvh/v1`

## #195 Metrics + live Results epic — complete

All six children are complete/deployed/accepted as applicable. #201 is the terminal acceptance child; no new science or runtime feature was added by #201.

### #196 — four compulsory artifacts — complete/deployed

Canonical required artifacts are exactly:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

An empty Metrics artifact is valid. Metrics is a read-only scientific observer and executes at the versioned measurement point `post-physics-wrapped-state/1`. Existing legacy Experiments were backfilled without changing their scientific revisions.

Primary #196 merge: `bad877a5c8b60391f12617779763b725f1167bc0`; migration-order repair: `082365d0861cda618e68e91960cf2cd949992f00`.

### #197 — multi-metric runtime buffering — complete/deployed/recertified

Runtime executes multiple Metrics IR definitions with independent exact periodic/final policies. Periods that cannot be scheduled exactly on the simulation timestep are rejected rather than rounded.

Samples carry stable metric ID + scientific time. Runtime queue capacity is 262,144 samples; overflow state is explicit. Worker→UI batches are bounded at 4,096 samples on roughly 100 ms wall-clock cadence. No durable disk/database write occurs on the simulator hot path.

Primary merge: `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`; production packaging recertification: `a87ad175f3527b404fcf7adf096cb6cb0a1d882e`.

### #198 — co-located live Results — complete/deployed/owner-accepted

Results remain on the Experiment screen beside/below the running simulation. Generic time-series panels bind one or more stable metric IDs; the same metric may appear in multiple panels; colors are deterministic by metric ID. Pan/zoom/inspection is supported, rendering is throttled independently from scientific sampling, and display reduction never mutates retained samples.

The built-in Active Elastic acceptance fixture contains two owner-authorized live metrics:

- `polarization` — `psi = ||sum_i heading_i|| / N`, sampled every `0.1 s` for Virtual Lab acceptance/display. This cadence is not claimed to reproduce the paper's analysis/output cadence.
- `angular_momentum` — separately owner-authorized normalized instantaneous milling/angular-momentum complement. It is not claimed as a verbatim second equation from Ferrante et al. PRL.

Owner phone acceptance on 16 September 2026 confirmed the deployed two-metric live Results behavior, panel creation/reuse/multi-series behavior, stable colors and usable foldable layout. Do not ask for the polarization formula or cadence again.

Key merges: `3197b937a00dbdc7c91fccfc571dfe54fd73ea5a` initial UI; `7b6c62e094d00a88f68126e056180d0baf73a191` two-real-metric generalization; `f1cd52a598e31dfbd5397e658023da427d74be9f` obsolete registry-v2 cleanup.

Later UI polish is tracked under #207, including discoverability of the metric selector and a clear return-to-follow-live interaction after plot pan/zoom.

### #199 — local single-run result persistence — complete/deployed

Primary persistence merge PR #225: `c39979ee15d4682497d9a96f08a0c661c9424f79`.
Final package-semantics cleanup PR #227: `7fdff0d78c2192d45cb23e8c7e076bbbf3394b1d`.

The canonical scientific result is ordinary user-visible files under a user-selected Virtual Lab workspace root where writable-directory access is supported. Browser-private storage is not the scientific archive. IndexedDB may remember a directory handle only; it does not contain the metric sample data.

For a selected Experiment, standalone run output is flat:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      polarization_000001.csv
      angular_momentum_000001.csv
      polarization_000002.csv
      angular_momentum_000002.csv
      ...
```

There is **no per-run directory**. Each metric file is named from its stable metric ID plus a six-digit increasing run number. Multiple metric files with the same suffix belong to the same run. Existing runs are never overwritten. Compact Lab-managed reproducibility/debugging bookkeeping lives under `<Experiment>/.vlab/`, outside ordinary `runs/`.

Persistence behavior:

- default flush cadence: 5 s, user-adjustable independently from scientific sampling;
- flushes are asynchronous and outside the simulation hot path;
- pause flushes without ending the run;
- restart/reconfiguration/completion/runtime failure records explicit terminal state;
- pending persistence is bounded; if storage falls behind to the bound the Lab pauses rather than silently dropping scientific data;
- `Download experiment package` packages all completed retained standalone runs for the selected Experiment using the same flat hierarchy plus compact `.vlab/` bookkeeping;
- package export is secondary and is not the canonical automatic-persistence path where direct folder writing exists.

Production verification includes two consecutive runs producing the expected flat metric files without overwrite or run subdirectories. The owner could not exercise the writable-directory path on the phone and explicitly allowed a later desktop spot-check to remain non-blocking.

### #200 — MCP/Connector fine-grained Metrics + Results authoring — complete/deployed

PR #231 merged as `31239dea1174cddf0c4d2d5578034ca55e6b941d`.

The deployed MCP/Connector exposes `author_metrics_results` for fine-grained read/create/update/remove metric operations plus upsert/remove time-series Results panel bindings. Metric identity remains stable across updates; changing identity requires explicit remove/create. Removing a metric prunes it from saved Results panels. Panel bindings can reference multiple metric IDs, and one metric can appear in multiple panels.

Results presentation state is persisted separately in `public.experiment_results_presentations` under schema `vlab.results-presentation/1`. Presentation edits have their own optimistic revision and do **not** increment the scientific Experiment revision. RLS permits visible reads and owner-only writes.

The authoring contract is `vlab.authoring/0.6`; MCP server `3.0.0`; interface `8`. Existing four-artifact whole-Experiment authoring and bounded legacy three-source compatibility remain available. Unsupported metric capabilities continue to return compile/contract diagnostics and, for Professor users, the existing capability-request path rather than granting simulator-development access.

The browser loads a saved connector-authored Results presentation when one exists; with no saved presentation it preserves the normal default Results layout. No arbitrary plotting code and no Study behavior were added.

PR head `9524bf9ab63baab599e2660723049c8e6857d640` passed Round 1A run `35082298949` and performance run `35082298960`. After merge, production Pages run `35083140486` passed build, deploy and all deployed browser smoke checks. Supabase `experiment-mcp` is ACTIVE at Edge Function version `16`, pinned to the merged #200 commit.

### #201 — final end-to-end acceptance — complete

The already-authorized `polarization` fixture was reused exactly; no scientific definition, sampling policy or controller behavior was changed.

Terminal evidence:

- source/compiler: built-in Metrics contains `polarization` with `every(0.1)` and the accepted formula; generic tests compile it alongside `angular_momentum`;
- deployed execution: production run `35083140486` emitted both real metrics live and polarization samples at exact 0.1 s scientific-time increments while retaining the running simulation;
- Results: the same deployed smoke verified generic panel creation, separate panels, multi-series combination, metric reuse and stable automatic colors;
- restart/current-run: the Metrics bridge resets retained current-run samples on restart/reconfiguration via explicit metric-reset events; production smoke verified restart controls;
- persistence: production smoke produced two consecutive durable flat-file runs with `polarization_000001.csv`, `angular_momentum_000001.csv`, `polarization_000002.csv`, `angular_momentum_000002.csv`, with no per-run directories and no overwrite;
- MCP: Supabase `experiment-mcp` was rechecked during #201 and is ACTIVE at version `16`, pinned to `31239dea1174cddf0c4d2d5578034ca55e6b941d`; #200 contract tests cover fine-grained metric create/update/remove, stable identity and generic Results panel bindings;
- performance: run `35082298960` recorded deterministic trajectory equivalence with Metrics, zero dropped samples in profiled cases, bounded transport and asynchronous persistence. In the recorded 500-agent / 2000-tick / 3-repetition profile, four metrics sampled at 0.1 s transported 800 samples with about 0.8 ms measured transport time; serialization of 262,144 persistence samples took about 123 ms outside simulation execution.

No missing generic simulator capability was exposed. #201 therefore passes and parent #195 satisfies its completion conditions.

## Current frontier after #195

There is no automatically selected substantial implementation ticket. The owner must choose/reprioritize the next lane. Existing candidate lanes recorded in `PROJECT_CONTROL.md` are #207 UI/UX refinement, #202 editor ergonomics and later Studies/multi-run analysis.

Do not begin one merely because #195 is complete.

## UI/UX refinement state

#207 is the later consolidated refinement epic. Preserve owner observations rather than patching them piecemeal into unrelated tickets:

- Experiment identity and Save/Persistence/organization surfaces need consolidation (#208);
- Account and Professor entry surfaces need reconciliation (#209);
- unnecessary microcopy and weak responsive hierarchy need cleanup (#210);
- Results series selection works but lacks sufficient affordance;
- plot interaction can detach from the live edge without an obvious follow-live state/control;
- more deliberate Results panel arrangement/resizing can be designed in the same later pass.

## Editor lane

#202 remains separate: #203 highlighting/editor foundation; #204 outline/navigation/folding/search; #205 diagnostics/completion. Large Metrics source remains one scientific artifact; editor ergonomics must not fragment it merely for presentation.

## Professor capability-request loop

Durable flow:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted GitHub handoff → deploy/verify → implemented → research AI resumes`

Professor approval alone is not coding approval.

Currently Professor-approved but not implementation-authorized:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — simulator-owned deterministic/reproducible controller RNG capability;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — heterogeneous agent initialization/state capability.

Durable record: `docs/CAPABILITY_APPROVALS_2026-09-15.md`.

## Neighbour-search / performance state

Production `Simulation` uses `adaptive-periodic-bvh/v1` with exact receiver-radius membership, arbitrary simultaneous query radii, periodic minimum-image geometry and deterministic sorted neighbour indices.

`PeriodicGridNeighbourIndex` remains the exact reference/fallback and `BruteForceNeighbourIndex` the hidden correctness oracle. #56 remains the living performance umbrella; #179 is deferred until Study infrastructure exists.

## Scientific guardrail

Developer-side ChatGPT must not independently invent new scientific models, derivations, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling choices, retuning or claims of scientific equivalence.

Already owner-authorized scientific definitions may be reused exactly as recorded for implementation and acceptance. Reusing them does not require renewed owner approval and does not authorize changing them.

Generic simulator/software architecture, persistence, buffering, compilers, file formats, UI transport and editor tooling are software work. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metric boundaries, scientific timing/integration semantics and rendering as an observer.

Standing observation gatekeeper: global position is disallowed as a robotics controller observation capability unless the owner explicitly reverses that decision.

## Success reporting

GitHub issue #145 is the global success-only completion stream. Never post partial/failing/retrying work there. Append one `[SUCCESS REPORT]` comment only after the full ticket lifecycle reaches verified terminal success.
