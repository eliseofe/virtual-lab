# Virtual Lab — Current Project State

Updated: **14 September 2026**

This file is the durable, context-free starting point for future ChatGPT/Work/human sessions. **Read it before inferring roadmap order from old issue numbering, old chats, or historical issue bodies.**

## Current production frontier

Repository: `eliseofe/virtual-lab`

Production: `https://eliseofe.github.io/virtual-lab/`

Current accepted production sequence:

- #90 / PR #91 — prepared controller IR / pre-resolved names/operators;
- #92 / PR #93 — reusable observation/query buffers;
- #95 / PR #94 — controller-cost attribution profiling;
- #96 / PR #97 — flattened controller expressions to compact stack bytecode;
- #98 / PR #99 — reuse bearing-noise rotation per observation;
- **#29 / PR #103 — worker-owned simulation scheduler, independent visualization cadence.**

Current production merge after #29: `f713dad722c68683bfc5822366b2e8071395b307`.

Owner production phone test before #29, after #90/#92/#95/#96/#98: **massive visible performance improvement around N=91** for the built-in Active Elastic experiment. The controller/kernel performance lane is therefore materially successful. Do not restart controller/math micro-optimization from old profiling notes unless fresh evidence demands it.

#29 has now been implemented, merged and deployed. Automated production acceptance is green; the **only immediate next action is an owner visual phone check of large-swarm fluidity, especially at 1×**. Do not start another #56 optimization child before that check.

The broader performance epic #56 remains open because other software-performance layers may still exist after owner acceptance of #29.

## #29 — completed runtime/visualization scheduling repair

### Old defect

Before #29:

- browser main thread owned `RUNTIME_INTERVAL_MS = 50`;
- main computed `ticksPerAdvance()` from requested speed and sent `{type: "advance", ticks}`;
- worker computed the whole batch and only then emitted one snapshot;
- canvas used `requestAnimationFrame`, but repeatedly redrew the same stale state until the worker returned.

This incorrectly coupled scientific execution, requested speed and visible snapshot cadence. Large/heavy swarms could advance model time quickly while appearing jerky/frozen.

### Current architecture

The owner-approved separation is now implemented:

#### Simulation worker/runtime

- owns Run/Pause/target-speed state;
- advances fixed scientific physics/control steps continuously in **bounded adaptive work chunks**;
- at attainable requested speeds, paces model time against wall time;
- above compute capacity, stays busy and saturates near maximum achievable throughput instead of growing unbounded batches;
- yields between chunks so Pause, speed changes, reset, setup and controller messages remain responsive;
- publishes visualization snapshots independently at a bounded wall-clock cadence;
- fixed `PHYSICS_DT`, control cadence, metric cadence, controller semantics, RNG ordering and environment-owned action application are unchanged.

#### Main-thread renderer/UI

- does **not** clock scientific physics execution;
- renders on the browser animation clock via `requestAnimationFrame`;
- draws the newest published state available;
- can skip intermediate visual states without changing scientific trajectory;
- remains observational: render cadence cannot affect simulation state.

A direct exact-tick `advance` worker command still exists **only as a profiling/test hook** so historical raw benchmarks remain comparable. Production `main.js` is statically tested not to use it.

### #29 measured evidence

New browser scheduler probe uses **10,000 agents** and the actual worker-owned `run/pause/set-speed` path, with 1.2 s wall-clock windows:

| Requested | Achieved | Fresh snapshot rate |
|---:|---:|---:|
| 1× | 0.99× | 48.3 Hz |
| 5× | 4.88× | 48.3 Hz |
| 20× | 8.40× | 42.5 Hz |
| 60× | 8.46× | 42.2 Hz |
| 240× | 8.39× | 41.5 Hz |

Interpretation is purely software/performance: attainable rates are paced accurately; once compute capacity is exceeded on that CI runner, throughput saturates around ~8.4× instead of degrading as requested speed rises; visualization snapshots remain ~42–48 Hz rather than being tied to old 50 ms UI-driven batch completions.

All existing exact-tick performance guardrails completed successfully, including ordered Active Elastic and disordered Simple Random Walk.

PR #103 checks:

- Round 1A build/test workflow: success;
- Performance profile workflow: success.

Post-merge production workflow run `34783324182`:

- build: success;
- GitHub Pages deploy: success;
- deployed browser smoke: success.

Owner visual confirmation on the actual phone/device is still required before declaring the large-swarm presentation symptom closed in practice.

