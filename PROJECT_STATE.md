# Virtual Lab — Current Project State

Updated: **14 September 2026**

This file is the durable, context-free starting point for future ChatGPT/Work/human sessions. **Read it before inferring roadmap order from old issue numbering, old chats, or historical issue bodies.**

## Current production frontier

Repository: `eliseofe/virtual-lab`

Production: `https://eliseofe.github.io/virtual-lab/`

Current accepted production line before the next scheduler change:

- #90 / PR #91 — prepared controller IR / pre-resolved names/operators;
- #92 / PR #93 — reusable observation/query buffers;
- #95 / PR #94 — controller-cost attribution profiling;
- #96 / PR #97 — flattened controller expressions to compact stack bytecode;
- #98 / PR #99 — reuse bearing-noise rotation per observation.

Post-#98 main checkpoint: `37cc9517a2409d328d826af5f7f2b51e37f4d964`.

Owner production phone test after this sequence: **massive visible performance improvement around N=91** for the built-in Active Elastic experiment. The performance work is therefore user-visible and materially successful. Do not restart controller/math micro-optimization from old profiling notes unless new evidence demands it.

The broader performance epic #56 remains open because other software-performance layers remain.

## Immediate execution order — owner-approved

1. **#29 — runtime/visualization scheduling architecture — ACTIVE NEXT.**
   - Long-standing large-swarm visualization defect is now explicitly reported by the owner.
   - Current browser main thread sends fixed 50 ms simulation batches to the worker; the worker computes the whole batch and returns one snapshot. The canvas may redraw at display rate but repeats the same state until the worker responds.
   - This couples scientific execution, requested speed and visible snapshot cadence. Larger/heavier swarms can still advance model time quickly while appearing jerky/frozen.
   - Owner-approved target architecture: **the simulation worker/runtime owns the simulation loop and target model-time/wall-time pacing; rendering is observational and independently samples the newest available state.** The UI must not clock physics by repeatedly sending batches.
   - At 1x, if the machine has enough compute capacity, visualization should be fluid. Above compute capacity, simulation should saturate cleanly rather than creating ever-larger UI-driven batches.
   - Physics/control timestep semantics must not change.

2. **#100 — bounded pre/post trajectory-equivalence regression check.**
   - Owner is ~92% confident that Active Elastic at `U=0.05`, same usual deterministic setup, behaves differently after the performance round: current production may split early and later rejoin whereas the pre-performance version reportedly remained one group.
   - Do not scientifically analyze the split, forces, stability, or model. Perform only a short deterministic software-equivalence comparison between an appropriate pre-performance revision and current runtime; answer identical/divergent and first numerical divergence if any.
   - Do not use a new numerical integrator to mask this question.

3. **#101 — large-swarm initialization ceiling.**
   - Owner cannot reliably initialize target large swarms around 10,000+ agents (eventually 100,000), with missing-agent/setup errors depending on initializer.
   - Runtime contract has no intentional hard maximum on N. Classify whether the blocker is initializer algorithm, initializer interpreter/runtime scalability, validation/transport/memory, or another infrastructure layer.
   - Fix the immediate blocker so performance scaling can proceed.
   - Feed the generic lesson into #65: students should not need to reinvent fragile low-level placement; future setup/world capabilities should include scalable simulator-owned placement primitives while preserving experiment-specific semantics.

4. **#102 — numerical integrator evaluation — BACKLOG ONLY.**
   - Current simulator uses fixed-step Euler.
   - Owner is open to evaluating a more accurate integrator later, but only as an explicit accuracy/performance design decision with owner scientific input where required.
   - Never use this as the explanation/fix for #100 before the existing integrator's pre/post behavior is checked.

5. After #29/#100/#101 checkpoints, return to #56 and choose the next performance venue from fresh measurements rather than continuing old micro-optimization threads automatically.

## #29 architectural intent

The desired runtime split is now explicit:

### Simulation worker/runtime

- owns Run/Pause/target-speed state;
- advances fixed scientific physics/control steps continuously in bounded work chunks;
- at attainable requested speeds, paces model time against wall time;
- above compute capacity, remains busy and saturates near maximum achievable throughput rather than growing unbounded batches;
- yields often enough to process Pause, speed-change, reset, setup and controller messages promptly;
- publishes visualization snapshots independently of every physics step and without building an obsolete queue.

### Main-thread renderer/UI

- does **not** trigger scientific physics execution on a timer;
- renders on the browser animation clock;
- always draws the newest published state available;
- may drop intermediate visualization states without changing scientific trajectory;
- remains observational: render cadence cannot alter simulator state or RNG/order semantics.

For very large swarms, state-transfer/copy pressure may later require transferable/shared buffers, but that is an implementation optimization after the scheduling boundary is correct.

## Performance evidence and guardrails

Two real workloads remain permanent performance guardrails:

