# Canonical 2×2×2 neighbour-search regime matrix — #189

Date: 2026-09-15  
Parent production-decision ticket: #178  
Execution ticket: #189  
Pull request: #190

## Purpose

Complete the production-decision evidence using the Professor's three workload dimensions only:

1. population scale: **low / high**;
2. local neighbour density: **low / high**;
3. radius workload: **single / many-wide**.

This is intentionally not another broad exploratory matrix. It directly measures every combination of those three binary dimensions.

## Canonical fixtures

The fixtures isolate the three dimensions mechanically:

- low scale: `N = 100`;
- high scale: `N = 25,000`;
- low local density: uniform periodic lattice at density `0.25`;
- high local density: uniform periodic lattice at density `16`;
- single radius: `[1]`;
- many / wide simultaneous radii: `[0.1, 1, 10]`.

A uniform periodic lattice is deliberate here: the controlled density is also the local density, so layout does not become a fourth decision dimension.

Compared exact generic candidates:

- current production `PeriodicGridNeighbourIndex`;
- corrected `AdaptivePeriodicBvh`;
- `MultiResolutionPeriodicGrid`.

Brute force is correctness oracle only. Faithful ARGoS RAB is excluded because #177 already resolved the separate transmitter-range backend question.

## Correctness

All low-scale cells were checked against brute force for every agent and every active radius. High-scale cells used 17 deterministic receiver probes for every active radius, after the candidates' earlier exhaustive correctness gates from #169/#185.

All checks passed in all three unchanged workflow attempts.

## Three-run result

The table reports median combined `rebuild + complete query phase` milliseconds across the three workflow attempts. **Every winner was stable 3/3.**

| Scale | Local density | Radius workload | Current grid ms | Multi-resolution ms | BVH ms | Winner |
|---|---|---|---:|---:|---:|---|
| low | low | single | 0.036 | 0.075 | **0.027** | **BVH** |
| low | low | many / wide | 0.252 | **0.204** | 0.299 | **Multi-resolution** |
| low | high | single | 0.200 | **0.150** | 0.198 | **Multi-resolution** |
| low | high | many / wide | 0.400 | 0.244 | **0.216** | **BVH** |
| high | low | single | **8.392** | 18.191 | 13.026 | **Current grid** |
| high | low | many / wide | 108.304 | 122.976 | **85.233** | **BVH** |
| high | high | single | 73.740 | 104.302 | **53.888** | **BVH** |
| high | high | many / wide | 4828.920 | 4505.158 | **2349.179** | **BVH** |

## Direct answers for #178 discussion

### Does BVH win every nontrivial regime?

No. The high-scale / low-local-density / single-radius cell is a stable current-grid win in all three attempts.

### Does the earlier multi-resolution dense/wide win survive at the high-scale extreme?

No. At high scale + high local density + many/wide radii, BVH wins all three attempts. Median combined time:

- current grid: `4828.920 ms`;
- multi-resolution: `4505.158 ms`;
- BVH: `2349.179 ms`.

BVH is about 1.9× faster than the next candidate in this canonical extreme.

### Where does multi-resolution still win?

Only two low-scale cells in this canonical table:

- low scale + low local density + many/wide;
- low scale + high local density + single.

Both are sub-millisecond complete neighbour phases in this benchmark. Whether those low-scale wins justify production complexity is a joint Professor/developer architecture decision, not a conclusion of this measurement ticket.

### Where does the current grid still win?

One cell:

- high scale + low local density + single radius.

The win is stable 3/3 and not a tiny timing tie. Median combined time is `8.392 ms` vs `13.026 ms` for BVH and `18.191 ms` for multi-resolution.

## Evidence

Canonical workflow run: `34960261987`.

Retained artifacts:

- attempt 1: `10392539267`;
- attempt 2: `10393042717`;
- attempt 3: `10392993253`.

Each runner measurement internally uses median-of-3 timing samples; the table above then takes the median across the three independent workflow attempts.

## Stop boundary

This ticket makes no production backend choice and changes no production neighbour implementation. The completed table is returned to the Professor for the joint #178 decision before any integration proceeds.
