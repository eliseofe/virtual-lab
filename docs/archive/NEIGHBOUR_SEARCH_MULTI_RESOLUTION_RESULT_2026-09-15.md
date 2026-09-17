# #174 — Exact multi-resolution periodic-grid candidate

Date: 15 September 2026

Parent: #168 — comparative exact neighbour-search architecture investigation.

## Result

The benchmark-only multi-resolution periodic grid is **exact** under the frozen #169 correctness contract and preserves the original #25 architectural invariant: one simulator-owned hierarchy is rebuilt once for a physical state and serves several simultaneous scientific query radii without radius-triggered rebuilding or radius-defined hierarchy geometry.

It is a strong performance candidate, but it is **not yet a production winner**. The hierarchy materially reduces query cost in the multi-radius, wide-radius-ratio and clustered smoke scenarios, while imposing a substantial rebuild and storage cost because every moving agent is indexed at every hierarchy level. The next candidate(s) must be measured before a production choice is made.

Production `PeriodicGridNeighbourIndex` is unchanged by this issue.

## Candidate design

The candidate builds a small hierarchy of exact periodic point grids.

- Hierarchy construction depends only on population size and arena geometry.
- Finest level: `4 * ceil(sqrt(N))` cells per axis.
- Each following level approximately halves the number of cells per axis until a one-cell level is reached.
- Every agent is inserted once into every level.
- A query mechanically chooses the finest already-built level whose cell width is at least the requested radius; if none exists, it uses the coarsest level.
- The selected grid supplies candidates only. Final membership is always decided by the exact periodic minimum-image distance test.
- Returned neighbour indices are sorted, matching brute-force ordering.
- Changing query radius never changes hierarchy geometry and never triggers a rebuild.

The `4 * ceil(sqrt(N))` finest-level rule is an initial simulator-internal benchmark policy, not a scientific parameter and not a claim of optimality.

A radius-matched single-grid implementation is retained only as a diagnostic performance reference. It rebuilds separately for every radius and therefore is not an admissible general solution to the simultaneous-multiple-radius requirement.

## Correctness evidence

Representative performance workflow: `34944939979`.

Artifact: `10386334821` (`performance-profile-d05dd18be62129ac432d200bd2938df921b969c0`).

The candidate matched `BruteForceNeighbourIndex` exactly for every agent and every radius in all frozen CI smoke scenarios:

- uniform single-radius;
- uniform simultaneous multi-radius;
- uniform wide radius ratio;
- clustered simultaneous multi-radius;
- periodic-boundary bands.

The benchmark additionally snapshots hierarchy geometry before the ordered radius set and asserts that the same hierarchy remains in use after every query radius. The radius-matched diagnostic reference was also checked against the same brute-force oracle.

## Representative performance

All values below come from the same runner in workflow `34944939979`; cross-run timings are not compared.

| Scenario | Current rebuild ms | Multi rebuild ms | Rebuild multiplier | Current all-radius query ms | Multi all-radius query ms | Query change | Rebuild + query change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| uniform single small | 0.004767 | 0.023134 | 4.85× | 0.014281 | 0.018768 | +31.4% | +120.0% |
| uniform multi-radius | 0.019088 | 0.100279 | 5.25× | 0.598328 | 0.419793 | -29.8% | -15.8% |
| uniform wide radius ratio | 0.024706 | 0.158065 | 6.40× | 2.531307 | 1.181483 | -53.3% | -47.6% |
| clustered multi-radius | 0.023685 | 0.173427 | 7.32× | 2.551778 | 1.887151 | -26.0% | -20.0% |
| periodic boundary bands | 0.007892 | 0.085767 | 10.87× | 0.375166 | 0.369168 | -1.6% | +18.8% |

The most important positive case is the wide-radius-ratio scenario: the candidate more than halves aggregate query time while preserving one radius-independent rebuild. The small single-radius case is a clear loss, and the periodic-boundary case shows that reducing query work does not automatically compensate for hierarchy rebuild cost.

## Work decomposition and storage

The smoke scenarios built 6–8 levels, therefore storing 6–8 index entries per agent instead of one entry per agent in the current production grid.

Examples:

- N=256, arena 16: 7 levels / 1,792 entries. Radii 0.25, 1 and 4 select cell widths 0.25, 1 and 4 respectively; each query visits 9 cells on the uniform fixture.
- N=324, arena 18: 8 levels / 2,592 entries. Radii 0.1 and 1 use fine levels; radius 8 uses the prebuilt 2×2 level, visiting 4 cells rather than traversing a large number of tiny cells.
- N=400 clustered: 8 levels / 3,200 entries. Query cost improves substantially despite unavoidable large true-neighbour output.

This confirms the intended mechanism: the hierarchy removes much of the avoidable tiny-cell traversal amplification for larger query radii while keeping the scientific radius out of rebuild geometry. Its cost is moving work and memory into the multi-level rebuild.

## Comparison with radius-matched reference

On the uniform multi-radius fixture, the multi-resolution hierarchy selected levels whose widths exactly matched 0.25, 1 and 4, and its aggregate query time was comparable to the sum of the three radius-matched reference queries. The crucial architectural difference is that the hierarchy was built once and reused, whereas the reference requires a separate radius-specific rebuild for each radius.

The reference can still be faster in some irregular/boundary cases because its exact per-radius cell width is unconstrained by the prebuilt hierarchy. That is useful diagnostic evidence, not a reason to couple production index geometry to scientific radii.

## Decision

Keep this candidate in the #168 tournament. It is the first generic candidate so far to show large query improvements while preserving exact simultaneous-multiple-radius semantics and radius-independent rebuild geometry.

Do **not** promote it to production yet. Remaining questions include:

- whether an adaptive tree/BVH-family strategy can achieve similar query reductions with lower rebuild/storage overhead;
- how the candidates compare over the full N/density/radius/distribution matrix rather than the CI smoke subset;
- end-to-end cost when rebuild frequency and controller/query workload are accounted for together;
- whether an internal automatic strategy policy is justified after all exact candidates are measured.

No experiment-visible tuning parameter is introduced, and no scientific semantics change.
