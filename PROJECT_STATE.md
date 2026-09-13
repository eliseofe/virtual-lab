# Virtual Lab — Current Project State

Updated: **14 September 2026**

This is the durable, context-free starting point for future ChatGPT/Work/human sessions. Read it before inferring roadmap order from old issue numbers or old chats.

## Current production frontier

Repository: `eliseofe/virtual-lab`

Production: `https://eliseofe.github.io/virtual-lab/`

Accepted production sequence:

- #90 / PR #91 — prepared controller IR / pre-resolved names/operators;
- #92 / PR #93 — reusable observation/query buffers;
- #95 / PR #94 — controller-cost attribution profiling;
- #96 / PR #97 — flattened controller expressions to compact stack bytecode;
- #98 / PR #99 — reuse bearing-noise rotation per observation;
- #29 / PR #103 — worker-owned simulation scheduler and independent visualization cadence.

#29 production merge: `f713dad722c68683bfc5822366b2e8071395b307`.

Owner-visible validation:

- after the controller/kernel performance round, Active Elastic around N=91 became **massively faster** on the owner's phone;
- after #29, the owner tested **N=1,000** and considers the formerly jerky/frozen visualization problem a **win**: motion is now sufficiently fluid;
- #101 subsequently showed that the current production initializer/compiler has **no generic 10k/100k population ceiling**: both supported Active Elastic placement modes generate and runtime-validate 100,000 agents when the arena/setup is valid; #29 had already exercised the browser worker/WASM path at 10,000 agents.

The broader performance epic #56 remains open because further high-level performance venues may still exist. Do not restart controller/math micro-optimization from old profiling notes without fresh evidence.

## #29 — completed and owner accepted

Old architecture: the browser main thread clocked the worker by sending fixed 50 ms `advance` batches. The worker returned one snapshot only after each batch, so scientific execution and visualization cadence were coupled.

Current architecture:

### Simulation worker/runtime

- owns Run/Pause/target-speed state;
- advances fixed scientific physics/control steps continuously in bounded adaptive work chunks;
- paces model time against wall time when the requested rate is attainable;
- saturates cleanly above compute capacity instead of growing unbounded batches;
- yields between chunks so Pause, speed changes, reset, setup and controller messages remain responsive;
- publishes visualization snapshots independently at a bounded wall-clock cadence;
- preserves fixed `PHYSICS_DT`, control cadence, metric cadence, controller semantics, RNG ordering and environment-owned action application.

### Main-thread renderer/UI

- does not request scientific physics work on a timer;
- renders via `requestAnimationFrame`;
- draws the newest published state available;
- may skip intermediate visual states without altering the scientific trajectory.

A direct exact-tick `advance` worker command remains only as a profiling/test hook; production `main.js` is statically tested not to use it.

Automated #29 10,000-agent scheduler evidence on CI:

| Requested | Achieved | Fresh snapshot rate |
|---:|---:|---:|
| 1× | 0.99× | 48.3 Hz |
| 5× | 4.88× | 48.3 Hz |
| 20× | 8.40× | 42.5 Hz |
| 60× | 8.46× | 42.2 Hz |
| 240× | 8.39× | 41.5 Hz |

Post-merge build, Pages deployment and deployed-browser smoke all passed. Owner phone validation at N=1,000 also passed.

## #100 — completed clean semantic-regression check

Owner had reported a possible behavioral difference in Active Elastic after the performance round when `U` was raised from nominal `0.005` to `0.05`.

Important: #100 did **not** compare U=0.005 against U=0.05. It compared **pre-performance vs current simulator, both at U=0.05**, with the same deterministic setup.

Compared:

