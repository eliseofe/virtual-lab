# Neighbour index design

Status: approved and implemented under issue #25.

## Design rule

Scientific interaction and sensing radii are experiment/controller parameters. Spatial indexing is simulator infrastructure. The two must not be coupled through a user-tuned cell/chunk/hash parameter.

The production kernel therefore uses one periodic positional index that can answer arbitrary radii from the same built structure. Changing a scientific radius does not rebuild the grid around that radius and does not require any simulator setting to change.

## Production algorithm

`PeriodicGridNeighbourIndex` is rebuilt once per control update from the current physical positions.

- Grid resolution is derived automatically from arena geometry and population size, not from an interaction radius.
- The current rule uses `ceil(sqrt(N))` cells per axis, giving roughly one bucket per agent under a uniform distribution.
- Buckets are stored sparsely in a hash map, so empty arena cells consume no bucket storage.
- For a query radius `r`, the query inspects enough wrapped cells around the query agent to cover `r`.
- Candidate membership is then decided by the exact periodic minimum-image distance test.
- Returned neighbours are sorted by agent index to preserve the brute-force ordering and avoid changing floating-point accumulation order merely because the index changed.

The index geometry may affect performance only. It cannot affect the mathematically defined neighbour set.

## Multiple radii

One built index can serve any number of radii. For example, proximal, alignment, communication, and future sensor ranges can all query the same structure independently. There is no `CELL_SIZE`, `HASH_RADIUS`, or similar student-visible parameter.

## Periodic boundaries

Both cell lookup and final geometry respect the periodic square arena. Queries wrap cell coordinates across arena edges, then use the same minimum-image displacement used by the physical/observation layer.

## Correctness oracle

`BruteForceNeighbourIndex` remains in the kernel solely as the exact reference implementation. Automated tests compare optimized and brute-force neighbour lists across:

- multiple arena sizes;
- multiple query radii against the same built index;
- random configurations;
- explicit cross-boundary configurations;
- radii large enough to cover much or all of the periodic arena.

Every future neighbour-index optimization should continue to be checked against this oracle.

## Reference implementation

The design follows the separation used by ARGoS: positional indexing is simulator infrastructure while range-and-bearing entities keep their own communication ranges, with exact geometric checks determining actual communication. See `ilpincy/argos3`, especially `src/plugins/simulator/media/rab_medium.cpp` and `src/core/simulator/space/positional_indices/`.

Violet remains a useful reference, but its proximity chunks are mechanically tied to a proximity radius. Virtual Lab deliberately uses the ARGoS-style separation because experiments may have several simultaneous scientific radii.
