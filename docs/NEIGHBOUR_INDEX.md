# Neighbour index design

Status: **current production architecture, 16 September 2026**.

## Design rule

Scientific interaction/sensing radii are Experiment/controller semantics. Spatial indexing is simulator infrastructure. The two must not be coupled through a researcher-tuned cell/chunk/hash parameter.

The production kernel therefore exposes exact neighbour queries for arbitrary simultaneous radii while keeping indexing strategy internal. Changing a scientific radius does not require changing a simulator-index tuning parameter.

## Production algorithm

Production `Simulation` currently uses:

`adaptive-periodic-bvh/v1`

This was selected through the #168 comparative investigation and integrated into production after exactness/performance evidence.

Required semantics:

- exact receiver/query-radius membership;
- arbitrary simultaneous query radii against the same physical state;
- periodic square-arena minimum-image geometry;
- deterministic neighbour ordering by agent index where runtime/controller accumulation semantics require it;
- index strategy affects performance only, never the scientifically defined neighbour set.

The BVH/index is simulator-owned infrastructure and exposes no student-visible tuning knob such as cell size/hash radius/tree depth.

## Multiple radii

The same physical population may be queried with proximal, alignment, communication or future sensor ranges. Each query uses its own scientific radius; the implementation cannot silently collapse these into one global index radius.

## Periodic boundaries

Neighbour membership respects the same periodic minimum-image geometry as the physical/observation layer. Cross-boundary neighbours must be indistinguishable scientifically from equivalent neighbours inside the base cell.

## Retained reference/oracle implementations

Two alternate implementations remain intentionally available:

- `PeriodicGridNeighbourIndex` — exact reference/fallback implementation from the earlier architecture;
- `BruteForceNeighbourIndex` — hidden exact correctness oracle.

Automated equivalence checks compare optimized neighbour membership/order against exact references across arena sizes, radii, random/cross-boundary configurations and broad-radius regimes.

A future optimization cannot replace production merely because it benchmarks faster. It must preserve the full exact arbitrary-radius periodic contract first.

## Why the previous single-level grid is no longer production

The earlier production implementation used a periodic sparse grid with resolution derived from population/arena geometry. That design correctly separated scientific radius from grid tuning, but performance work found regimes where one scientific query radius spans many small cells and the single-level grid becomes inefficient.

The investigation then compared exact alternatives rather than exposing a radius-coupled tuning parameter to the researcher.

Historical evidence lives in `docs/archive/`, including:

- `archive/NEIGHBOUR_SEARCH_ARCHITECTURE_INVESTIGATION_2026-09-15.md`
- `archive/NEIGHBOUR_SEARCH_TOURNAMENT_2026-09-15.md`
- `archive/NEIGHBOUR_SEARCH_ADAPTIVE_BVH_RESULT_2026-09-15.md`
- `archive/NEIGHBOUR_SEARCH_PRODUCTION_INTEGRATION_2026-09-15.md`

These are investigation/history records. Current production truth is this document plus the current implementation and architecture contracts.

## Future changes

#56 remains the living performance umbrella. #179 is deferred until Study infrastructure exists for a persistent benchmark Study.

Any future spatial-index replacement must preserve:

1. exact scientific neighbour sets;
2. deterministic ordering requirements;
3. arbitrary simultaneous radii;
4. periodic geometry;
5. no researcher-facing index-tuning burden;
6. correctness-oracle coverage before performance promotion.