## Immediate execution order after owner phone check

1. **Owner phone check for #29 — ACTIVE NEXT ACTION.**
   - Test deployed production, ideally a larger swarm at `1×` first.
   - Question is narrow: does motion now look materially fluid rather than stepping/freezing while model time continues?
   - This is not a full UI/UX review.
   - If the visible defect persists despite the scheduler measurements, investigate rendering/state-transfer cost next rather than reopening controller math.

2. **#100 — bounded pre/post trajectory-equivalence regression check.**
   - Owner is ~92% confident that Active Elastic at `U=0.05`, same usual deterministic setup, behaves differently after the performance round: current production may split early and later rejoin whereas the pre-performance version reportedly remained one group.
   - Do not scientifically analyze the split, forces, stability, or model.
   - Perform only a short deterministic software-equivalence comparison between an appropriate pre-performance revision and current runtime; answer identical/divergent and first numerical divergence if any.
   - Pre-performance reference recorded in #100: `9ee2cd50c8e4ade8b60df0fafc1b4d40b6e71fdd`.
   - Do not use a new numerical integrator to mask this question.

3. **#101 — large-swarm initialization ceiling.**
   - Owner cannot reliably initialize target large swarms around `10,000+` agents, eventually `100,000`, with missing-agent/setup errors depending on initializer.
   - Runtime contract has no intentional hard maximum on N.
   - Classify whether the blocker is initializer algorithm, initializer interpreter/runtime scalability, validation/transport/memory, or another infrastructure layer.
   - Fix the immediate blocker so performance scaling can proceed.
   - Feed the generic lesson into #65: students should not need to reinvent fragile low-level placement; future setup/world capabilities should include scalable simulator-owned placement primitives while preserving experiment-specific semantics.

4. **#102 — numerical integrator evaluation — BACKLOG ONLY.**
   - Current simulator uses fixed-step Euler.
   - Owner is open to evaluating a more accurate integrator later, but only as an explicit accuracy/performance design decision with owner scientific input where required.
   - Never use this as the explanation/fix for #100 before existing-integrator pre/post behavior is checked.

5. After #29 owner acceptance plus #100/#101 checkpoints, return to #56 and choose any next performance venue from fresh measurements. Do not continue old micro-optimization threads automatically.

## Performance evidence and permanent guardrails

Two real workloads remain permanent software-performance guardrails:

1. **Ordered Active Elastic** — ordered hexagonal setup, zero position noise; dense/structured local-neighbourhood workload.
2. **Disordered Simple Random Walk** — random initializer; dynamically changing/disordered opposite guardrail.

These are performance coverage cases, not invitations to scientifically retune the experiments.

Important rejected optimization:

- #83 direct neighbour-cell enumeration / removal of per-query x/y temporary vectors was measured and **rejected** because representative neighbour-query timings regressed. #83 is closed `not_planned`; do not rediscover and repeat that candidate without new evidence.

Post-#98 owner validation:

- deployed Active Elastic around N=91 is dramatically faster than before the performance round;
- #98 remains accepted/closed;
- possible `U=0.05` behavior concern is isolated in #100 rather than invalidating throughput gains by assumption.

## Experiment registry / MCP status

Production registry integration is active. Student-facing flow:

student AI authors validated experiment → registry → production Virtual Lab loads same sources → student manually runs/observes/edits → Lab can save back safely → AI can read later.

MCP/registry facts:

- Supabase project ref: `izdmmudfrmqhvlgepwes`;
- endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`;
- authoring contract: `vlab.authoring/0.3`;
- runtime contract: `vlab.runtime/0.1`;
- student-facing MCP tools: `read_workspace`, `manage_collection`, `create_experiment`, `edit_experiment`, `delete_experiment`;
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
2. Inspect current `main` and latest comments on #56 before trusting an old chat summary.
3. #29 is **implemented and deployed**; do not propose rebuilding the old scheduler solution.
4. Immediate next action is owner visual phone confirmation of large-swarm fluidity on production.
5. Do not reopen controller/math micro-optimization simply because #56 is open.
6. Preserve both real-workload performance guardrails: ordered Active Elastic and disordered Simple Random Walk.
7. Keep #100 bounded to software equivalence; no scientific investigation unless owner explicitly authorizes it.
8. Treat #101 as both an immediate large-N blocker and evidence for #65's future scalable setup capabilities.
9. Do not implement #102 as a regression fix.
10. Test/deploy/close the loop before reporting future implementation completion.
