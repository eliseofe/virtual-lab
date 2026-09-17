# Generic neighbour-search tournament — #176

Date: 2026-09-15  
Parent investigation: #168  
Tournament issue: #176  
Execution child: #183  
Corrective exactness issue: #185  
Pull request: #184

## Executive conclusion

There is **no universal generic winner** across the measured regimes.

Among the three admissible radius-independent generic candidates, the corrected adaptive periodic BVH wins the median tournament in **26/34 scenarios**. The multi-resolution periodic grid wins **5/34**, and the current production single-level periodic grid wins **3/34**.

Across three independent GitHub Actions attempts on the same final code, **31/34 scenarios chose the same winner in all three attempts**. The three unstable crossover cases were:

- `n1000-d1-uniform-grid-single`;
- `n1000-d1-uniform-grid-wide`;
- `n5000-d1-uniform-grid-single`.

Those cases must not be used to infer sharp automatic-selection thresholds.

The evidence supports a later production `Auto` policy, but **does not justify one hard-coded backend for every experiment**. If one generic backend had to be chosen from this native tournament alone, the adaptive periodic BVH is the strongest overall candidate. A production selector should nevertheless retain:

- the current grid for simple/sparse/single-radius regimes where its rebuild and traversal simplicity wins;
- multi-resolution for wide-radius-ratio regimes where avoiding single-level cell-lookup amplification can dominate, especially at high density;
- BVH as the broad default candidate for multi-radius, non-uniform, boundary-heavy, and many larger cases.

Production integration and browser/WASM crossover validation remain deferred to #178. #176 makes **no production backend change**.

## Architectural constraints preserved

All admissible candidates preserve the #25 invariant:

- scientific sensing/interaction radii do not define simulator spatial-index geometry;
- one built index supports several simultaneous receiver-side query radii;
- periodic minimum-image distance remains the authoritative final membership test;
- output ordering remains deterministic;
- brute force remains hidden correctness infrastructure.

The radius-matched/Violet-like strategy was retained only as a performance reference. It is not an admissible generic production backend because its index geometry is constructed from scientific query radius.

## Correctness gate

The frozen #169 smoke matrix passed exact brute-force equality for every finalist before timing.

The first full tournament exposed a tiny BVH discrepancy on large periodic-boundary states that sampled probes had missed. The result was rejected. #185 then made BVH broad-phase pruning conservative and added an exhaustive large regression:

- 5,000 deterministic boundary-band agents;
- radii 0.1, 0.25, 1, 4, and 10;
- 25,000 total BVH queries;
- exact equality with brute force for every query;
- 6,012,548 accepted neighbours in aggregate.

The corrected tournament then passed in all three final-head attempts.

## Tournament panel

The common runner covers 34 deterministic scenarios spanning:

- N = 100, 1,000, 5,000, 10,000, and 25,000;
- densities 0.25, 1, 4, and 16;
- single radius;
- simultaneous radii 0.25 / 1 / 4;
- wide simultaneous radii 0.1 / 1 / 10;
- uniform-grid, clustered, and periodic boundary-band occupancy;
- rebuild time;
- total query time;
- combined neighbour-phase time;
- index-entry proxy;
- visited cells/nodes;
- candidate distance checks;
- an existing `LocalObservationModel` + `LocalCentroidProbeController` path on representative anchors.

For N <= 1,000, added scaling states use full brute-force equality. Larger states use deterministic brute-force probes in the tournament in addition to the dedicated exhaustive boundary regression.

## Three-attempt robustness

Final-head workflow run: `34949378085`.

Retained artifacts:

- attempt 1: `10389135146`;
- attempt 2: `10388283977`;
- attempt 3: `10389230424`.

All three attempts used Rust 1.98.1 and 4 online CPUs, but GitHub scheduled them on different AMD EPYC host models. Therefore absolute milliseconds below are descriptive CI measurements. The important evidence is same-run relative performance, winner stability across attempts, and crossover structure.

## Median native tournament results

The table reports the median combined rebuild + query time across the three final-head attempts. Lower is better.

