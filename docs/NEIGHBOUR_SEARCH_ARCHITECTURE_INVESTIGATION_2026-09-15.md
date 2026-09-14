# Neighbour-search architecture investigation

Status: **durable architecture record / active investigation**  
Date: **15 September 2026**  
Parent performance epic: **#56**  
Current investigation issue: **#168**

This document is intended to remain in the repository as the durable record of why Virtual Lab treats neighbour discovery as a first-class simulator architecture problem rather than a local optimization.

## Why this matters

Neighbour discovery is on the critical path of most swarm simulations. The simulator must answer local-neighbour queries exactly and efficiently across large populations, changing densities, periodic boundaries, heterogeneous spatial distributions, and potentially several simultaneous sensing/interaction/communication radii.

The core architectural requirement established early in Virtual Lab is:

> **Scientific sensing/interaction radii are experiment semantics. Spatial-index geometry is simulator infrastructure. One must not be coupled to the other for correctness.**

A single simulation may legitimately require several radii at the same control update. The simulator must therefore support arbitrary simultaneous radii without requiring the experimenter to tune a hash/grid parameter and without changing the scientific neighbour set.

Strategy selection may affect cost only. Every exact strategy must return the same neighbour set, under the same deterministic ordering contract, as the brute-force oracle.

## Design history

### 1. Brute-force baseline

The original kernel used exact all-pairs neighbour discovery. It is conceptually ideal as a correctness reference but scales quadratically in candidate distance checks.

`BruteForceNeighbourIndex` remains the oracle and should remain available permanently for tests and small-N reference runs.

### 2. Violet proximity chunks

The Violet simulator was inspected as an early reference. Its current `ProximityEngine` uses a deterministic spatial chunk map. It is not approximate-nearest-neighbour LSH in the usual sense.

The important implementation property is that Violet derives spatial resolution directly from the scientific proximity radius:

- `chunk_size = 2 * radius`;
- the chunk store is rebuilt with that geometry;
- the accurate query checks a small number of geometrically relevant chunks;
- final membership is decided by an exact Euclidean radius test.

This is efficient for one dominant radius, but it couples index geometry to that radius. It is therefore not the general Virtual Lab architecture: if one simulation uses several simultaneous radii, there is no unique scientific radius from which the one index should be built.

Violet remains a useful **performance-reference strategy**, not the architectural target.

### 3. ARGoS range-and-bearing investigation

The maintained ARGoS implementation (`ilpincy/argos3`, Carlo Pinciroli) materially changed the design direction.

For the range-and-bearing medium:

- positional-grid resolution is independent of each robot's communication range;
- individual RAB entities retain their own ranges;
- an entity is inserted into every grid cell covered by a box corresponding to its own range;
- a receiver queries candidates associated with its location;
- exact geometric distance checks decide actual communication.

ARGoS can therefore support heterogeneous ranges without redefining the underlying grid for each range.

The important lesson adopted by Virtual Lab was the **separation of scientific range from positional-index resolution**, not a requirement to reproduce ARGoS's exact insertion algorithm.

### 4. Virtual Lab #25 / PR #34

Issue #25 implemented an ARGoS-inspired but different periodic positional index.

Production `PeriodicGridNeighbourIndex` currently:

- builds one periodic grid once per control update;
- derives `cells_per_axis = ceil(sqrt(N))`, independent of all scientific radii;
- stores each agent in one cell;
- lets each radius query inspect however many wrapped cells are necessary;
- applies the exact periodic minimum-image distance test;
- sorts returned agent indices to preserve deterministic accumulation order;
- supports several radii against the same built index;
- is tested against brute force, including periodic cross-boundary cases.

This preserved the central architecture requirement successfully.

## What #165 discovered

#165 did not show that radius-independent indexing was wrong. It showed that the **current single-level radius-independent resolution rule is not uniformly efficient**.

With the present approximately-one-cell-per-agent rule, increasing physical density makes grid cells physically smaller. For a fixed scientific query radius, the radius then spans more cells. The number of visited cells can grow from roughly 9 to 25, 49, 121, and beyond even when the actual scientific definition of a neighbour has not changed.

The #165 diagnostic compared several grid resolutions at N=5,000 while varying density and query radius. All candidates were checked against the brute-force oracle.

