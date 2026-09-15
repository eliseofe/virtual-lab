# Faithful transmitter-range RAB strategy comparison — #177

Date: 2026-09-15  
Parent investigation: #168  
RAB comparison: #177  
Execution child: #186  
Pull request: #188

## Conclusion

A separate faithful ARGoS-style spatial backend is **not justified solely by performance for Virtual Lab's transmitter-owned-range relation**.

The faithful ARGoS RAB grid is genuinely competitive in the regime it was designed for: simple uniform occupancy with modest transmission range. It wins 5 of the 34 combined rebuild+route scenarios, including several equal-range cases, so the result is not "ARGoS is slow." However, the already-existing exact generic backends answer the same directed transmitter-range relation and are substantially more robust as density, range heterogeneity, clustering, periodic-boundary concentration, or maximum range increase.

Combined rebuild+route winner count in the retained comparison:

- adaptive periodic BVH adapter: **23/34**;
- faithful ARGoS RAB: **5/34**;
- current periodic-grid adapter: **3/34**;
- multi-resolution periodic-grid adapter: **3/34**.

The faithful ARGoS implementation also pays a coverage-stamping storage/rebuild cost that grows strongly with transmission range. This is the decisive architectural disadvantage for retaining a second production spatial backend when the generic backends already provide the same exact transmitter-owned-range relation.

Recommendation for #178: keep faithful ARGoS RAB as benchmark/reference evidence, but do **not** add a specialized production RAB spatial backend merely for neighbour routing. A future communication medium with additional ARGoS-specific semantics such as occlusion or other medium behavior could independently justify specialized architecture later; that question is outside this spatial-index comparison.

No production backend changed in #177.

## Semantic target

The compared relation is directed and transmitter-owned:

`transmitter j is visible to receiver i iff periodic_distance(i,j) < range[j]`.

The faithful ARGoS strategy uses its native mechanism from #173:

- simulator-owned grid resolution independent of RAB range;
- each transmitter stamped into every grid cell covered by its own range box;
- each receiver performs a point lookup at its own position;
- each unordered candidate pair receives one exact distance calculation;
- the two directed transmitter-range tests are evaluated independently.

The three generic strategies are not reinterpreted as ARGoS. They are mechanically adapted to the identical relation:

1. build the generic index once from positions;
2. compute the maximum transmitter range in the state;
3. for each receiver, query the generic index at that maximum range;
4. for each returned transmitter candidate, apply the exact transmitter-owned-range test above.

This deliberately favors semantic comparability over inventing a new RAB-specific BVH/grid algorithm.

## Compared strategies

1. faithful ARGoS-style RAB grid from #173;
2. current radius-independent periodic grid + exact RAB adapter;
3. multi-resolution periodic grid from #174 + exact RAB adapter;
4. corrected adaptive periodic BVH from #175/#185 + exact RAB adapter;
5. brute-force transmitter-range routing only as correctness oracle.

No real-experiment anchors were added. No new RAB-specialized competitor was invented.

## Workload panel

The comparison deliberately mirrors the 34-case mechanical regime map from #176 so the RAB result can be interpreted against the same infrastructure stresses.

Population/density/layout axes:

- N = 100, 1,000, 5,000, 10,000, 25,000;
- density = 0.25, 1, 4, 16 where applicable;
- uniform-grid, clustered and periodic boundary-band occupancy;
- arena side = `sqrt(N / density)`.

Transmitter-range workloads:

- **equal:** every transmitter has range 1;
- **heterogeneous moderate:** transmitter ranges cycle through 0.25 / 1 / 4;
- **heterogeneous wide:** transmitter ranges cycle through 0.1 / 1 / 10.

## Correctness

Every compared strategy uses deterministic sorted output and is validated against the brute-force transmitter-range oracle.

- all N <= 1,000 scaling states: full receiver equality;
- larger scaling states: deterministic oracle probes before timing;
- additional exhaustive periodic-boundary regression: N=5,000, density=1, every receiver, for all three transmitter-range workloads, across all four compared strategies.

The retained dedicated workflow passed all gates.

## Retained evidence

Dedicated workflow run: `34952716545`  
Artifact: `10389886882`

Runner environment: Ubuntu 24.04, Rust 1.98.1, 4 online CPUs, AMD EPYC 7763 host.

Absolute milliseconds below are descriptive CI timings. The recommendation depends primarily on the broad crossover pattern and the index-size amplification, not on a sharp timing threshold.

## Representative combined rebuild + route results

Lower is better.