| Scenario | Current grid ms | Multi-res ms | BVH ms | Median winner | Stable 3/3 |
|---|---:|---:|---:|---|:---:|
| `n100-d1-uniform-grid-single` | 0.052 | 0.084 | 0.059 | current-periodic-grid | yes |
| `n100-d1-uniform-grid-multi` | 0.318 | 0.227 | 0.309 | multi-resolution-periodic-grid | yes |
| `n100-d1-uniform-grid-wide` | 0.343 | 0.189 | 0.093 | adaptive-periodic-bvh | yes |
| `n1000-d1-uniform-grid-single` | 0.922 | 0.973 | 0.849 | adaptive-periodic-bvh | no |
| `n1000-d1-uniform-grid-multi` | 4.78 | 5.23 | 3.53 | adaptive-periodic-bvh | yes |
| `n1000-d1-uniform-grid-wide` | 18.63 | 10.94 | 10.99 | multi-resolution-periodic-grid | no |
| `n5000-d1-uniform-grid-single` | 4.95 | 6.06 | 4.49 | adaptive-periodic-bvh | no |
| `n5000-d1-uniform-grid-multi` | 25.97 | 27.21 | 17.65 | adaptive-periodic-bvh | yes |
| `n5000-d1-uniform-grid-wide` | 95.73 | 82.32 | 54.95 | adaptive-periodic-bvh | yes |
| `n10000-d1-uniform-grid-single` | 4.36 | 9.16 | 8.73 | current-periodic-grid | yes |
| `n10000-d1-uniform-grid-multi` | 34.89 | 25.97 | 32.66 | multi-resolution-periodic-grid | yes |
| `n10000-d1-uniform-grid-wide` | 163.3 | 163.9 | 106.1 | adaptive-periodic-bvh | yes |
| `n25000-d1-uniform-grid-single` | 26.71 | 30.23 | 24.06 | adaptive-periodic-bvh | yes |
| `n25000-d1-uniform-grid-multi` | 142.5 | 142.3 | 88.18 | adaptive-periodic-bvh | yes |
| `n25000-d1-uniform-grid-wide` | 506.4 | 476.5 | 276.2 | adaptive-periodic-bvh | yes |
| `n5000-d0p25-uniform-grid-single` | 2.02 | 4.41 | 2.63 | current-periodic-grid | yes |
| `n5000-d0p25-uniform-grid-multi` | 11.01 | 11.55 | 9.23 | adaptive-periodic-bvh | yes |
| `n5000-d0p25-uniform-grid-wide` | 31.56 | 27.61 | 21.03 | adaptive-periodic-bvh | yes |
| `n5000-d4-uniform-grid-single` | 8.37 | 8.88 | 6.33 | adaptive-periodic-bvh | yes |
| `n5000-d4-uniform-grid-multi` | 70.01 | 79.20 | 41.21 | adaptive-periodic-bvh | yes |
| `n5000-d4-uniform-grid-wide` | 348.1 | 249.8 | 176.3 | adaptive-periodic-bvh | yes |
| `n5000-d16-uniform-grid-single` | 20.08 | 23.60 | 13.38 | adaptive-periodic-bvh | yes |
| `n5000-d16-uniform-grid-multi` | 240.0 | 233.9 | 127.0 | adaptive-periodic-bvh | yes |
| `n5000-d16-uniform-grid-wide` | 856.1 | 205.5 | 619.4 | multi-resolution-periodic-grid | yes |
| `n5000-d1-clustered-single` | 17.89 | 20.89 | 12.75 | adaptive-periodic-bvh | yes |
| `n5000-d1-clustered-multi` | 122.9 | 159.8 | 104.0 | adaptive-periodic-bvh | yes |
| `n5000-d1-clustered-wide` | 342.5 | 269.8 | 318.1 | multi-resolution-periodic-grid | yes |
| `n5000-d1-boundary-bands-single` | 9.55 | 10.84 | 5.31 | adaptive-periodic-bvh | yes |
| `n5000-d1-boundary-bands-multi` | 52.80 | 63.29 | 40.49 | adaptive-periodic-bvh | yes |
| `n5000-d1-boundary-bands-wide` | 129.9 | 134.1 | 98.79 | adaptive-periodic-bvh | yes |
| `n25000-d1-clustered-multi` | 706.4 | 1363.5 | 577.9 | adaptive-periodic-bvh | yes |
| `n25000-d1-clustered-wide` | 2767.3 | 3865.0 | 2446.6 | adaptive-periodic-bvh | yes |
| `n25000-d1-boundary-bands-multi` | 404.5 | 572.8 | 323.2 | adaptive-periodic-bvh | yes |
| `n25000-d1-boundary-bands-wide` | 1057.7 | 1336.2 | 922.3 | adaptive-periodic-bvh | yes |

