# Faithful ARGoS Range-and-Bearing spatial-index benchmark

Status: **implemented and measured as a separate transmitter-range benchmark family**  
Date: **15 September 2026**  
Parent investigation: **#168**  
Implementation child: **#173**  
PR: **#180**

## Scope and fidelity

This benchmark reproduces the spatial-index/routing mechanism used by the maintained ARGoS Range-and-Bearing (RAB) medium rather than forcing that mechanism into Virtual Lab's generic receiver-radius `NeighbourIndex` contract.

Source model inspected: `ilpincy/argos3`, current maintained RAB implementation at commit `4bb398cd6bfdd09fc919f24c9cccbff38370849b`.

The benchmark preserves the relevant ARGoS architecture:

- spatial-grid resolution is simulator infrastructure and is independent of transmitter range;
- every RAB transmitter owns its own range;
- during rebuild, each transmitter is inserted into every spatial cell touched by its axis-aligned range box;
- a receiver performs a point/location lookup at its own position;
- each unordered candidate pair is geometrically checked once;
- the same exact distance is then used for two independent directional range tests, because the two transmitters may have different ranges.

To isolate neighbour-index/routing cost, this benchmark fixes equal message sizes and omits occlusion/line-of-sight processing. ARGoS itself can additionally apply those medium-level constraints.

ARGoS uses a 3D `CGrid`; Virtual Lab's benchmark is 2D. The benchmark also applies Virtual Lab's periodic wrapping/minimum-image geometry so the same deterministic benchmark worlds can be used. Those are explicit benchmark-world adaptations, not changes to the RAB range ownership or indexing mechanism.

The default grid policy mirrors ARGoS RAB's default approximately one-world-unit cell scale: `cells_per_axis = floor(arena_size)`, independent of every transmitter range.

## Semantic boundary from generic neighbour search

Generic Virtual Lab neighbour queries have receiver-side semantics:

`query(receiver, radius)`

Faithful RAB has transmitter-owned-range semantics:

`receiver i receives transmitter j when exact distance(i,j) < range[j]`.

These are not interchangeable when ranges differ between transmitters. Therefore faithful RAB is evaluated as its own benchmark family. Equal transmitter ranges provide a bridge to ordinary fixed-radius neighbour discovery; heterogeneous ranges exercise the actual RAB case.

## Correctness

A dedicated brute-force transmitter-range oracle was added. The RAB grid matched it exactly, with deterministic sorted receiver lists, for every tested case:

- all equal-range cases derived from the frozen #169 smoke matrix;
- cyclic heterogeneous transmitter ranges for every multi-range scenario;
- uniform, clustered and periodic-boundary distributions.

Performance workflow: `34942513488`.  
Evidence artifact: `10386270725`.  
Terminal validation line:

`validation=faithful-argos-rab-grid-matches-transmitter-range-brute-force-oracle`

## Representative measurements

The table below reports same-run native medians. `RAB route` is the point-lookup/pair-routing pass after rebuild. Brute force is the dedicated transmitter-range oracle, not a production candidate.

| Scenario / range case | Entries per agent | Rebuild ms | RAB route ms | Brute-force route ms | Avg directed links / receiver |
| --- | ---: | ---: | ---: | ---: | ---: |
| uniform 256, equal 0.25 | 1.00 | 0.045 | 0.009 | 0.212 | 0.00 |
| uniform 256, equal 1 | 9.00 | 0.075 | 0.089 | 0.212 | 0.00 |
| uniform 256, equal 4 | 81.00 | 0.457 | 1.059 | 0.315 | 44.00 |
| uniform 256, heterogeneous 0.25/1/4 | 30.22 | 0.213 | 0.424 | 0.276 | 14.61 |
| uniform 324, equal 0.1 | 1.00 | 0.023 | 0.011 | 0.340 | 0.00 |
| uniform 324, equal 1 | 9.00 | 0.128 | 0.106 | 0.339 | 0.00 |
| uniform 324, equal 8 | 289.00 | 1.701 | 4.235 | 0.681 | 192.00 |
| uniform 324, heterogeneous 0.1/1/8 | 99.67 | 0.660 | 1.753 | 0.560 | 64.00 |
| clustered 400, equal 1 | 9.00 | 0.107 | 1.737 | 0.681 | 43.79 |
| clustered 400, heterogeneous 0.25/1/4 | 30.76 | 0.301 | 3.285 | 0.865 | 104.52 |
| periodic bands 192, heterogeneous 0.15/0.5/2 | 10.67 | 0.085 | 0.358 | 0.167 | 14.22 |

## What these measurements do and do not establish

The mechanism behaves as expected mechanically:

- when transmitter ranges are small relative to the fixed grid cells, point lookup can reject almost all pairs very cheaply;
- as transmitter range grows relative to cell width, each transmitter occupies more grid cells, increasing rebuild/storage cost;
- clustered states increase the number of real/candidate communication pairs that must be processed;
- heterogeneous ranges are handled directly without redefining the grid.

These measurements are **not** the final RAB strategy comparison. At the small N values of the frozen smoke matrix, brute force can beat the grid in high-coverage regimes; that does not justify a production conclusion. #177 will compare faithful RAB and other exact structures under the same transmitter-range relation across a broader scaling matrix.

Most importantly, this result must not be combined with #171's rejected fixed-halo adaptation. #171 tested a different hybrid algorithm for receiver-radius queries; its negative result says nothing about the correctness or quality of this faithful RAB mechanism.

## Maintenance / architecture decision at #173

- Keep the faithful RAB benchmark implementation as the canonical ARGoS reference for the investigation.
- Keep it separate from the generic receiver-radius tournament.
- Remove the #171 fixed-halo implementation from active candidate code; preserve only its historical evidence.
- Do not change the production neighbour backend in #173.
- Do not declare a winner from these measurements.
- Continue next with #174, the exact multi-resolution periodic-grid candidate for generic receiver-radius search.
