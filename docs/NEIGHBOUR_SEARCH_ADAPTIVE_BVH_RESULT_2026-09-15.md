# Adaptive periodic BVH neighbour-search result — 15 Sep 2026

Issue: #175 (`#168.5`)

This ticket implemented and measured one benchmark-only exact adaptive spatial-tree candidate. It does **not** change the production neighbour backend and it does **not** select a winner for #168.

## Candidate

The candidate is a deterministic balanced 2D BVH/k-d-style tree over agent positions:

- split the widest node bounding-box axis;
- stable deterministic median partition by coordinate, then agent index;
- fixed benchmark-internal leaf capacity of 8;
- one rebuild from physical state only, reused unchanged for every simultaneous query radius;
- no scientific radius participates in tree construction;
- no experiment-visible tree tuning knob;
- periodic queries use only the translated arena images required when the search circle crosses a boundary;
- candidates from periodic images are deduplicated;
- exact periodic minimum-image distance is the final membership test;
- output is sorted by agent index.

The tree is benchmark infrastructure only in this child.

## Correctness

Dedicated workflow run `34946295818` passed. Artifact: `10386349888`.

Every frozen #169 smoke scenario and every radius matched `BruteForceNeighbourIndex` exactly for:

- current production periodic grid;
- #174 multi-resolution periodic grid;
- adaptive periodic BVH.

The BVH structure was built once per state and remained unchanged across all simultaneous radius queries.

## Representative timings from the same run

All times below are native release-mode medians on the same GitHub-hosted runner. `total` means rebuild + the complete ordered all-agent/all-radius query sweep for that scenario.

| Scenario | Current query ms | Multi-resolution query ms | BVH query ms | BVH vs current query | BVH vs current total |
|---|---:|---:|---:|---:|---:|
| uniform single small | 0.0251 | 0.0226 | 0.0326 | +29.9% | +17.3% |
| uniform multi-radius | 0.7244 | 0.6020 | 0.7386 | +2.0% | +3.3% |
| uniform wide-radius ratio | 3.0425 | 1.6984 | 2.5247 | -17.0% | -16.3% |
| clustered multi-radius | 3.3983 | 2.6764 | 3.3825 | -0.5% | +0.6% |
| periodic boundary bands | 0.5895 | 0.5280 | 0.4334 | -26.5% | -25.8% |

Negative percentages are improvements.

## Rebuild and storage behavior

The BVH rebuild was close to the current grid in the small and periodic-boundary fixtures and remained much cheaper than rebuilding the multi-resolution hierarchy. In the clustered fixture the BVH rebuild was about 2.6x the current grid, but it was still substantially cheaper than the multi-resolution rebuild.

The retained index-entry proxy (`agent permutation entries + BVH nodes`) was:

- N=64: 79 entries;
- N=192: 255 entries;
- N=256: 319 entries;
- N=324: 451 entries;
- N=400: 527 entries.

That is roughly 1.2–1.4 entries per agent in these fixtures, materially below the 6–8 entries per agent observed for the #174 multi-resolution hierarchy.

## Traversal observations

The BVH reduced query time strongly in the periodic-boundary fixture and moderately in the wide-radius-ratio fixture. It did **not** beat the multi-resolution candidate in the ordinary uniform multi-radius or clustered multi-radius smoke cases.

The clustered case therefore does not justify assuming that a balanced BVH is automatically superior for non-uniform occupancy. Large queries through a dense cluster still touch many leaves/candidates; the frozen full tournament in #176 must determine crossover regions rather than promoting this candidate from its implementation ticket.

## Conclusion for #175

The adaptive periodic BVH is an exact, radius-independent, low-storage general candidate worth retaining for #176. Its main measured strengths are low index storage, relatively modest rebuild cost, and good performance in the periodic-boundary and wide-radius-ratio smoke cases. Its main weakness is that query traversal is not consistently better than either the current grid or the #174 multi-resolution hierarchy.

No production change is justified from #175 alone. The next performance child is #176, which must run the common generic tournament before any integration decision.
