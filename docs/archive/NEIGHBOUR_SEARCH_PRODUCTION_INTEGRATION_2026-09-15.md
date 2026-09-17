# Production neighbour-search integration — #178 / #193

Date: 2026-09-15

## Decision

The normal production generic neighbour backend is **adaptive periodic BVH**, with stable provenance identifier:

`adaptive-periodic-bvh/v1`

This is the owner-approved production decision after the completed comparative sequence:

- #176 common generic tournament: BVH was the strongest broad generic candidate, with real but narrower current-grid and multi-resolution crossover regions;
- #177 faithful transmitter-owned RAB comparison: no performance justification for maintaining a separate ARGoS-style production spatial backend;
- #191 controlled 2×2×2×2 environment-size matrix: among the eight stable high-scale cells BVH won seven, the current grid won one, and multi-resolution won none. Increasing environment size while holding N, local spacing and radii fixed did not defeat BVH; it flipped the one sparse/single-radius controlled pair from current-grid to BVH.

The isolated current-grid high-scale crossover does not justify multiple normal production engines or an experiment-visible selector.

## Production architecture

`Simulation` now owns `AdaptivePeriodicBvh` directly in both native and WASM execution.

The production index preserves the established scientific/runtime contract:

- receiver-side exact radius queries;
- arbitrary query radii without rebuilding tree geometry from a scientific radius;
- periodic minimum-image geometry;
- deterministic sorted neighbour indices;
- one simulator-owned rebuild at each control update;
- no experiment-visible neighbour-index choice or tuning parameter.

The implementation promoted to production is the corrected #185 BVH design:

- deterministic widest-AABB-axis median splits;
- simulator-internal leaf capacity;
- translated query centers only when periodic wrapping requires them;
- conservative scale-aware broad-phase floating-point slack;
- exact minimum-image `distance² <= radius²` as the authoritative membership test.

The broad-phase slack can only admit extra candidates; it cannot create false neighbours because final membership remains exact.

## Retained alternatives

`PeriodicGridNeighbourIndex` remains a separate exact implementation for tests, historical comparison and fallback/debug engineering. It is no longer the normal `Simulation` backend.

`BruteForceNeighbourIndex` remains hidden correctness/debug infrastructure only.

The multi-resolution periodic grid remains benchmark evidence; it is not promoted to production.

The faithful ARGoS RAB implementation remains benchmark/reference evidence. Future transmitter-owned RAB routing should use the selected generic exact spatial infrastructure unless a future communication capability introduces semantics that require something else.

## Provenance

The kernel exposes the production strategy through:

- native `Simulation::neighbour_strategy()`;
- WASM `ProbeSimulation.neighbour_strategy()`;
- WASM `production_neighbour_strategy()`;
- worker runtime/ready/profile messages as `neighbourStrategy`.

Only the stable strategy/version identifier is exposed. Leaf capacity, tree depth and other implementation details remain simulator infrastructure, not experiment inputs.

## Verification contract

The production module contains direct brute-force exactness tests over:

- multiple arena sizes;
- simultaneous small/medium/wide radii;
- deterministic random positions;
- periodic boundary-band states;
- structure invariance across radius queries.

The existing generic tournament, canonical matrix, faithful RAB comparison, native performance profile and browser/WASM profile remain regression gates around the integrated kernel.

## Integration incident caught before merge

The first final-head browser performance run exposed a test-harness issue in `controller-cost-profile.mjs`: code evaluated through Chrome DevTools used bare relative dynamic imports, which newer Chrome did not resolve from the evaluation context. The production BVH browser profile and real-workload isolation profile had already executed successfully; the failure occurred only when the controller-cost attribution harness attempted to import its compiler modules.

The harness was hardened by resolving dynamic module and worker URLs explicitly against the loaded hashed performance-profile page. This is a profiling-infrastructure repair, not a scientific/runtime behavior change.

## User-facing policy

Ordinary Experiment authors do not choose the neighbour backend and do not tune BVH internals. The simulator owns this infrastructure choice. Reproducibility records may report `adaptive-periodic-bvh/v1` as implementation provenance without making it part of the scientific model.

## Stop boundary

This integration completes the #168 comparative neighbour-search architecture investigation and #178 production decision once the PR is merged and post-merge native/WASM/Pages/browser verification is green.

#179, persistent neighbour-search scalability as a Study, remains a separate deferred future task and is not started by this integration.
