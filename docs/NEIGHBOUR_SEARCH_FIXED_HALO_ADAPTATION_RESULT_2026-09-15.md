# Fixed-halo generic coverage adaptation — historical result

Status: **historical negative result; not an active candidate and not faithful ARGoS RAB**  
Date: **15 September 2026**  
Parent investigation: **#168**  
Historical child: **#171**  
Historical PR: **#172**

## Why this record remains

#171 tested whether one idea suggested by ARGoS coverage insertion could be transferred into Virtual Lab's *generic receiver-radius* `NeighbourIndex` without privileging any scientific radius.

It did **not** implement ARGoS Range-and-Bearing semantics. The implementation instead used:

- the existing radius-independent Virtual Lab grid resolution;
- a fixed simulator-owned one-cell stamping halo around every agent;
- receiver-side radius-dependent multi-cell scanning;
- candidate sorting/deduplication;
- exact periodic minimum-image filtering.

That hybrid is now named the **fixed-halo generic coverage adaptation**. It must not be described as "the ARGoS implementation" or used to draw conclusions about ARGoS RAB performance.

## Correctness result

The adaptation was exact under the frozen #169 generic neighbour contract. It matched `BruteForceNeighbourIndex` for all agents/radii in:

- uniform single-radius;
- simultaneous radii `[0.25, 1.0, 4.0]`;
- wide-ratio radii `[0.1, 1.0, 8.0]`;
- clustered occupancy;
- periodic-boundary bands.

Performance workflow: `34934226794`. Evidence artifact: `10382970942`.

## Performance result

| Scenario | Current rebuild ms | Adaptation rebuild ms | Rebuild ratio | Current all-radii query ms | Adaptation all-radii query ms | Query ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| uniform single small | 0.005960 | 0.038540 | 6.47x | 0.028318 | 0.026315 | 0.93x |
| uniform multi-radius | 0.023394 | 0.080722 | 3.45x | 0.732770 | 1.564722 | 2.14x |
| uniform wide-radius ratio | 0.027963 | 0.184821 | 6.61x | 3.035706 | 9.361380 | 3.08x |
| clustered multi-radius | 0.025830 | 0.136609 | 5.29x | 3.426722 | 11.458924 | 3.34x |
| periodic boundary bands | 0.012593 | 0.080875 | 6.42x | 0.566342 | 1.290173 | 2.28x |

Only the tiny single-radius case showed a small query-time benefit. Rebuild was already much slower.

The mechanism normally stored about **9 index entries per agent** and generated substantial duplicate candidate references once the receiver also scanned multiple cells. In the wide-radius scenario, the mean was about **677 raw candidate references/query**, collapsing to about **101 unique candidates/query** after deduplication.

## Conclusion

The negative result applies only to this hybrid adaptation:

> Fixed radius-independent stamping plus receiver-side multi-cell radius scanning is a poor trade for Virtual Lab's generic receiver-radius API.

It does **not** imply that faithful ARGoS RAB coverage indexing is inefficient. ARGoS uses transmitter-owned ranges, range-box stamping, receiver point lookup, and directional exact range tests; #173 implements and measures that semantic model separately.

## Maintenance decision

- The fixed-halo implementation and dedicated benchmark are removed from active code in #173.
- This document and Git history preserve the evidence.
- The adaptation is not part of the generic tournament.
- Faithful ARGoS RAB is evaluated separately under transmitter-owned-range semantics.
