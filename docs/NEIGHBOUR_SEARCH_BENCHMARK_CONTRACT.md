# Neighbour-search benchmark contract

Status: **frozen comparative contract for #168 / #169**  
Date: **15 September 2026**

This document defines the common semantic and measurement contract for the Virtual Lab neighbour-search architecture investigation. It exists so competing exact spatial-index implementations can be compared without changing the scientific problem, benchmark workload, or acceptance rules after results are known.

The design-history document remains `docs/NEIGHBOUR_SEARCH_ARCHITECTURE_INVESTIGATION_2026-09-15.md`. This document is narrower: it freezes the interface, benchmark matrix, correctness gate, measurements, and reporting rules used by implementation children under #168.

## 1. Runtime semantic contract

The existing kernel `NeighbourIndex` interface remains the authoritative runtime contract:

```rust
pub trait NeighbourIndex {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {}
    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    );
}
```

This separation is deliberate.

- `rebuild()` depends on the physical state and arena, not on one privileged scientific radius.
- A single rebuilt strategy must support any number of `query(..., radius, ...)` calls with different radii during the same control update.
- A strategy may internally maintain one grid, several grids, coverage stamps, a tree/BVH, or another exact structure.
- No strategy may require an experiment author to tune cell size, bucket count, tree depth, hash radius, level count, or similar infrastructure parameters.
- The strategy may affect computational cost only. It may not alter the mathematically defined neighbour relation.

Candidate-specific performance instrumentation belongs in the benchmark adapter/harness, not in experiment/controller APIs.

## 2. Exactness contract

A candidate result is invalid unless it first passes the brute-force oracle on the same state.

For every tested state, agent and radius:

1. rebuild the candidate once for the state;
2. rebuild/use `BruteForceNeighbourIndex` for the same state;
3. query both with the same radius;
4. require identical sorted agent-index vectors;
5. repeat all radii without rebuilding the candidate merely because the radius changed.

The gate includes:

- arbitrary single radii;
- several simultaneous radii in one update;
- radii with a large min/max ratio;
- periodic cross-boundary neighbours;
- uniform and strongly non-uniform occupancy;
- sparse, moderate and dense true-neighbour counts.

Returned order is part of the contract because controller accumulation order can affect floating-point trajectories. Candidates therefore return deterministic sorted agent indices exactly as the brute-force oracle does today.

## 3. Strategy classes in the tournament

### Permanent baselines

- `brute-force`: correctness oracle and small-N timing reference.
- `current-periodic-grid`: current production single-level radius-independent grid.

### Performance reference

- `radius-matched-single-grid`: Violet-like single grid tuned mechanically to one query radius. It measures the performance available when one uniform grid is optimized for one radius. It is **not** assumed to satisfy the general multi-radius architecture requirement.

### Serious exact candidates

- `argos-coverage-stamping`: fixed/radius-independent grid geometry with entity coverage inserted into the cells reached by the entity's range/coverage rule, followed by exact geometry.
- `multi-resolution-periodic-grid`: several simulator-owned spatial resolutions built from the same state; each radius selects an appropriate level without radius-triggered rebuild.
- `adaptive-tree-bvh`: exact adaptive spatial hierarchy (quadtree/BVH-family) supporting arbitrary radius queries.

No candidate is the declared winner. The multi-resolution strategy is currently a hypothesis only.

## 4. Frozen workload dimensions

The machine-readable contract is `benchmarks/neighbour_search_matrix.json`.

The full tournament varies these mechanical dimensions:

- population `N`: 100, 1,000, 5,000, 10,000, 25,000;
- mean density (agents / arena-area unit): 0.25, 1, 4, 16;
- radius sets:
  - single: `[1.0]`;
  - moderate multi-radius: `[0.25, 1.0, 4.0]`;
  - wide multi-radius: `[0.1, 1.0, 10.0]`;
- spatial occupancy:
  - uniform grid;
  - deterministic clustered occupancy;
  - deterministic periodic-boundary bands.

For density-derived tournament cases, arena side length is `sqrt(N / density)`. This is a benchmark construction rule only; it does not alter simulator science.

The cartesian full tournament is intentionally larger than the PR gate. It is designed for the later dedicated scalability Study and controlled long-running performance jobs.

