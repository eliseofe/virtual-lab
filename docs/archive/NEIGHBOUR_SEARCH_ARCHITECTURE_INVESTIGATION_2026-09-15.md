# Neighbour-search architecture investigation

Status: **durable architecture record / active investigation**  
Date: **15 September 2026**  
Parent performance epic: **#56**  
Investigation parent: **#168**

This document is the durable record of why Virtual Lab treats neighbour discovery as first-class simulator architecture rather than a local optimization.

## Core rule

> **Scientific sensing/interaction/query ranges are experiment semantics. Spatial-index geometry is simulator infrastructure.**

For the generic receiver-radius service, one physical state may be queried with several unrelated radii during the same control update. The generic backend must therefore support arbitrary simultaneous radii without requiring the experiment author to tune cell size/hash resolution and without silently rebuilding itself around one privileged scientific radius.

Strategy selection may change computational cost only. Exact generic strategies must return the same periodic neighbour set, in deterministic order, as the brute-force oracle.

Brute force is permanent **hidden correctness/debug infrastructure**. It is not intended as a normal Lab user option.

## Exact history

### 1. Brute force

The earliest kernel used exact all-pairs neighbour discovery. It remains the simplest correctness oracle and small-N diagnostic reference, but is not a production strategy for ordinary Lab use.

### 2. Violet review

Violet's `ProximityEngine` uses deterministic spatial chunks. Its chunk size is derived from the active proximity radius (`chunk_size = 2 * radius`) and accurate lookup then applies an exact Euclidean test.

This is attractive for a single dominant radius because only a small cell stencil is needed. It is not the general Virtual Lab architecture because one simulation may legitimately request several simultaneous radii.

Violet therefore remains a **radius-matched single-grid performance reference**, not the general architectural target.

### 3. ARGoS review and the #25 design lesson

The maintained ARGoS RAB implementation (`ilpincy/argos3`, Carlo Pinciroli) separates grid resolution from each transmitter's communication range:

- RAB entities retain their own range;
- the positional grid has simulator-owned resolution;
- each transmitter is stamped into cells covered by its own range box;
- a receiver performs a point/location lookup;
- exact geometry is then applied, including independent directional range tests when transmitter ranges differ.

The lesson adopted by Virtual Lab in #25 was **separation of scientific range from index resolution**, not literal reuse of the RAB insertion algorithm for every kind of neighbour query.

### 4. Long-standing Virtual Lab production index — #25 / PR #34

Production `PeriodicGridNeighbourIndex` has remained the active neighbour backend throughout the later performance work.

It:

- rebuilds one periodic grid per physical/control state;
- uses `cells_per_axis = ceil(sqrt(N))`, independent of all scientific radii;
- stores each agent in one positional cell;
- expands the receiver-side cell scan according to each requested radius;
- applies exact periodic minimum-image distance filtering;
- returns deterministic sorted agent IDs;
- supports several different radii against the same built index.

**No radius-coupled production replacement was ever merged.** The later proposal to do so was stopped before implementation.

## What #165 actually discovered

#165 / PR #167 was **measurement-only**. It did not modify production neighbour search.

At N=5,000 it compared the current single-level resolution with half resolution, double resolution, and a radius-matched diagnostic grid. All variants were checked against brute force.

The current approximately-one-cell-per-agent rule makes physical cells shrink as density increases. A fixed scientific radius can therefore span many tiny cells, leading to 25, 49, 121 or more bucket visits even when the neighbour semantics have not changed.

The radius-matched diagnostic kept ordinary searches near a 3x3 stencil and was about **2–4x faster** in the measured query sweeps.

This proves:

> The current single-level radius-independent **resolution heuristic** creates avoidable index work in some regimes.

It does **not** prove:

> Production should derive one grid geometry from one scientific radius.

The latter would recreate the multi-radius ambiguity that #25 deliberately avoided.

## The proposal that was never implemented

Immediately after #165, the first draft of #168 proposed a radius-aware/radius-matched production grid. The owner objected because simultaneous multiple radii are a fundamental simulator requirement.

That proposal was superseded **before implementation**. There was no temporary radius-coupled production version and no rollback. Production remained the #25 radius-independent grid.

#168 was then converted into the present comparative architecture investigation.

## #169 — frozen generic contract

#169 / PR #170 froze the comparative contract before new candidates were allowed into the tournament.

