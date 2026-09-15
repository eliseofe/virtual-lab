# Controlled 2×2×2×2 neighbour-search matrix — #191

Date: 2026-09-15  
Parent production-decision ticket: #178  
Execution ticket: #191  
Pull request: #192

## Purpose

Add **environment size** as an independent fourth workload dimension and complete a controlled 16-cell production-decision matrix:

1. environment size: low / high;
2. population scale: low / high;
3. local neighbour density: low / high;
4. radius workload: single / many-wide.

This supersedes using arena size inferred from density as evidence about an independent environment-size effect. It does not make a production backend choice.

## Controlled fixture

The previous #189 fixture used `arena = sqrt(N / density)`, so arena size and local density were coupled. A true full factorial cannot preserve low local spacing by forcing many agents into an arbitrarily small periodic arena.

This study therefore separates **occupied swarm footprint** from **periodic environment extent**:

- low scale: `N = 100`;
- high scale: `N = 25,000`;
- low local-density footprint: density-equivalent spacing `0.25`;
- high local-density footprint: density-equivalent spacing `16`;
- single radius: `[1]`;
- many/wide radii: `[0.1, 1, 10]`;
- low environment: the minimum arena side required to contain the low-density footprint at that scale;
- high environment: `4×` the low-environment linear side;
- each occupied footprint is centered in the corresponding arena, so changing environment size preserves N, local spacing and radii.

Actual extents:

| Scale | Low-density footprint | High-density footprint | Low environment | High environment |
|---|---:|---:|---:|---:|
| low, N=100 | 20.000 | 2.500 | 20.000 | 80.000 |
| high, N=25,000 | 316.228 | 39.528 | 316.228 | 1264.911 |

The `4×` linear factor is an engineering stress factor only. It is not an experiment-visible parameter or a claimed scientific threshold.

## Candidates and correctness

Compared exactly the existing generic candidates:

- current production `PeriodicGridNeighbourIndex`;
- corrected `AdaptivePeriodicBvh`;
- `MultiResolutionPeriodicGrid`.

Brute force remains correctness oracle only. Faithful ARGoS RAB is excluded because #177 resolved the separate transmitter-range question.

All low-scale cells were checked against brute force for every agent and every active radius. High-scale cells used 17 deterministic receiver probes for every active radius in addition to the existing #169/#185 exactness evidence. All correctness gates passed in all three unchanged workflow attempts.

## Three-run result

Metric: median combined `rebuild + complete query phase` milliseconds across three unchanged workflow attempts. `Advantage` is `second-place time / winner time`. Every high-scale winner was stable 3/3. Three sub-millisecond low-scale cells changed winner across attempts and are explicitly marked unstable.

| Environment | Scale | Local density | Radii | Current ms | Multi-res ms | BVH ms | Winner, second | Advantage | Stable 3/3 |
|---|---|---|---|---:|---:|---:|---|---:|:---:|
| low | low | low | single | 0.054 | 0.109 | **0.031** | **BVH, Current** | **1.75×** | yes |
| low | low | low | many/wide | 0.364 | **0.246** | 0.345 | **Multi-res, BVH** | **1.40×** | yes |
| low | low | high | single | **0.126** | 0.140 | 0.133 | **Current, BVH** | **1.06×** | no |
| low | low | high | many/wide | 0.455 | **0.347** | 0.351 | **Multi-res, BVH** | **1.01×** | no |
| high | low | low | single | 0.118 | 0.115 | **0.044** | **BVH, Multi-res** | **2.60×** | yes |
| high | low | low | many/wide | 0.309 | 0.261 | **0.223** | **BVH, Multi-res** | **1.18×** | yes |
| high | low | high | single | 0.144 | 0.155 | **0.128** | **BVH, Current** | **1.12×** | no |
| high | low | high | many/wide | 0.391 | 0.370 | **0.339** | **BVH, Multi-res** | **1.09×** | yes |
| low | high | low | single | **10.986** | 31.753 | 15.730 | **Current, BVH** | **1.43×** | yes |
| low | high | low | many/wide | 170.024 | 161.175 | **104.604** | **BVH, Multi-res** | **1.54×** | yes |
| low | high | high | single | 110.644 | 121.244 | **64.147** | **BVH, Current** | **1.72×** | yes |
| low | high | high | many/wide | 2907.437 | 4390.640 | **2549.321** | **BVH, Current** | **1.14×** | yes |
| high | high | low | single | 31.235 | 22.321 | **15.732** | **BVH, Multi-res** | **1.42×** | yes |
| high | high | low | many/wide | 162.236 | 151.756 | **102.189** | **BVH, Multi-res** | **1.49×** | yes |
| high | high | high | single | 1191.756 | 120.290 | **64.031** | **BVH, Multi-res** | **1.88×** | yes |
| high | high | high | many/wide | 6202.834 | 4468.047 | **2549.261** | **BVH, Multi-res** | **1.75×** | yes |

## Direct answers for #178 discussion

### Does environment size independently change a winner?

Yes.

The most important controlled pair is **high scale + low local density + single radius**:

- low environment, side `316.228`: **Current grid** wins at `10.986 ms`; BVH is second at `15.730 ms` — current advantage `1.43×`;
- high environment, side `1264.911`, with the identical N, occupied footprint/local spacing and radius: **BVH** wins at `15.732 ms`; multi-resolution is second at `22.321 ms` — BVH advantage `1.42×`.

So the previous current-grid win is **not** a generic consequence of sparse high-scale interaction. It belongs to the smaller-environment side of that controlled pair. Making the same sparse swarm's environment much larger flips the winner to BVH.

### Does BVH lose because the environment becomes extremely large?

No in this study. At **high scale**, all four high-environment cells are stable BVH wins:

- low density + single: BVH, `1.42×` over multi-resolution;
- low density + many/wide: BVH, `1.49×` over multi-resolution;
- high density + single: BVH, `1.88×` over multi-resolution;
- high density + many/wide: BVH, `1.75×` over multi-resolution.

This is consistent with the BVH implementation: tree node count is driven by indexed agents/leaf capacity, not arena side. Environment extent changes query geometry/pruning but does not create extra BVH branches by itself.

### Where does a robust non-BVH win remain at high scale?

Exactly one of eight high-scale cells:

- **low environment + low local density + single radius → Current grid**, stable 3/3, `1.43×` over BVH.

The other seven high-scale cells are stable BVH wins.

### Does multi-resolution retain a robust high-scale production regime?

No in this controlled matrix. Multi-resolution is second in several high-environment cells, but it wins **zero** of eight high-scale cells.

### Low-scale result

Low-scale timings are all sub-millisecond and three cells are unstable across attempts. Stable low-scale specialist wins exist, but this study does not use them to make the production architecture decision; their absolute neighbour-phase cost is tiny compared with the high-scale regimes that motivated #178.

## Evidence

Workflow run: `34963048335`.

Retained artifacts:

- attempt 1: `10394078243`;
- attempt 2: `10394098763`;
- attempt 3: `10394720341`.

Each workflow attempt internally uses median-of-3 timing samples; the table above then takes the median across the three independent attempts.

## Stop boundary

#191 makes no production backend choice and changes no production neighbour implementation. The completed matrix is returned for the joint Professor/developer #178 decision before integration proceeds.
