# Virtual Lab performance baseline — 13 September 2026

This document records the first reproducible software-performance baseline for #56/#79. It is a software engineering measurement only. The synthetic workloads are not scientific experiments and the measurements below do not validate, tune, or interpret any scientific model.

## Measurement environment

GitHub Actions run: `34775141432`

- Ubuntu 24.04.5 (`ubuntu-24.04` runner image)
- AMD EPYC 7763
- 4 logical CPUs / 2 physical cores
- Rust 1.98.1
- Headless Chrome 152.0.0.0
- browser `hardwareConcurrency = 4`

The raw runner environment, native CSV output, and browser JSON output are retained in the workflow artifact `performance-profile-0dd48c6469e54cca9b07178332e29f60ddc852c1` for 30 days.

## Native Rust profile

All timings are median wall-clock milliseconds. `observation_all_ms` includes neighbour-query work, so it must not be added to `query_all_ms` when attributing total cost.

| Case | Agents | Radius | Avg neighbours | Rebuild ms | Query all ms | Observation all ms | Controller all ms | Physics sweep ms | Snapshot ms | End-to-end model-time / wall-time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| agents-100 | 100 | 1.0 | 4.000 | 0.0087 | 0.0434 | 0.0751 | 0.0677 | 0.0012 | 0.0001 | 729.0× |
| agents-1000 | 1,000 | 1.0 | 3.950 | 0.1003 | 0.8000 | 0.9053 | 0.6896 | 0.0120 | 0.0005 | 54.3× |
| agents-10000 | 10,000 | 1.0 | 4.000 | 0.9146 | 3.3964 | 5.1542 | 6.9374 | 0.1201 | 0.0076 | 6.77× |
| radius-0.5 | 1,000 | 0.5 | 0.000 | 0.0743 | 0.2859 | 0.3181 | 0.2158 | 0.0120 | 0.0006 | 127.7× |
| radius-2.0 | 1,000 | 2.0 | 11.802 | 0.0761 | 1.4830 | 1.8787 | 1.5819 | 0.0120 | 0.0005 | 24.1× |
| radius-4.0 | 1,000 | 4.0 | 47.020 | 0.0771 | 3.6924 | 4.6921 | 5.5516 | 0.0120 | 0.0005 | 6.32× |

Measured attribution:

- At 1,000 agents / radius 1, the control-update path dominates: all-agent observation construction is ~0.91 ms and all-agent controller execution is ~0.69 ms, while a physics sweep is ~0.012 ms and snapshot cloning is ~0.0005 ms.
- At 10,000 agents / radius 1, controller execution is the largest standalone measured component (~6.94 ms), with observation construction close behind (~5.15 ms). The neighbour query accounts for ~3.40 ms of the observation figure.
- Increasing mechanically observed neighbour count from 0 to ~12 to ~47 at 1,000 agents increases controller time from ~0.22 to ~1.58 to ~5.55 ms and observation time from ~0.32 to ~1.88 to ~4.69 ms.
- Physics integration and snapshot cloning are not meaningful bottlenecks in this baseline.

## Browser / WASM worker profile

The browser profile uses the real generated WASM kernel and the real `worker.js` transport. `ticks = 0` therefore gives an estimate of snapshot + worker-message round-trip overhead without simulation advancement.

| Agents | Ticks | Round-trip ms | Model-time / wall-time |
| ---: | ---: | ---: | ---: |
| 100 | 0 | 0.10 | — |
| 100 | 10 | 1.30 | 76.9× |
| 100 | 100 | 11.9 | 84.0× |
| 1,000 | 0 | 0.20 | — |
| 1,000 | 10 | 3.90 | 25.6× |
| 1,000 | 100 | 29.9 | 33.4× |
| 10,000 | 0 | 0.60 | — |
| 10,000 | 10 | 20.4 | 4.90× |
| 10,000 | 100 | 199.5 | 5.01× |

The zero-tick round trip is only ~0.1–0.6 ms over these sizes. Browser/WASM execution is slower than native execution, but the same scaling shape remains: core control-update computation dominates rather than worker transport or snapshot messaging.

## Current 50 ms scheduler policy

The browser profiler also mechanically reproduced the current production request policy with 1,000 synthetic agents.

| Requested speed | Batch ticks | Achieved speed |
| ---: | ---: | ---: |
| 20× | 100 | 18.3× |
| 60× | 300 | 29.0× |
| 120× | 600 | 28.9× |
| 240× | 1,200 | 29.1× |
| 480× | 2,400 | 30.3× |

On this runner, the historical degradation symptom recorded in #29 was not reproduced. The current scheduler saturates at roughly 29–30× above a requested 60×. This is below the direct 100-tick-batch measurement (~33.4×) but is not the dominant performance limitation in this baseline.

## Next measured target

The first optimization child should target the controller IR execution hot path rather than #29.

Code inspection after the measurement identifies two allocation-heavy mechanics that are consistent with the measured controller cost and can be changed without altering the controller contract:

1. every `IrControllerRuntime::step` creates a fresh `HashMap` for locals;
2. every call expression currently allocates a temporary `Vec<Value>` before dispatching by function name.

These are hypotheses, not conclusions. The next child should remove the smallest of these avoidable runtime allocations while preserving exact controller semantics, then run the same profile before and after. Observation/neighbour-path optimization should follow only if the measured post-change profile warrants it.