A grid whose cell width happened to be close to the query radius kept ordinary queries to about a 3x3 stencil and produced roughly **2–4x faster neighbour-query sweeps** in the measured cases.

This establishes:

> **The present single-level resolution introduces an avoidable indexing penalty for some density/radius combinations.**

It does **not** establish:

> The production index should be rebuilt or configured from one scientific query radius.

The latter would move back toward the Violet coupling deliberately rejected in #25 and would be ambiguous for several simultaneous radii.

## Candidate strategies for the serious investigation

The investigation should compare the following exact strategies under one common interface and correctness oracle.

### Baseline A — brute force

Purpose: correctness and small-N reference.

Strengths:
- no spatial-index assumptions;
- arbitrary radii naturally;
- simplest exact oracle.

Weakness:
- quadratic candidate work.

Not expected to be the large-swarm production winner, but it remains indispensable.

### Baseline B — current single-level periodic grid

Purpose: current production baseline.

Strengths:
- radius-independent geometry;
- one build serves arbitrary radii;
- sparse buckets;
- exact periodic semantics;
- simple implementation.

Weakness:
- one global resolution cannot be optimal across large changes in density and radius; queries can traverse many tiny cells.

### Reference C — radius-matched single grid (Violet-like performance reference)

Purpose: establish an approximate upper bound for how well a single uniform grid can perform when tuned to one radius.

Strengths:
- very small cell stencil for that radius;
- #165 already showed substantial query speedups.

Weaknesses:
- radius-coupled geometry;
- ambiguous for multiple simultaneous radii;
- rebuilding or choosing one dominant radius violates the general design objective.

This strategy is useful as a benchmark/reference and possibly for narrowly constrained specialized workloads, but it must not silently become the default general architecture.

### Candidate D — ARGoS-style coverage stamping

Keep a radius-independent grid. Instead of storing each entity only in its position cell, insert/stamp it into all cells that its applicable range covers. A receiving query can then inspect a very small spatial location and perform exact geometric filtering.

Potential strengths:
- naturally supports heterogeneous per-entity ranges;
- scientific range does not define grid resolution;
- query work can be very cheap.

Potential costs/questions:
- duplicated index entries;
- rebuild cost grows with coverage area;
- semantics are especially natural for transmitter-owned ranges such as communication, but a generic neighbour service may have several receiver-side query radii with no single per-agent range to stamp;
- periodic stamping must avoid duplicate candidates correctly.

This must be implemented as an experimental strategy and measured, not assumed superior.

### Candidate E — multi-resolution / hierarchical periodic grids

Build a small hierarchy of simulator-owned periodic grids with geometrically increasing cell widths, for example levels proportional to `h, 2h, 4h, 8h, ...`.

Every agent is indexed at each level. A query selects the level whose internal cell width best matches the requested query scale and then performs the same exact periodic distance filtering.

Crucially:
- the hierarchy is built independently of the scientific meaning of any one radius;
- several different radii can query different levels during the same control update;
- no query radius requires rebuilding the hierarchy;
- each query can usually retain a small cell stencil;
- exact membership and deterministic ordering remain unchanged.

Potential costs/questions:
- each agent is stored at several levels;
- rebuild becomes O(LN) for L levels;
- memory and cache behavior must be measured;
- level spacing and automatic hierarchy bounds must remain simulator-owned and not become experiment knobs.

This is currently the strongest architectural candidate, but it is **not yet the winner**. Evidence must decide.

### Candidate F — adaptive spatial tree (quadtree / BVH-family)

Use an adaptive spatial hierarchy instead of a uniform grid. In 2D this may be a quadtree-like structure; a BVH-family implementation is another candidate formulation.

Potential strengths:
- arbitrary query radii naturally;
- better adaptation to strongly non-uniform or clustered spatial distributions;
- avoids committing the whole arena to one uniform cell scale.

Potential costs/questions:
- all agents move, so rebuild/update costs matter substantially;
- traversal constants may exceed grid lookup for uniform swarms;
- periodic boundaries require careful exact handling;
- deterministic construction/traversal must be specified;
- implementation complexity is higher.

Again, benchmark rather than assume.

## What is *not* a candidate outcome

A user-facing `cell_size`, `hash_radius`, bucket count, tree depth, or similar low-level simulator tuning parameter is not the intended solution.

