# Virtual Lab — Current Project State

Updated: **16 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Older implementation history remains available in Git history and archived state files.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Experiment MCP Edge Function: version 15
- MCP server version: **2.5.0**
- MCP health interface: **7**
- Capability request interface: `vlab.capability-request/1`
- Registry schema: `vlab.registry-experiment/3`
- Experiment artifact interface: `vlab.experiment-artifacts/3`
- Authoring contract: `vlab.authoring/0.5`
- Experiment interface: **7**
- Runtime contract: `vlab.runtime/0.2`
- Artifact capability contract: `vlab.artifact-capabilities/0.3`
- Environment capability contract: `vlab.environment-capabilities/0.1`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Production neighbour strategy: `adaptive-periodic-bvh/v1`

## Current #195 implementation state

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

Results remain on the Experiment screen beside/below the running simulation. Generic plot panels bind one or more stable metric IDs; the same metric may appear in multiple panels; colors are deterministic by metric ID. Pan/zoom/inspection is supported, rendering is throttled independently from scientific sampling, and display reduction never mutates retained samples.

Active Elastic production acceptance uses two owner-authorized live metrics: polarization and a normalized rotation/milling/angular-momentum complement. The latter is not claimed as a verbatim formula printed in Ferrante et al. PRL; it was explicitly owner-authorized for product acceptance.

Multi-metric owner acceptance was confirmed on phone. Later UI polish is tracked under #207, including discoverability of the metric selector and a clear return-to-follow-live interaction after plot pan/zoom.

Key merges: `3197b937a00dbdc7c91fccfc571dfe54fd73ea5a` initial UI; `7b6c62e094d00a88f68126e056180d0baf73a191` two-real-metric generalization; `f1cd52a598e31dfbd5397e658023da427d74be9f` obsolete registry-v2 cleanup.

### #199 — local single-run result persistence — complete/deployed

PR #225 merged as `c39979ee15d4682497d9a96f08a0c661c9424f79`.

The canonical scientific result is ordinary user-visible files under a user-selected Virtual Lab workspace root where writable-directory access is supported. Browser-private storage is not used as the scientific archive. IndexedDB may remember a directory handle only; it does not contain the metric sample data.

For a selected Experiment, standalone run output is deliberately flat:

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

There is **no per-run directory**. Each metric file is named from its stable metric ID plus a six-digit increasing run number. Multiple metric files with the same suffix belong to the same run. Existing runs are never overwritten.

Compact Lab-managed bookkeeping lives under `<Experiment>/.vlab/`, outside the ordinary `runs/` directory. It records enough run/reproducibility state to identify Experiment identity, runtime context, metric definitions, completion state and dropped-sample state without placing one visible JSON file beside every metric file.

Future Studies must reuse the same single-run data contract under:

```text
<Experiment>/studies/<Study>/runs/
```

Study orchestration itself is not implemented by #199.

Persistence behavior:

- default flush cadence: 5 s, user-adjustable independently from scientific sampling;
- flushes are asynchronous and outside the simulation hot path;
- pause flushes without ending the run;
- restart/reconfiguration/completion/runtime failure creates explicit terminal state;
- pending persistence is bounded at 524,288 samples; if storage falls behind to that bound the Lab pauses rather than silently dropping scientific data;
- hiding the page triggers a best-effort immediate flush;
- direct folder location cannot be changed in the middle of an active run;
- browsers without supported writable-directory access use a portable one-file ZIP fallback for completed runs rather than treating browser-private storage as canonical durability.

The portable fallback contains flat metric CSV files plus internal `.vlab` run metadata inside the archive; this fallback packaging does not alter the direct user-visible workspace layout.

CSV metric file contract is intentionally simple:

```text
scientific_time,value
0.1,...
0.2,...
```

#### #199 verification evidence

PR checks passed both Round 1A and the performance-profile suite. The persistence-specific premerge browser smoke ran the actual Active Elastic compiler→worker→metric pipeline with only the writable-filesystem API replaced by a deterministic in-memory test implementation. It verified:

- selection of a workspace root;
- first run created exactly `polarization_000001.csv` and `angular_momentum_000001.csv`;
- second run created `_000002.csv` files without overwrite;
- `runs/` contained files, not per-run directories;
- hidden bookkeeping recorded start/flush/terminal state;
- async flushing produced no automatic backpressure pause in the tested runs;
- no JavaScript exception occurred.

Persistence-only serialization profile: 8 metrics × 32,768 samples = 262,144 samples, about 7.29 MB CSV output, approximately 122.45 ms serialization time on the CI runner. This measures storage serialization separately from scientific metric computation.

Production Pages run `35031228033` passed build, deploy and every smoke, including the dedicated deployed local-result-persistence smoke, ordinary browser/kernel smoke, real built-in metric smoke, live Results smoke and responsive/focus smoke.

## Current frontier

**#196, #197, #198 and #199 are complete/deployed. The active next substantial implementation ticket is #200 / #195.5: MCP/Connector fine-grained Metrics + Results binding authoring.**

Then #201 performs the final owner-defined scientific end-to-end acceptance for #195.

Do not start #200 or #201 merely because this state file is read; obey `PROJECT_CONTROL.md` and the current owner instruction.

## UI/UX refinement state

#207 is the later consolidated refinement epic. Preserve owner observations rather than patching them piecemeal into unrelated tickets:

- Experiment identity and Save/Persistence/organization surfaces need consolidation (#208);
- Account and Professor entry surfaces need reconciliation (#209);
- unnecessary microcopy and weak responsive hierarchy need cleanup (#210);
- Results series selection works but currently lacks sufficient affordance;
- plot interaction can detach from the live edge without an obvious follow-live state/control;
- more deliberate Results panel arrangement/resizing can be designed in this same later pass.

Simulation and Authoring remain acceptable structural baselines. Product Design is connected and may be used when #207 is deliberately activated.

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

Developer-side ChatGPT must not independently invent scientific models, derivations, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling choices, retuning or claims of scientific equivalence.

Generic simulator/software architecture, persistence, buffering, compilers, file formats, UI transport and editor tooling are software work. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metric boundaries, scientific timing/integration semantics and rendering as an observer.

Standing observation gatekeeper: global position is disallowed as a robotics controller observation capability unless the owner explicitly reverses that decision.

## Success reporting

GitHub issue #145 is the global success-only completion stream. Never post partial/failing/retrying work there. Append one `[SUCCESS REPORT]` comment only after the full ticket lifecycle is verified terminal success.
