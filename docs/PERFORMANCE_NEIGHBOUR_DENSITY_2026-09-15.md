# Neighbour-density / spatial-index profile — 15 Sep 2026

Issue: #165 / performance epic #56. Measurement only; no production neighbour semantics were changed.

## Question

The production periodic grid currently chooses `ceil(sqrt(N))` cells per axis, independent of the scientific interaction/query radius. The owner observed that otherwise similar experiments can have very different speed as neighbour density changes. This profile asks whether internal grid resolution materially amplifies that slowdown.

## Method

A deterministic native profiler was added for N=5,000 synthetic states. It varies mechanical density and query radius and compares four internal grid geometries:

- current: `ceil(sqrt(N))` cells per axis;
- half-resolution: half as many cells per axis;
- double-resolution: twice as many;
- radius-matched: `floor(arena_size / radius)` cells per axis, so cell size is at least the query radius and normal queries inspect 3×3 cells.

For each case it records bucket occupancy, visited cells, non-empty bucket visits, candidate distance checks, accepted neighbours and full query-sweep time. Every diagnostic policy is checked against `BruteForceNeighbourIndex`; all returned exactly the same sorted neighbour sets.

Authoritative CI evidence: performance workflow `34905824329`, artifact `10371728802`, PR #167 head `c8d2d3e1cde602157d370ed44bd24f759e438ac4`.

## Key measurements

| Case | Avg neighbours | Current cells visited/query | Radius-matched cells/query | Current diagnostic sweep | Radius-matched sweep | Speedup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| density 0.25, r=1 | 0.0 | 9 | 9 | 2.02 ms | 1.03 ms | 1.96× |
| density 1, r=1 | 3.98 | 25 | 9 | 5.35 ms | 2.03 ms | 2.63× |
| density 4, r=1 | 11.93 | 49 | 9 | 10.97 ms | 2.91 ms | 3.78× |
| density 16, r=1 | 47.67 | 121 | 9 | 28.00 ms | 8.52 ms | 3.29× |
| density 1, r=0.5 | 0.0 | 9 | 9 | 2.19 ms | 1.04 ms | 2.10× |
| density 1, r=2 | 11.93 | 49 | 9 | 10.53 ms | 2.90 ms | 3.63× |
| density 1, r=4 | 47.67 | 121 | 9 | 27.40 ms | 8.53 ms | 3.21× |

The radius-matched candidate was the fastest of the four candidates in all seven measured cases. Double-resolution was consistently worse. Half-resolution helped once the current grid began spanning many cells, but was not robust in sparse/small-radius cases.

## Interpretation

The owner-observed density dependence has two components.

1. **Unavoidable work:** more actual neighbours means more returned neighbour records, observation construction and controller-loop work. The existing native profile shows controller cost rising strongly with average neighbour count; this cannot be removed by an index policy without changing semantics.
2. **Avoidable index amplification:** the current one-cell-per-agent grid makes cells progressively smaller as spatial density rises. For a fixed query radius, `ceil(radius / cell_size)` therefore grows and the query scans 25, 49, 121 or more hash cells. The profile shows this overhead is material.

The important boundary is that using the existing query radius to choose internal grid geometry is an implementation optimization only. The scientific radius, exact minimum-image membership and sorted deterministic output remain unchanged.

## Next focused implementation

#168 proposes the smallest production change: make periodic-grid resolution radius-aware, preserve the brute-force oracle and deterministic ordering, then measure before/after query, observation and end-to-end throughput. It must not expose a user-facing hash/grid parameter or retune any scientific input.

#165 stops at this measurement and recommendation boundary.