## 5. CI contract-smoke matrix

Every strategy must first pass a small deterministic matrix on ordinary CI. The current frozen smoke cases are listed explicitly in `benchmarks/neighbour_search_matrix.json` and cover:

- small uniform / single radius;
- uniform / several simultaneous radii;
- a large min/max radius ratio;
- strongly clustered occupancy;
- periodic-boundary bands.

The CI smoke matrix exists to catch semantic/interface regressions cheaply. It is not used to declare a performance winner.

## 6. State generation

Benchmark states are deterministic and simulator-mechanical.

- `uniform-grid`: agents are placed on a deterministic square lattice covering the periodic arena.
- `clustered`: a fixed majority is placed on a dense deterministic lattice inside a small subregion; the remainder is spread over the arena. This stresses non-uniform bucket/tree occupancy without invoking any swarm model.
- `boundary-bands`: agents are placed in deterministic bands immediately inside opposite periodic boundaries, forcing exact cross-boundary queries.

No controller or scientific collective behavior is used to construct benchmark states.

## 7. Required measurements

Every serious candidate must eventually report, for each scenario:

### Common measurements

- strategy identifier/version;
- scenario identifier;
- N and arena size;
- complete radius set;
- rebuild/update wall time;
- total wall time for all queries across all radii;
- total number of queries;
- average exact returned-neighbour count;
- control-update / model-time throughput when integrated into the runtime;
- end-to-end simulated-time / wall-time throughput when integrated into the browser/runtime.

### Strategy-internal measurements, where meaningful

- total index entries / memory proxy;
- occupied buckets/nodes/regions;
- regions/cells/nodes visited per query;
- candidate distance checks per query;
- duplicate-candidate suppression work if the algorithm can generate duplicates;
- tree traversal depth or hierarchy level used, where applicable.

A metric that genuinely does not exist for an architecture is reported as not applicable, not replaced with an invented analogue.

## 8. Timing discipline

- Correctness validation runs before timing.
- Candidate and oracle operate on identical immutable states.
- Rebuild timing is separated from query timing.
- Multi-radius query timing uses one candidate rebuild, then executes the entire ordered radius set.
- The radius order in a scenario is fixed and recorded.
- Timing repetitions use the same workload and report at least the median; later Study work should retain raw samples as artifacts.
- CI timings are diagnostic only. Cross-strategy conclusions should use the same runner class/environment and retain environment metadata.
- Browser/WASM and native results are reported separately.

## 9. Fairness rules

A candidate may use simulator-owned automatic internal choices, but:

- it may not receive hidden per-scenario hand tuning unavailable to another candidate;
- it may not inspect the expected brute-force result;
- it may not change or approximate the query radius;
- it may not omit periodic handling;
- it may not trade exactness for speed;
- it may not change state ordering or controller semantics;
- any automatic policy used by a candidate must be deterministic and documented.

The radius-matched single-grid reference is the explicit exception to the first rule because its purpose is to quantify the single-radius tuning upper bound. It must always be labelled as a reference, not silently compared as a fully general strategy.

## 10. Selection policy after the tournament

Do not choose a production default before the common tournament exists.

If one exact strategy dominates the relevant workload space, production may use it directly. If different exact strategies dominate distinct mechanical regimes, Virtual Lab may retain multiple strategies behind the same `NeighbourIndex` semantics with:

- ordinary-user default: `auto`;
- deterministic simulator recommendation/selection based only on mechanical workload characteristics;
- optional expert override for benchmarking/reproducibility;
- selected strategy and version recorded in provenance.

The selector itself is a later issue. #169 does not implement it.

## 11. Future Study

When Studies/results infrastructure is available, the full tournament should become a persistent Virtual Lab Study so scalability claims are reproducible from the lab itself. The Study should retain scenario definitions, strategy/version, runner metadata, raw samples, aggregate metrics and crossover plots.

No publication/novelty claim follows from this engineering investigation. A separate literature review is required before any such claim.

## 12. #169 stop boundary

#169 freezes this contract and installs a candidate-independent smoke harness for the existing baselines. It must not implement ARGoS coverage stamping, multi-resolution grids, tree/BVH indexing, automatic selection, or a new production default.