Authoritative artifacts:

- `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md`
- `benchmarks/neighbour_search_matrix.json`
- `crates/kernel/examples/neighbour_strategy_benchmark.rs`

The frozen smoke matrix includes:

- single radius;
- simultaneous multiple radii;
- wide smallest/largest-radius ratios;
- uniform and strongly clustered occupancy;
- periodic-boundary states.

One candidate rebuild is reused across an ordered radius set. Performance results are accepted only after exact brute-force equality.

## #171 — rejected fixed-halo generic coverage adaptation

#171 / PR #172 attempted to transfer one coverage-stamping idea into the generic receiver-radius API by combining:

- the current radius-independent grid resolution;
- a fixed simulator-owned one-cell stamp halo;
- receiver-side radius-dependent multi-cell scans;
- sorting/deduplication;
- exact minimum-image filtering.

This was **not faithful ARGoS RAB** and must not be called the ARGoS implementation.

It was exact, but the hybrid produced heavy duplicated candidate references and was slower than the current grid in every nontrivial multi-radius smoke case. It has therefore been removed from active candidate code in #173.

Historical evidence remains permanently in:

`docs/NEIGHBOUR_SEARCH_FIXED_HALO_ADAPTATION_RESULT_2026-09-15.md`

The negative conclusion applies only to that hybrid algorithm.

## #173 — faithful ARGoS RAB reference

#173 implements the ARGoS Range-and-Bearing spatial-index mechanism under its own correct semantics rather than forcing it into `query(receiver, radius)`.

Faithful RAB relation:

> receiver `i` receives transmitter `j` when exact geometry places `i` within transmitter `j`'s own range.

The benchmark preserves:

- transmitter-owned ranges;
- range-independent grid resolution;
- range-box stamping at rebuild;
- receiver point lookup;
- one exact pair-distance calculation followed by two independent directional range tests.

The benchmark fixes equal message sizes and no occlusion to isolate spatial indexing/routing, translates the mechanism to Virtual Lab's 2D periodic benchmark world, and validates against a dedicated transmitter-range brute-force oracle.

#173 passed equal-range and heterogeneous-range correctness cases. It is a **separate RAB benchmark family**, not a generic receiver-radius finalist.

Detailed result:

`docs/NEIGHBOUR_SEARCH_ARGOS_RAB_RESULT_2026-09-15.md`

A broader faithful RAB strategy comparison belongs to #177; #173 does not declare a winner.

## Active generic receiver-radius strategies

### Hidden oracle — brute force

Purpose: correctness/debugging and small-N reference only.

Not intended for normal user selection.

### Baseline — current single-level periodic grid

Strengths:

- radius-independent geometry;
- one build serves arbitrary simultaneous radii;
- one stored entry per agent in ordinary operation;
- exact periodic semantics;
- simple and mature production implementation.

Weakness:

- one global resolution cannot be efficient across all densities and radius scales; large `radius / cell_width` causes many bucket lookups.

### Performance reference — Violet-like radius-matched single grid

Strengths:

- excellent cell stencil when tuned to one radius;
- #165 demonstrated substantial query speedups.

Weaknesses:

- geometry is coupled to one radius;
- ambiguous as a single general backend when several radii coexist.

It remains a reference and possibly a specialized single-scale technique, not an assumed general winner.

### Candidate — multi-resolution / hierarchical periodic grid (#174)

Build several simulator-owned periodic grid levels with geometrically increasing cell widths. One rebuild creates all levels; each arbitrary query radius mechanically selects an already-built level with a suitable scale.

Desired properties:

- no one scientific radius defines the hierarchy;
- simultaneous radii can select different levels without rebuilding;
- exact periodic distance filtering remains authoritative;
- deterministic output remains unchanged;
- a small cell stencil may be retained across several scales.

Costs to measure:

- O(LN) rebuild/storage for L levels;
- memory/cache behavior;
- automatic simulator-owned hierarchy bounds/spacing.

This is currently the strongest generic architectural hypothesis, but there is **no winner yet**.

### Candidate — adaptive tree / BVH family (#175)

Use a deterministic adaptive spatial hierarchy rather than one uniform grid.

Potential strengths:

- arbitrary query radii naturally;
- adaptation to clustered/non-uniform occupancy;
- no single uniform cell scale across the arena.