| Scenario | Faithful ARGoS ms | Current adapter ms | Multi-res adapter ms | BVH adapter ms | Winner |
|---|---:|---:|---:|---:|---|
| N=1,000, d=1, uniform, equal range 1 | 0.850 | 1.060 | 1.176 | 0.935 | faithful ARGoS |
| N=5,000, d=1, uniform, equal range 1 | 4.369 | 5.362 | 6.325 | 5.034 | faithful ARGoS |
| N=25,000, d=1, uniform, equal range 1 | 23.755 | 30.508 | 34.932 | 27.170 | faithful ARGoS |
| N=5,000, d=1, uniform, heterogeneous 0.25/1/4 | 18.540 | 23.434 | 29.067 | 16.309 | BVH |
| N=5,000, d=1, uniform, heterogeneous 0.1/1/10 | 105.769 | 108.032 | 101.056 | 66.860 | BVH |
| N=5,000, d=16, uniform, heterogeneous 0.1/1/10 | 1840.162 | 1184.010 | 430.997 | 829.189 | multi-resolution |
| N=5,000, d=1, clustered, heterogeneous 0.25/1/4 | 308.188 | 133.552 | 176.945 | 124.774 | BVH |
| N=5,000, d=1, boundary bands, equal range 1 | 38.844 | 12.730 | 14.797 | 8.083 | BVH |
| N=25,000, d=1, clustered, heterogeneous 0.1/1/10 | 12137.444 | 3574.380 | 4907.383 | 3312.468 | BVH |
| N=25,000, d=1, boundary bands, heterogeneous 0.1/1/10 | 4627.747 | 1443.389 | 1755.863 | 1390.471 | BVH |

The five faithful-ARGoS combined wins are:

- N=100, d=1, uniform, heterogeneous 0.25/1/4;
- N=1,000, d=1, uniform, equal range 1;
- N=1,000, d=1, uniform, heterogeneous 0.25/1/4;
- N=5,000, d=1, uniform, equal range 1;
- N=25,000, d=1, uniform, equal range 1.

The equal-range wins are meaningful but modest: approximately 9–13% ahead of the next admissible generic backend in the N=1,000/5,000/25,000 density-1 uniform cases. The heterogeneous N=100/1,000 wins are only about 4–6%.

By contrast, many difficult regimes show factor-scale losses for coverage stamping. Examples include dense wide-range, clustered heterogeneous, and boundary-concentrated workloads.

## Index-size / coverage-stamping cost

The faithful ARGoS grid's storage proxy counts each transmitter once for every grid cell covered by its transmission-range box. This is intrinsic to the faithful mechanism and is exactly what allows receiver point lookup.

Representative index-entry counts:

| Scenario | Faithful ARGoS | Current | Multi-res | BVH |
|---|---:|---:|---:|---:|
| N=1,000, d=1, equal range 1 | 8,626 | 1,000 | 8,000 | 1,255 |
| N=5,000, d=1, equal range 1 | 44,578 | 5,000 | 50,000 | 7,047 |
| N=25,000, d=1, equal range 1 | 224,053 | 25,000 | 275,000 | 33,191 |
| N=5,000, d=1, heterogeneous 0.25/1/4 | 151,436 | 5,000 | 50,000 | 7,047 |
| N=5,000, d=1, heterogeneous 0.1/1/10 | 737,286 | 5,000 | 50,000 | 7,047 |
| N=25,000, clustered, heterogeneous 0.1/1/10 | 3,761,069 | 25,000 | 275,000 | 33,191 |

This explains the crossover structurally. ARGoS trades transmitter-side duplication for cheap receiver point lookup. That trade is effective when ranges and occupancy keep coverage small, but becomes expensive as range boxes cover many cells. The generic structures instead store each physical position once or a small fixed number of times and pay receiver-side traversal/filtering.

## Production implication for #178

The evidence does **not** support maintaining two independent production spatial infrastructures merely because future communication/RAB capabilities use transmitter-owned ranges.

Recommended production direction:

- choose the generic exact backend/selection policy from #176 and browser/WASM integration evidence in #178;
- implement transmitter-owned RAB routing as an exact semantic adapter over that generic infrastructure unless a later communication capability introduces requirements that the generic abstraction genuinely cannot express;
- retain the faithful ARGoS implementation and benchmark as architectural reference and regression evidence, not as the default production spatial backend;
- keep brute force hidden as the transmitter-range correctness oracle.

This conclusion is specifically about spatial indexing/routing performance and software architecture. It makes no scientific claim about ARGoS experiments or communication models.

## Stop boundary

#177 ends with comparison and recommendation only. No production strategy was switched, no automatic selector was implemented, and no scientific parameter was changed.
