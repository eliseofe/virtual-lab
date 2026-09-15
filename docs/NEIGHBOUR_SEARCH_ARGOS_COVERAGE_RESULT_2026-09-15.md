# ARGoS-style coverage-stamping neighbour-search result

Status: **candidate measured; exact but not competitive as the general Virtual Lab backend**  
Date: **15 September 2026**  
Parent investigation: **#168**  
Implementation child: **#171**  
PR: **#172**

## Question

Could the architectural idea used by ARGoS range-and-bearing — moving spatial work from receiver query time into coverage insertion at rebuild time — improve Virtual Lab's generic exact neighbour service while preserving the #25 requirement that one built index support arbitrary simultaneous scientific radii?

## Important semantic distinction

Literal ARGoS range-and-bearing has a transmitter-owned communication range. That range can naturally determine which cells an emitting entity covers while the positional grid itself remains independent of the range.

Virtual Lab's generic `NeighbourIndex` has different semantics: `rebuild(state, arena_size)` receives no privileged scientific radius, and one rebuilt index must answer many receiver-side `query(..., radius, ...)` calls with different radii during the same control update.

Therefore #171 did **not** inject one scientific range into the generic index. It tested the transferable infrastructure mechanism instead:

- retain the current radius-independent periodic grid resolution;
- stamp each agent into a fixed simulator-owned one-cell halo around its position cell;
- let a radius query reduce its receiver-side scan span by that halo;
- collect stamped candidate references;
- deterministically sort/deduplicate them;
- apply the exact periodic minimum-image distance test;
- return the same sorted agent IDs as `BruteForceNeighbourIndex`.

The one-cell stamp halo is simulator infrastructure, not an experiment parameter.

## Correctness result

The candidate passed the complete frozen #169 CI smoke contract:

- uniform / single radius;
- uniform / simultaneous radii `[0.25, 1.0, 4.0]`;
- uniform / wide radius ratio `[0.1, 1.0, 8.0]`;
- strongly clustered / simultaneous radii;
- periodic-boundary bands / simultaneous radii.

For every scenario, agent and radius, one candidate rebuild was reused across the ordered radius set and the result exactly matched `BruteForceNeighbourIndex`, including deterministic sorted order.

Performance workflow: `34934226794`. Evidence artifact: `10382970942`.

## Comparative result

Same-run native medians from the frozen smoke matrix:

| Scenario | Current rebuild ms | Coverage rebuild ms | Rebuild ratio | Current all-radii query ms | Coverage all-radii query ms | Query ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| uniform single small | 0.005960 | 0.038540 | 6.47x | 0.028318 | 0.026315 | 0.93x |
| uniform multi-radius | 0.023394 | 0.080722 | 3.45x | 0.732770 | 1.564722 | 2.14x |
| uniform wide-radius ratio | 0.027963 | 0.184821 | 6.61x | 3.035706 | 9.361380 | 3.08x |
| clustered multi-radius | 0.025830 | 0.136609 | 5.29x | 3.426722 | 11.458924 | 3.34x |
| periodic boundary bands | 0.012593 | 0.080875 | 6.42x | 0.566342 | 1.290173 | 2.28x |

A ratio below 1 means coverage stamping is faster; above 1 means it is slower. Only the tiny single-radius case produced a small query-time benefit (~7%), while its rebuild was already about 6.5x slower.

## Why it loses under the generic contract

With a one-cell two-dimensional halo, the candidate stores normally **9 index entries per agent** rather than one. This lowers the number of receiver cells visited, but the same agent can then appear through many stamped buckets in a larger query.

The resulting duplicate work becomes dominant:

| Scenario | Avg visited cells/query | Avg raw candidate refs/query | Avg unique candidates/query | Avg duplicates suppressed/query |
| --- | ---: | ---: | ---: | ---: |
| uniform single small | 1.000 | 8.000 | 8.000 | 0.000 |
| uniform multi-radius | 17.000 | 149.333 | 32.000 | 117.333 |
| uniform wide-radius ratio | 75.667 | 677.333 | 101.333 | 576.000 |
| clustered multi-radius | 17.000 | 827.342 | 163.308 | 664.033 |
| periodic boundary bands | 9.000 | 151.736 | 39.444 | 112.292 |

So the mechanism succeeds at what it was designed to do — fewer receiver-side cells — but pays for that with:

1. roughly 9x index entries in the ordinary case;
2. substantially slower rebuilds;
3. many repeated candidate references;
4. sorting/deduplication work before exact distance filtering;
5. especially poor behavior for large radius ratios and clustered occupancy.

## Architectural conclusion

**The ARGoS coverage-stamping idea transfers correctly but not efficiently to Virtual Lab's generic receiver-radius `NeighbourIndex` when the coverage halo itself must remain radius-independent.**

This is an important distinction from saying "ARGoS is slow" or "coverage stamping is bad." The literal ARGoS design is well matched to media where each transmitter owns a range, such as range-and-bearing communication. In that semantic setting, the transmitter's range can define its coverage and a receiver can inspect a very small local region.

Virtual Lab's generic neighbour service is deliberately more general: several unrelated receiver-side radii can coexist against one physical state. Under that contract, a fixed radius-independent stamp halo merely trades cell traversal for duplicated storage and deduplication, and the frozen benchmarks show that trade is unfavorable outside the trivial single-radius case.

## Decision for #168

- Keep this implementation and evidence as a permanent experimental reference.
- Do **not** promote it to the production general `NeighbourIndex` default.
- Do not delete the underlying ARGoS architectural idea: it may still be appropriate for a future specialized transmitter-owned medium/capability.
- Continue the general tournament with the multi-resolution/hierarchical periodic-grid candidate next.
- Preserve the adaptive tree/BVH candidate after that.
- No production default should change until the tournament is complete.

This result strengthens the reason for doing the full investigation rather than choosing an architecture from intuition: reducing one visible metric (visited cells) can make the total query path substantially worse once storage duplication and candidate deduplication are included.