Costs to measure:

- rebuild/update cost when all agents move;
- traversal constants;
- periodic handling;
- deterministic construction;
- memory/cache behavior in Rust/WASM.

## Two benchmark families must remain distinct

### Generic receiver-radius tournament (#176)

Finalists:

1. current production single-level grid;
2. Violet/radius-matched reference;
3. multi-resolution grid;
4. tree/BVH.

Brute force participates only as hidden correctness/small-N reference.

The rejected #171 fixed-halo adaptation is not a finalist.

### Faithful transmitter-range RAB comparison (#177)

Compare faithful ARGoS RAB with other exact spatial structures only when they answer the same **transmitter-owned-range** relation.

Include equal ranges as a bridge and heterogeneous ranges as the genuine RAB case.

This comparison decides whether a specialized ARGoS-style communication/RAB backend is justified independently of which strategy wins generic receiver-radius search.

## Common mechanical measurements

Where applicable record:

- population N;
- arena size / density;
- one and several simultaneous ranges;
- wide scale ratios;
- uniform and non-uniform occupancy;
- periodic boundary configurations;
- index rebuild/update time;
- index entries / memory proxy;
- cells/nodes/buckets visited;
- candidate distance checks;
- exact returned neighbours/routes;
- observation/controller cost where relevant;
- total control-update throughput;
- simulated-time / wall-time throughput.

No strategy may change scientific/runtime semantics to improve performance.

## Product direction — only after evidence

#178 is the production decision/integration issue.

Possible outcomes:

- one generic strategy dominates and becomes the production backend;
- several exact strategies have meaningful crossover regions and are retained behind deterministic mechanical `auto` selection;
- faithful ARGoS RAB is retained as a specialized communication backend while a different strategy handles generic neighbour queries.

Ordinary experiment authors should not be asked to tune cell size, bucket count, tree depth, leaf size, hash radius, or similar infrastructure parameters.

Brute force should remain hidden.

If any strategy/selector affects reproducibility/performance provenance, record its implementation/version in run provenance.

Production remains unchanged until #178.

## Future persistent Study — #179

Once Study/results infrastructure is mature, encode the complete benchmark program as a reproducible Virtual Lab Study covering N, density, one/multiple scales, occupancy heterogeneity, rebuild/query decomposition, memory, crossover regions, and end-to-end throughput.

This may become research-worthy simulator-infrastructure work, but novelty/publication claims require a separate literature review. No novelty claim is established here.

## Focused execution sequence

1. **#169 — freeze generic benchmark contract** — completed.
2. **#173 — faithful ARGoS RAB; retire fixed-halo adaptation** — current/completing.
3. **#174 — multi-resolution periodic grid**.
4. **#175 — adaptive tree/BVH**.
5. **#176 — generic receiver-radius tournament**.
6. **#177 — faithful transmitter-range RAB comparison**.
7. **#178 — production decision/integration**.
8. **#179 — persistent scalability Study**, deferred until Studies are ready.

Each child is one measured/tested checkpoint with an explicit stop boundary.

## Durable references

- #25 / PR #34 / merge `463e0c5d7be0efb179ae627ec8c6ac5e5e3c4ef6` — current production index architecture.
- `docs/NEIGHBOUR_INDEX.md` — accepted production contract.
- #165 / PR #167 / merge `bb83b7f774504924a396fc9c961f9e45eaa6df45` — measurement-only density/resolution investigation.
- `docs/PERFORMANCE_NEIGHBOUR_DENSITY_2026-09-15.md` — #165 evidence.
- #169 / PR #170 / merge `70dda6c40039a7e814c75668d7008b4fef8cdf03` — frozen generic comparative contract.
- `docs/NEIGHBOUR_SEARCH_BENCHMARK_CONTRACT.md` — benchmark contract.
- #171 / PR #172 — historical rejected fixed-halo adaptation.
- `docs/NEIGHBOUR_SEARCH_FIXED_HALO_ADAPTATION_RESULT_2026-09-15.md` — preserved negative evidence.
- #173 / PR #180 — faithful ARGoS RAB implementation/reference.
- `docs/NEIGHBOUR_SEARCH_ARGOS_RAB_RESULT_2026-09-15.md` — faithful RAB result.
- #168 — investigation parent.
- #56 — long-lived performance parent.
