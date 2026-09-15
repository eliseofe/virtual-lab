# Virtual Lab — Metric runtime foundation (#197)

Date: **15 September 2026**

Status: **implemented, merged, deployed, and production-smoke verified**.

Implementation PR: **#213**  
Main merge SHA: `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`

This document records the accepted software/runtime result of #197 / #195.2. It does not define any scientific metric formula.

## Runtime contract preserved from #196

Metrics use the already-frozen contract:

- language: `python-vlab-metrics/0.1`;
- IR: `vlab.metrics-ir/0.1`;
- measurement phase: `post-physics-wrapped-state/1`;
- observation boundary: read-only global physical snapshot;
- scalar samples are keyed by stable metric ID and scientific time.

Metric observation therefore sees the canonical physical state **after** the due physics update and periodic wrapping, at the resulting scientific time. #197 does not change that scientific timing convention.

## Implemented runtime architecture

The Rust/WASM runtime now executes validated Metrics IR during a normal Experiment run.

Each metric keeps its own declared sampling policy. Periodic intervals must be exactly schedulable as integer multiples of `PHYSICS_DT`; the runtime rejects an unschedulable interval rather than rounding it. `final()` metrics execute once on explicit run finalization.

Metric evaluation remains read-only. The Metrics evaluator has no API for actions, world mutation, controller-private state, RNG consumption, filesystem, network, or unrestricted host/simulator access.

The implementation wraps the existing production `Simulation` rather than duplicating physics/controller execution. Advances are split only when needed to land exactly on a due metric tick, then the metric reads the resulting simulation state in Rust/WASM. No full agent-state copy to JavaScript is required merely to evaluate metrics.

## Three independent cadences

#197 establishes the separation required by #195:

1. **scientific metric cadence** — each metric's declared `every(...)` / `final()` policy;
2. **worker/UI transport cadence** — compact samples are drained to JavaScript in batches independently of rendering;
3. **durable persistence cadence** — intentionally not implemented here; #199 owns local persistence/flush/export.

The normal arena render snapshot cadence remains approximately 60 Hz. Metric sample transport uses a separate approximately 100 ms wall-clock cadence and drains at most 4096 samples per batch in ordinary continuous execution.

There is no durable database/local-storage write on the simulation hot path.

## Managed buffering and overflow semantics

The metric runtime owns a bounded queue with capacity **262,144 scalar samples**.

A buffered sample stores the metric identity indirectly by metric index until transport serialization, plus:

- scientific time;
- scalar value.

Transport exposes stable metric ID, scientific time and value through `vlab.metric-sample-batch/0.1`.

Overflow is explicit, never silently treated as complete data. Batch/status metadata includes:

- `capacity_samples`;
- `remaining_samples`;
- cumulative `dropped_samples`;
- `first_dropped_scientific_time`;
- `complete` (`false` after any drop).

This makes data loss detectable by #198/#199 and later Study/result layers.

## Browser/authoring integration

The required Metrics artifact is compiled and passed to the worker for initialization and runtime restarts.

Metrics edits participate in the existing **Apply changes & restart** flow. Metrics-only edits restart with the new compiled Metrics IR; edits combined with Configuration/Initialization/Controller piggyback the same existing apply/restart transaction.

#197 deliberately adds **no Results visualization**. Metric batches are an internal runtime stream for #198 to consume.

## Correctness tests

Automated coverage verifies:

- multiple periodic metrics keep independent cadences and stable identities;
- `final()` metrics emit exactly once at finalization;
- unschedulable periodic intervals are rejected instead of rounded;
- buffer overflow is explicit;
- metric observation/drain does not alter the simulation trajectory;
- worker rendering and metric-transport cadences are independent;
- no persistence/database API is introduced into the worker hot path;
- the Metrics runtime bridge loads before normal simulator startup and uses the existing apply/restart action.

## Performance evidence

PR-head performance workflow: `34999061762` — **success**.

Dedicated browser/WASM profile:

- 500 agents;
- 2,000 physics ticks = 20 scientific seconds;
- 3 repetitions per case;
- zero metrics;
- one cheap metric at 0.1 s;
- four cheap metrics at 0.1 s;
- four cheap metrics at 0.02 s;
- four cheap metrics at 0.5 s;
- sample transport disabled/enabled.

The test metrics are software probes (`snapshot.agent_count` / time), not scientific benchmark metrics.

Observed emitted sample counts matched the declared cadences exactly over 20 scientific seconds:

| Case | Samples |
| --- | ---: |
| one metric every 0.1 s | 200 |
| four metrics every 0.1 s | 800 |
| four metrics every 0.02 s | 4,000 |
| four metrics every 0.5 s | 160 |

All tested cases reported **0 dropped samples**.

Measured batch serialization/drain cost on the CI runner was approximately:

- 200 samples: 0.6 ms;
- 800 samples: 0.9 ms;
- 4,000 samples: 2.9 ms;
- 160 samples: 0.6 ms.

Fresh-worker advance timings are noisy and are not used to claim negative or sub-zero metric cost. The matrix showed no measurable framework regression relative to its zero-metric cases, while serialization/transport cost was measured independently.

Most importantly, the final state of the metric-enabled trajectory matched the zero-metric trajectory **exactly** in the deterministic comparison.

## Regression/deployment evidence

Final PR-head workflows on `bb31be8e1995fce72b2b58c276058c0c3934beaf`:

- Round 1A build: `34999061792` — success;
- canonical neighbour regime matrix: `34999061946` — success;
- performance profile: `34999061762` — success;
- faithful RAB strategy comparison: `34999062387` — success;
- generic neighbour tournament: `34999061926` — success.

Production main workflow on merge SHA `95d3e64e4ccb79ef4551411f0f19cdba78d31c32`:

- run `34999390621`;
- Rust/kernel tests: success;
- compiler/Node tests: success;
- WASM build: success;
- static artifact verification: success;
- GitHub Pages deploy: success;
- deployed browser kernel/editor smoke: success;
- deployed responsive hierarchy/focus smoke: success.

## Stop boundary / next ticket

#197 stops at runtime metric execution, managed buffering, batched transport and performance evidence.

It does **not** implement:

- live Results plotting (#198);
- local durable result persistence/export (#199);
- MCP Results-panel authoring (#200);
- Studies;
- any paper-specific metric formula.

The next substantial #195 implementation ticket is **#198 / #195.3 — co-located live Results UI with configurable multi-series plot panels**.