## Crossover interpretation

### Adaptive periodic BVH

BVH is the broadest winner: 26/34 median scenarios and the stable winner in most multi-radius, non-uniform, periodic-boundary, and large-N cases.

Representative median advantages over the next admissible strategy include:

- N=5,000, density=1, multi-radius: 17.65 ms vs 25.97 ms;
- N=5,000, density=4, multi-radius: 41.21 ms vs 70.01 ms;
- N=5,000, density=16, multi-radius: 127.02 ms vs 233.88 ms;
- N=25,000, uniform multi-radius: 88.18 ms vs 142.29 ms;
- N=25,000, clustered multi-radius: 577.90 ms vs 706.44 ms;
- N=25,000, boundary-band multi-radius: 323.24 ms vs 404.49 ms.

It also has a much smaller index-entry proxy than multi-resolution: approximately 1.3–1.4×N entries in these implementations versus roughly 7–11×N for the tested multi-resolution hierarchy.

### Current production periodic grid

The current single-level grid still has legitimate winning regions. It is the stable median winner for:

- N=100, density=1, single radius;
- N=10,000, density=1, single radius;
- N=5,000, density=0.25, single radius.

Its rebuild is cheap and its simple cell traversal can win when one level happens to be well matched to the workload. However, earlier #165 evidence and this tournament both show that its single resolution can suffer large avoidable lookup amplification when query radius becomes large relative to cell width.

### Multi-resolution periodic grid

Multi-resolution is not a general replacement for BVH in this implementation, primarily because rebuilding and storing every point at every level is expensive. It nevertheless has clear winning regions:

- N=100, density=1, multi-radius;
- N=10,000, density=1, multi-radius;
- N=5,000, density=1, clustered wide-radius;
- N=5,000, density=16, wide-radius;
- median-only near-tie at N=1,000, density=1, wide-radius.

The strongest result is the dense wide-radius case:

- current grid: 856.1 ms;
- multi-resolution: 205.5 ms;
- BVH: 619.4 ms.

That is a stable 3/3 win and shows that multi-resolution addresses a real regime rather than only synthetic micro-overhead.

### Radius-matched reference

The radius-matched/Violet-like reference remains valuable as an upper-bound-style comparison for single-radius-friendly grid geometry, and it is often extremely fast. It is not a production candidate because using scientific radius to construct the index violates the multi-radius architecture established in #25.

## Existing observation/controller-path anchors

Median end-to-end path times across the three attempts:

| Scenario | Current grid ms | Multi-res ms | BVH ms | Winner |
|---|---:|---:|---:|---|
| `n1000-d1-uniform-grid-multi` | 5.61 | 6.37 | 4.77 | BVH |
| `n5000-d1-uniform-grid-wide` | 112.31 | 101.81 | 74.14 | BVH |
| `n5000-d1-clustered-multi` | 158.33 | 194.43 | 142.10 | BVH |
| `n5000-d1-boundary-bands-multi` | 73.81 | 84.17 | 61.48 | BVH |

The native index-level BVH gains therefore survive through the existing observation/controller proxy on all four anchors tested.

## Recommendation map for later production work

This is a recommendation for #178 validation/integration, not an implementation performed by #176.

1. **Do not replace production with one unconditional backend based only on this ticket.**
2. Treat **adaptive periodic BVH as the leading generic/default candidate** because it wins the broad majority of stable scenarios with moderate index size.
3. Preserve the **current grid as a low-overhead path** for simple/sparse/single-radius regimes.
4. Preserve **multi-resolution as a specialist path for wide-radius-ratio regimes**, especially dense cases where its stable advantage is large.
5. Do not derive exact selector thresholds from these CI timings. First reproduce the candidates in the production/WASM path and measure browser throughput under #178.
6. A later `Auto` selector should use simulator-owned workload facts only (for example N, arena occupancy statistics, active query-radius set/ratio, and measured structural costs). It must not alter scientific parameters or expose index tuning as experiment semantics.
7. Near-crossover cases should prefer the simpler/lower-memory path or use hysteresis rather than switching on tiny timing differences.

## Stop boundary

#176 ends with measurement and recommendation only.

No production default was changed. No automatic selector was implemented. No scientific parameter or model was retuned.