1. **Ordered Active Elastic** — ordered hexagonal setup, zero position noise; dense/structured local neighbourhood workload.
2. **Disordered Simple Random Walk** — random initializer; dynamically changing/disordered opposite guardrail.

These are software-performance coverage cases, not invitations to scientifically retune the experiments.

Important previous result:

- #83 direct neighbour-cell enumeration / removal of per-query x/y temporary vectors was measured and **rejected** because it regressed representative neighbour-query timings. #83 is closed `not_planned`; do not rediscover and repeat that candidate without new evidence.

Post-#98 owner validation:

- deployed Active Elastic around N=91 is dramatically faster than before the performance round;
- #98 remains accepted/closed;
- possible U=0.05 behavior concern is isolated in #100 rather than invalidating the throughput result by assumption.

## Current browser/runtime facts relevant to #29

Before #29 repair:

- main thread uses `RUNTIME_INTERVAL_MS = 50`;
- main thread computes `ticksPerAdvance()` from requested speed and sends `{type: "advance", ticks}`;
- only one request is kept pending;
- worker runs `simulation.advance_ticks(ticks)` synchronously and only then emits one state snapshot;
- renderer uses `requestAnimationFrame`, but until a new worker snapshot arrives it redraws the same `latestState`.

Therefore display refresh and scientific compute throughput are incorrectly coupled through batch completion even though WASM simulation is already in a Web Worker.

## Experiment registry / MCP status

Production registry integration completed after the older version of this file. The active student-facing architecture is:

student AI authors validated experiment → registry → production Virtual Lab loads same sources → student manually runs/observes/edits → Lab can save back safely → AI can read later.

MCP/registry facts:

- Supabase project ref: `izdmmudfrmqhvlgepwes`;
- endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`;
- authoring contract: `vlab.authoring/0.3`;
- runtime contract: `vlab.runtime/0.1`;
- student-facing MCP tools remain `read_workspace`, `manage_collection`, `create_experiment`, `edit_experiment`, `delete_experiment`;
- AI still cannot run the simulator or observe simulation results automatically; future explicit results channel remains #6.

Genuine student-authored Simple Random Walk experiment:

- ID `75a313d5-150a-4831-b4f7-b02255a1482e`;
- used as the disordered real-workload performance guardrail.

Ordered Active Elastic registry snapshot used in profiling:

- ID `b57a9113-32d5-4c82-928b-22ceec2c4a2b`.

## Scientific guardrail

Implementation work may reason about software architecture, parser/compiler design, runtime interfaces, synchronization, security, performance, tests and deployment.

Do **not** independently perform scientific reasoning, derivations, equilibrium calculations, model analysis, parameter inference, scientific retuning, or decide scientific/numerical-model choices.

If a software decision appears to require a new scientific choice, stop and ask the owner that specific question. Existing accepted scientific values/behavior may be preserved mechanically during refactoring.

For #100 specifically, test software equivalence only. For #102, numerical-method selection requires owner involvement before any scientific choice is made.

## Important architecture constraints

- Agent input = local observation; output = action.
- Agent internal state remains private/stateful.
- RNG is simulator-owned.
- Actions are applied by environment/physics, never by agent code.
- Physics, control, visualization and metrics schedules are separable.
- Renderer cannot affect trajectory.
- Controllers are authored in the Python-like language but executed through compiled/prepared Rust/WASM runtime structures, not per-step Python interpretation.
- Neighbour perception must scale; brute-force neighbour oracle is retained for equality tests.
- Heterogeneous agents remain a future extension; current core starts homogeneous.

## Other backlog

- #56 — performance epic, still open.
- #57 — canonical deterministic RNG with domain-separated streams.
- #58 — extensible capability registry / feature-request path.
- #65 — first-class world/environment/setup capability architecture.
- #6 — future explicit Lab → AI results/plots channel.
- #8 — future native/HPC backend.
- #52 — mock-sim visual twin, deprioritized.
- #14/#2 — older scientific validation issues; audit against current simulator and scientific guardrail before scheduling.

## Cost invariant

This remains a **zero-euro incremental-cost project**. Baseline uses GitHub/GitHub Pages, the existing Supabase free-tier project, client-side browser compute, and already-owned AI subscriptions/accounts.

## Resume instructions for a context-free agent

1. Read this file first.
2. Inspect current `main` and the latest comments on #56 before trusting an old chat summary.
3. Current next active implementation is #29 under the **worker-owned simulation loop / independent renderer** architecture described above.
4. Do not reopen controller/math micro-optimization simply because #56 is open.
5. Preserve both real-workload performance guardrails: ordered Active Elastic and disordered Simple Random Walk.
6. Keep #100 bounded to software equivalence; no scientific investigation unless owner explicitly authorizes it.
7. Treat #101 as both an immediate large-N blocker and evidence for #65's future scalable setup capabilities.
8. Do not implement #102 as a regression fix.
9. Test/deploy/close the loop before reporting implementation completion.