- pre-performance reference: `9ee2cd50c8e4ade8b60df0fafc1b4d40b6e71fdd` (post-#92, before #95/#96/#98 runtime changes);
- current runtime line after #29.

One fixture was generated once and fed unchanged to both revisions:

- N=91;
- ordered `hexagon_perturbed` initialization;
- zero position noise;
- seed 2026;
- U=0.05;
- arena 10;
- physics dt 0.01;
- control dt 0.1;
- sensor noise 0.1;
- interaction radius 0.81;
- same controller IR and same parameters.

Both versions advanced **1,000 physics ticks = 10 model seconds**. After every tick, every agent `x`, `y`, and `heading` was compared by exact IEEE-754 bit pattern.

Result from workflow run `34783864144`:

`RESULT=IDENTICAL ticks=1000 comparison=bitwise-state`

Therefore no numerical trajectory regression was demonstrated from the performance-round runtime changes in this controlled U=0.05 case. Per the scientific guardrail, stop there: do not investigate the split/rejoin scientifically, do not retune parameters, and do not change integrators to explain it.

Test scaffolding PR #104 was intentionally closed **unmerged** after evidence was recorded in #100 and #56.

## #101 — completed large-N initialization diagnosis

The owner had observed setup failures while trying to move toward 10,000 and eventually 100,000 agents, sometimes reported as a missing/unplaced agent. The exact historical editor configuration/source was not preserved, so do not invent a specific historical root cause.

Bounded diagnosis in temporary PR #105 used the current production initializer compiler and runtime validation, including the production Active Elastic initializer logic. PR #105 was closed **unmerged** after evidence was recorded; it did not create a production deployment.

With an intentionally oversized arena so geometry was not the limiting factor, both supported placement modes succeeded at 10,000 and 100,000 agents:

| N | initializer | compile | runtime validation | serialized initial state |
|---:|---|---:|---:|---:|
| 10,000 | `hexagon_perturbed` | ~173 ms | ~2.0 ms | ~0.65 MB |
| 10,000 | `random` | ~61 ms | ~1.3 ms | ~0.76 MB |
| 100,000 | `hexagon_perturbed` | ~625 ms | ~2.1 ms | ~6.62 MB |
| 100,000 | `random` | ~234 ms | ~1.2 ms | ~7.64 MB |

Combined with #29's successful 10,000-agent browser worker/WASM run, current evidence does **not** support a simulator-wide/browser hard population ceiling at 10k, nor a generic initializer/compiler ceiling at 100k.

Two concrete setup failure classes were isolated:

1. **Geometry does not fit the configured arena.** The initializer can correctly produce all N agents and runtime validation then rejects the first out-of-arena agent. For the hexagonal initializer, increasing N while keeping lattice spacing fixed requires a correspondingly larger arena. This is a setup/geometry constraint, not a population cap.
2. **Configured initialization method is not handled by the initializer source.** If `initialize(...)` takes no branch, zero agents are placed and the generic compiler diagnostic becomes `initializer did not place agent 0`. This explains one class of misleading agent-0 errors, but cannot be claimed as the owner's exact historical failure without the old editor state.

Classification: **setup/experiment-specific, not generic simulator infrastructure**, based on reproducible evidence. If a large-N failure recurs, capture the exact configuration and initializer source and diagnose that concrete case rather than reopening a speculative global ceiling.

Architectural lesson remains with #65: reusable simulator-owned placement/setup capabilities would improve student ergonomics and reduce fragile hand-written setup code, even though there is no current generic scaling defect to repair.

## Browser ceiling / native-backend context

The owner's Rust-expert colleague warned that browser/WASM execution has eventual resource ceilings such as memory/runtime/threading constraints. That architectural concern is valid and is represented by future issue #8: keep portable experiment semantics so the same experiment can later run through a native workstation or HPC backend.

Do **not** reinterpret that warning as evidence that browser memory/state transfer is the current bottleneck. Current measurements already show a 10,000-agent worker/WASM run with ~42–48 fresh snapshots/s, and #101 shows 100,000-agent initializer generation/validation is small enough to complete comfortably on CI. Native/HPC work should become active when an actual browser ceiling is measured, not pre-emptively.

## Open documented items

### #102 — numerical integrator evaluation — backlog only

Current simulator uses fixed-step Euler. Owner is open to evaluating more accurate alternatives later, but only as an explicit accuracy/performance design decision with owner scientific input where required.

Do not use a new integrator to explain or patch #100; #100 is already closed cleanly.

### #56 — performance epic

Three useful high-level findings are now established:

1. controller/kernel execution — large owner-visible improvement at N≈91;
2. browser scheduling/render-cadence architecture — #29 accepted at N=1,000 and supported by automated 10k measurements;
3. large-N initialization — #101 found no generic 10k/100k initializer ceiling; historical failures are setup-specific until reproduced with exact source/config.

Do not continue arithmetic/controller micro-optimization merely because individual hotspots exist. Do not promote speculative browser-memory work solely because a future browser ceiling is plausible. Any next performance task should start from fresh evidence of a real limiting layer.

## Permanent performance guardrails

1. **Ordered Active Elastic** — ordered hexagonal setup, zero position noise; dense/structured local-neighbourhood workload.
2. **Disordered Simple Random Walk** — random initializer; dynamically changing/disordered opposite guardrail.

These are software-performance coverage cases, not invitations to scientifically retune experiments.

Rejected optimization to remember:

- #83 direct neighbour-cell enumeration / removal of per-query x/y temporary vectors was measured and rejected because representative neighbour-query timings regressed. #83 is closed `not_planned`; do not repeat it without new evidence.

## Experiment registry / MCP status

Production registry integration is active.

Student-facing flow:

student AI authors validated experiment → registry → production Virtual Lab loads same sources → student manually runs/observes/edits → Lab can save back safely → AI can read later.

Facts:

- Supabase project ref: `izdmmudfrmqhvlgepwes`;
- endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`;
- authoring contract: `vlab.authoring/0.3`;
- runtime contract: `vlab.runtime/0.1`;
- student-facing MCP tools: `read_workspace`, `manage_collection`, `create_experiment`, `edit_experiment`, `delete_experiment`;
- AI still cannot run the simulator or observe simulation results automatically; future explicit results channel remains #6.

Real workload registry references:

- Simple Random Walk: `75a313d5-150a-4831-b4f7-b02255a1482e`;
- ordered Active Elastic snapshot: `b57a9113-32d5-4c82-928b-22ceec2c4a2b`.

## Scientific guardrail

Implementation work may reason about software architecture, parser/compiler design, runtime interfaces, synchronization, security, performance, tests and deployment.

Do **not** independently perform scientific reasoning, derivations, equilibrium calculations, model analysis, parameter inference, scientific retuning, or decide scientific/numerical-model choices.

If a software decision requires a new scientific choice, stop and ask the owner that specific question. Existing accepted scientific values/behavior may be preserved mechanically during refactoring.

## Architecture constraints

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

- #57 — canonical deterministic RNG with domain-separated streams.
- #58 — extensible capability registry / feature-request path.
- #65 — first-class world/environment/setup capability architecture, including future reusable placement/setup capabilities.
- #6 — future explicit Lab → AI results/plots channel.
- #8 — future native/HPC backend, activated by measured browser limits rather than speculation.
- #52 — mock-sim visual twin, deprioritized.
- #14/#2 — older scientific validation issues; audit against current simulator and scientific guardrail before scheduling.

## Cost invariant

This remains a zero-euro incremental-cost project: GitHub/GitHub Pages, existing Supabase free-tier project, client-side browser compute, and already-owned AI subscriptions/accounts.

## Resume instructions for a context-free agent

1. Read this file first.
2. Inspect current `main` and latest comments on #56 before trusting an old chat summary.
3. #29 is implemented, deployed and owner accepted; do not propose rebuilding the old scheduler solution.
4. #100 is completed: pre/post at U=0.05 was bit-for-bit identical for 1,000 ticks; do not reopen without genuinely new evidence.
5. #101 is completed: production initializer generation/runtime validation handles 10k and 100k with valid setup; if a failure recurs, capture the exact config + initializer source before diagnosing it.
6. Do not reopen controller/math micro-optimization simply because #56 is open.
7. Preserve both real-workload performance guardrails.
8. #102 remains backlog and requires owner scientific involvement before numerical-method choices.
9. #8 is future native/HPC architecture for a measured browser ceiling; current evidence does not establish browser memory as the immediate bottleneck.
10. Any next performance task should be a new high-level venue justified by fresh evidence, not a speculative optimization lane.
11. Test/deploy/close the loop before reporting future implementation completion.