Ordinary experiment authors should specify scientific quantities. The simulator should own neighbour-index strategy and internal tuning.

## Benchmark contract

All candidate implementations must share the same exact query contract and be compared under identical deterministic physical states.

At minimum, the investigation must vary mechanically:

- population N;
- arena size / density;
- one query radius;
- **several simultaneous radii in the same control update**;
- wide ratios between smallest and largest requested radius;
- uniform and strongly non-uniform spatial occupancy;
- sparse / moderate / dense true neighbour counts;
- periodic cross-boundary configurations.

Measure separately where possible:

- index rebuild/update time;
- memory / index-entry count;
- cells/nodes/buckets visited;
- candidate distance checks;
- exact neighbours returned;
- observation-construction cost;
- controller cost;
- total control-update throughput;
- total simulated-time / wall-time throughput.

Correctness gates:

- exact equality with `BruteForceNeighbourIndex`;
- exact periodic minimum-image semantics;
- deterministic output order;
- one candidate strategy must not change scientific/runtime behavior relative to another;
- existing simulator scientific and determinism tests remain green.

## Selection architecture — later layer

The investigation should separate **implementing exact strategies** from **choosing a strategy**.

A reasonable eventual product architecture is:

1. expose a common internal `NeighbourIndex` strategy interface;
2. keep several well-supported exact implementations if evidence shows they dominate in different workload regions;
3. default ordinary users to `auto`;
4. let the simulator recommend/select a strategy from workload characteristics that are already available mechanically;
5. optionally allow an expert/developer strategy override for benchmarking and reproducibility;
6. record the selected strategy and internal version in run provenance;
7. never let strategy selection change the neighbour semantics.

An Experiment therefore should not normally need to know or care which index implementation runs it.

Any future automatic selector must itself be benchmarked and deterministic. It should use mechanical workload descriptors, not scientific interpretation of the experiment.

## Future Study: neighbour-search scalability

Once the Study/results infrastructure exists, this architecture investigation is an unusually good candidate for a first-class Virtual Lab Study.

The Study could execute a reproducible matrix across the exact neighbour-index implementations and produce:

- scaling curves versus N;
- scaling versus density;
- scaling versus one and multiple radii;
- rebuild/query cost decomposition;
- memory scaling;
- strategy crossover regions;
- end-to-end model-time throughput;
- an evidence-based strategy recommendation map.

This would exercise the same Study system intended for scientific experiments, while the subject of the Study is simulator infrastructure rather than a scientific swarm hypothesis.

Whether the resulting comparison is novel enough for publication is **not established here**. A dedicated literature review should be performed separately before making novelty claims. That review is deliberately deferred from the present architecture checkpoint.

## Investigation stages

1. **Freeze the exact contract and benchmark matrix.**
2. **Refactor only enough to host interchangeable strategies cleanly.**
3. **Implement experimental ARGoS-style coverage stamping.**
4. **Implement experimental multi-resolution periodic grids.**
5. **Implement an adaptive tree/BVH-family candidate.**
6. **Keep radius-matched single-grid as a performance reference.**
7. **Run correctness and performance tournament.**
8. **Choose production default(s) from evidence.**
9. **Only then design `auto` recommendation/selection.**
10. **Later encode the full benchmark as a persistent Study.**

Each implementation/profiling stage should be a focused child issue of #168 and must stop at a clean measured checkpoint.

## Current decision

The old #168 proposal — immediately replacing production with radius-aware/radius-matched grid geometry — is superseded.

#168 is now the comparative neighbour-search architecture investigation. No candidate has yet been declared the production winner, and no candidate implementation starts merely from this document.

## Durable references

- #25 — original radius-independent neighbour-index architecture decision.
- PR #34 / merge `463e0c5d7be0efb179ae627ec8c6ac5e5e3c4ef6` — current periodic-grid implementation.
- `docs/NEIGHBOUR_INDEX.md` — accepted production contract.
- #165 / PR #167 / merge `bb83b7f774504924a396fc9c961f9e45eaa6df45` — density/radius profiler and evidence.
- `docs/PERFORMANCE_NEIGHBOUR_DENSITY_2026-09-15.md` — #165 measurements.
- #56 — long-lived performance parent.
- #168 — current serious architecture investigation.
