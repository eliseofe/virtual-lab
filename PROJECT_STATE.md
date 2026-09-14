# Virtual Lab — Current Project State

Updated: **14 September 2026**

This is the durable **detailed technical state/evidence** for future ChatGPT/Work/human sessions. For current strategy, priority and sequencing, read `AGENTS.md` and then `PROJECT_CONTROL.md` **before** this file. Do not infer roadmap priority from the order of technical sections below.

## Repository and production

Repository: `eliseofe/virtual-lab`

Production: `https://eliseofe.github.io/virtual-lab/`

Current production line includes the completed performance/runtime/visualization work through:

- #90 / PR #91 — prepared controller IR / pre-resolved names/operators;
- #92 / PR #93 — reusable observation/query buffers;
- #95 / PR #94 — controller-cost attribution profiling;
- #96 / PR #97 — flattened controller expressions to compact stack bytecode;
- #98 / PR #99 — reuse bearing-noise rotation per observation;
- #29 / PR #103 — worker-owned simulation scheduler and independent visualization cadence;
- #106 / PR #107 — reliable achieved real-time-factor meter under heavy browser load;
- PR #108 — conservative CI hygiene: docs-only pushes to `main` do not run the Pages pipeline;
- #109 / PR #110 — interactive arena camera, zoom/pan feedback, and selectable agent glyphs;
- #111 / PR #114 — N≈5,000 layer-attribution profile across worker compute, snapshot transfer, main-thread copy, and Canvas rendering;
- #74 / PR #75 + #76 / PRs #77/#78 — private-student production write-back and scalable experiment library, owner accepted 14 September 2026;
- #115 / PR #116 — collection assignment on `Save as new…` plus moving clean owned experiments between collections; deployed, automated smoke green, owner live acceptance still pending.

Important merge SHAs:

- #29: `f713dad722c68683bfc5822366b2e8071395b307`;
- #106: `9de15df3b972f2a2e63c1bd5ebfd6b22467fa7a3`;
- #109: `39ec2423874aef3b75ccc7cc03dc81d96917b733`;
- #111: `69f8d293fc500de7e0cd3647a24decf1f4a49f8b`;
- #115: `5048793c75602faba3d99809693fca1e622642be`.

## Owner-visible acceptance state

- After the controller/kernel performance round, Active Elastic around N=91 became **massively faster** on the owner's phone.
- After #29, N=1,000 phone visualization was accepted as a **win**: the previous jerky/frozen presentation became sufficiently fluid.
- #101 established that the current initializer/compiler has **no generic 10k/100k population ceiling** when the arena/setup is valid.
- The owner subsequently ran **N=100,000** with `ARENA_SIZE=165.0` successfully using both `hexagon_perturbed` and `random` initialization. The earlier large-N failure was setup/geometry-specific, not a generic simulator/browser ceiling.
- #106 fixed the achieved-runtime meter. Owner tested production and accepted that `Actual` now agrees with the visible simulation clock (around 0.6× in the accepted test). Remember: runtime factor is **simulation-time / wall-clock**, not FPS.
- #109 camera/visualization work was owner-tested on phone and reported to work **very well**. Pinch zoom and touch pan are therefore accepted. Desktop mouse/trackpad behavior remains ordinary future regression coverage, not a known defect.
- After #109, the owner reported that N≈5,000 simulations are still slow on the phone. #111 diagnosed the software layers before any graphics optimization; results are below.
- On 14 September 2026 the owner exercised and accepted the normal #74/#76 private-student production flow: open/edit/save an owned experiment, create a private copy, browse/switch within the library, and signed-in ownership/editability behavior. The live registry evidence showed `Simple Random Walk` advanced to revision 4 and a new `Simple Random Walk tiny` copy at revision 1.
- During that acceptance the owner identified the missing ability to choose a collection during `Save as new…` and to move an existing owned experiment between collections. That is #115. It is now implemented/deployed; only the owner's short live acceptance remains.

Do not reopen accepted work without genuinely new evidence.

## Private-student production path — accepted through #76; #115 awaiting owner live acceptance

The production Virtual Lab is a real client of the canonical Supabase experiment registry while scientific execution remains local in browser/WASM.

Accepted behavior through #74/#76:

- production authentication uses its own browser auth-storage namespace;
- signed-in users discover only their own runnable private experiments;
- owned experiments load into the real local compile/run path;
- source edits can save back to the same registry experiment as a new revision;
- stale writes use optimistic `id + owner_id + base revision` protection and refuse silent overwrite;
- `Save as new…` creates a distinct private experiment;
- browser/library navigation exposes Built-in vs My experiments, All / Unfiled / collections, search, ownership/editability and revision context;
- dirty-switch confirmation preserves unsaved work;
- built-in/read-only behavior and anonymous mode remain separate from private persistence.

#74 and #76 are closed `completed` after owner acceptance on 14 September 2026.

### #115 collection assignment/moves

Owner acceptance exposed one remaining organization gap. PR #116 implemented it using the existing `collection_id` and `experiment_collections` model; no new storage model or simulator change was introduced.

Current deployed #115 behavior:

- `Save as new…` offers `Unfiled` plus all collections visible to the signed-in owner;
- copying an owned experiment defaults to its current collection;
- copying the built-in source defaults to `Unfiled`;
- a clean owned experiment exposes a collection selector + `Move` action;
- move is disabled/refused when local source edits are dirty or a revision conflict is known, so moving cannot implicitly persist source edits;
- move uses the same `id + owner_id + base revision` optimistic guard as source write-back;
- successful moves naturally advance the experiment revision through the existing database revision trigger;
- browser grouping, current-location feedback and quick-switch scope refresh after the move.

Live database verification before implementation confirmed both protections for collection ownership:

1. experiment INSERT/UPDATE RLS permits a non-null `collection_id` only when that collection belongs to `auth.uid()`;
2. existing `validate_experiment_collection_owner` trigger independently validates owner/collection consistency.

PR #116 tests passed; `main` build, Pages deployment and deployed browser smoke run `34824094006` all succeeded. Issue #115 remains open only for owner live acceptance of collection placement/movement.

## #29 — worker-owned simulation scheduler — completed and accepted

Old architecture: the browser main thread sent fixed 50 ms `advance` batches. Scientific execution and visualization cadence were coupled.

Current architecture:

### Worker/runtime

- owns Run/Pause/target-speed state;
- advances fixed scientific physics/control steps continuously in bounded adaptive work chunks;
- paces model time against wall time when attainable;
- saturates cleanly above compute capacity;
- yields between chunks so Pause/speed/reset/setup/controller messages remain responsive;
- publishes visualization snapshots independently at a bounded wall-clock cadence;
- preserves fixed scientific dt, control cadence, metric cadence, controller semantics, RNG ordering, and environment-owned action application.

### Main-thread renderer

- does not request physics work on a timer;
- renders with `requestAnimationFrame`;
- draws the newest available state;
- may skip intermediate visual states without affecting the scientific trajectory.

A direct exact-tick `advance` worker command remains profiling/test-only. Production `main.js` is statically guarded not to use it.

Automated #29 10,000-agent scheduler evidence on CI:

| Requested | Achieved | Fresh snapshot rate |
|---:|---:|---:|
| 1× | 0.99× | 48.3 Hz |
| 5× | 4.88× | 48.3 Hz |
| 20× | 8.40× | 42.5 Hz |
| 60× | 8.46× | 42.2 Hz |
| 240× | 8.39× | 41.5 Hz |

## #106 — achieved runtime-factor instrumentation — completed and owner accepted

Historical bug: `Actual` was estimated from adjacent DOM scientific-time update arrival times. Under main-thread stalls, queued snapshots could arrive back-to-back and spuriously inflate the displayed factor.

Fix:

- `RuntimeRateMeter` uses a long-window scientific-time / wall-clock baseline;
- baseline starts when Run begins and resets on target-speed changes;
- main-thread stalls remain in the denominator;
- regression tests include sub-real-time execution and bursty delayed snapshot delivery.

No simulator, scheduler, initialization, rendering, controller, or scientific semantics changed.

Owner production acceptance: displayed factor now matches the visible scientific clock closely enough; this specific issue is passed.

Old extreme-load `Actual` values observed before #106 are not trustworthy performance evidence.

## #109 — interactive arena camera and agent glyphs — completed and owner accepted

Canvas 2D remains the renderer; no engine replacement was required.

Implemented:

- default full-arena fit;
- phone/tablet pinch zoom + drag pan;
- desktop wheel/trackpad zoom around pointer + mouse drag pan;
- bounded camera with one-action `Fit arena` reset;
- visible `Fit` / zoom-factor status;
- clearer arena-border presentation;
- live visual-only glyph selector: `Directional`, `Arrow`, `Dot`;
- viewport culling of off-screen agent glyphs;
- camera transform tests and visualization-only separation guards.

Owner tested phone behavior and reported it works very well.

Future prettier agents **do not require changing engines**. Canvas 2D can support vector shapes, gradients, sprites/images, trails, highlighting, etc. If rendering ever becomes a measured bottleneck at very large N, first consider level of detail: cheap dots when zoomed out, detailed glyphs/sprites when zoomed in. Do not replace Canvas pre-emptively.

## #111 — N≈5,000 slowdown layer attribution — completed

Issue #111 was created after the owner reported that simulations with roughly 5,000 agents remain slow on the phone and asked whether graphics are responsible.

PR #114 added profiling-only instrumentation. Production `main.js` cannot invoke the profiling hook. Normal CI, merge deployment, and deployed-browser smoke all passed.

Profiling workload: N=5,000, ordered Active Elastic production controller source, seed 2026, arena 40 as a profiling fixture large enough to fit the deterministic lattice. This is software-performance evidence only, not scientific retuning or validation.

Performance workflow run: `34791232461`.

On the 4-hardware-thread headless Chrome CI runner:

- 100 physics ticks = 1 model-second took median **212.0 ms** inside worker `advance_ticks` (~4.72 model-seconds / wall-second in the contiguous exact-tick probe);
- snapshot materialization for 5,000 agents / 15,000 state scalars: median **0.20 ms**;
- snapshot payload: **120,000 bytes**;
- incremental state-delivery overhead was below the timer's useful ~0.1 ms resolution in this run;
- production-style main-thread `Array.from(state)`: median **0.30 ms**;
- Canvas 2D at 960×600, DPR 1: dot median **0.60 ms/frame**, current directional glyph median **1.30 ms/frame**.

Production-style concurrent saturation on the same deterministic reset setup:

| Mode | Achieved RTF | Snapshot rate |
|---|---:|---:|
| receive only | 3.157× | 32.6 Hz |
| copy only | 3.222× | 32.2 Hz |
| dot render | 3.249× | 32.8 Hz |
| directional render | 3.149× | 31.9 Hz |

The small ordering differences are run noise. Crucially, enabling the current full directional Canvas drawing did **not** cause a meaningful throughput drop relative to receiving snapshots without drawing.

**Decision:** the next performance lane, if activated, is **worker-side simulator / neighbour / observation / controller computation**, not renderer/LOD and not snapshot transfer.

Caveat: CI headless Chrome is not the owner's phone and cannot quantify phone-specific GPU/thermal behavior. The phone may be slower overall. But on the same browser/CPU environment worker compute dominates snapshot/copy/render cost by orders of magnitude, and normal rendering does not measurably reduce achieved RTF. Do not optimize graphics as the primary speed fix without new phone-specific evidence.

No follow-up worker optimization was started automatically after #111.

## #100 — completed deterministic semantic-regression check

Owner had reported a possible behavior difference in Active Elastic after the performance round when U was raised from nominal 0.005 to 0.05.

#100 did **not** compare U=0.005 vs U=0.05. It compared pre-performance vs current simulator, both at U=0.05, with identical deterministic setup.

Reference: `9ee2cd50c8e4ade8b60df0fafc1b4d40b6e71fdd` vs post-#29 runtime.

Fixture:

- N=91;
- ordered `hexagon_perturbed`;
- zero position noise;
- seed 2026;
- U=0.05;
- arena 10;
- physics dt 0.01;
- control dt 0.1;
- sensor noise 0.1;
- interaction radius 0.81;
- same controller IR and parameters.

Both advanced 1,000 physics ticks = 10 model-seconds. Every agent x/y/heading was compared after every tick by exact IEEE-754 bit pattern.

Workflow `34783864144` result:

`RESULT=IDENTICAL ticks=1000 comparison=bitwise-state`

Therefore no software trajectory regression was demonstrated. Do not scientifically interpret split/rejoin behavior or retune parameters from this result.

Temporary PR #104 was closed unmerged after evidence was recorded.

## #101 — completed large-N initialization diagnosis

Temporary PR #105 tested current production initializer/compiler/runtime validation with oversized arenas so geometry was not limiting.

| N | initializer | compile | runtime validation | serialized state |
|---:|---|---:|---:|---:|
| 10,000 | `hexagon_perturbed` | ~173 ms | ~2.0 ms | ~0.65 MB |
| 10,000 | `random` | ~61 ms | ~1.3 ms | ~0.76 MB |
| 100,000 | `hexagon_perturbed` | ~625 ms | ~2.1 ms | ~6.62 MB |
| 100,000 | `random` | ~234 ms | ~1.2 ms | ~7.64 MB |

Current evidence does **not** support a generic 10k/100k initializer ceiling.

Known setup-specific failure classes:

1. lattice/placement geometry does not fit configured arena;
2. configured initialization method is not handled by initializer source, leaving agents unplaced and producing a generic agent-0 diagnostic.

Owner later confirmed production N=100,000 works with `ARENA_SIZE=165.0` for both `hexagon_perturbed` and `random`.

If large-N initialization fails again, capture exact configuration + initializer source before diagnosing it.

## Browser/native-backend context

Browser/WASM has eventual resource ceilings, represented by future issue #8. Do not reinterpret that architectural fact as evidence that browser memory or state transfer is the current bottleneck.

#111 specifically found snapshot/transfer/render cost small relative to N≈5,000 Active Elastic worker computation on CI. Native/HPC becomes active when an actual browser ceiling is measured, not pre-emptively.

## CI / deployment hygiene

PR #108 changed only automatic pushes to `main`:

- root-level Markdown (`*.md`) and `docs/**`-only pushes do **not** run the full Pages build/deploy/smoke pipeline;
- PR validation remains full;
- manual workflow dispatch remains available;
- any code/runtime/web/test/workflow/non-doc change still triggers normal production deployment.

This was verified by a real docs-only commit producing zero Pages workflow runs.

## Experiment registry / MCP status

Supabase project: `izdmmudfrmqhvlgepwes`.

Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`.

Contracts:

- authoring: `vlab.authoring/0.3`;
- runtime: `vlab.runtime/0.1`.

Current student-facing MCP tools:

- `read_workspace`;
- `manage_collection`;
- `create_experiment`;
- `edit_experiment`;
- `delete_experiment`.

Structural security boundary: the Experiment MCP is experiment-domain only. Grok/Claude have no GitHub, repository, shell, deployment, simulator-source, arbitrary SQL/filesystem, or Supabase-admin capability. These actions are absent from the interface; do not invent an additional LLM policy layer to block them.

AI still cannot run the simulator or observe simulation results automatically; future explicit Lab→AI results/plots channel remains #6.

Current registry workload references:

- Simple Random Walk: `75a313d5-150a-4831-b4f7-b02255a1482e`, revision 4;
- ordered Active Elastic: `b57a9113-32d5-4c82-928b-22ceec2c4a2b`, revision 1.

## Professor capability-request workflow — approved architecture

Authoritative document: `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`.

The owner simplified the unsupported-capability policy deliberately. Do **not** reintroduce a `requestable vs forbidden` classifier for experiment capabilities.

Future authenticated roles should include at least:

- `student`;
- `professor` / `curator`.

For initial owner testing, promote one of the owner's two existing authenticated identities to professor/curator and keep the other as an ordinary student so both paths can be tested with real AI clients.

Initial unsupported-capability rule:

```text
capability exists
    -> allowed

capability missing + professor
    -> preserve experiment intent/draft and create a capability request

capability missing + student
    -> reject as unsupported; no request in first version
```

A capability request is a **first-class Supabase registry/domain row**, not a GitHub issue and not chat state.

Minimum intended request provenance/lifecycle includes:

- stable request ID and timestamps;
- requester identity/role;
- originating experiment/draft ID + revision where available;
- capability domain (`world-builder`, `observation`, `action`, `intrinsic`, etc.);
- concise request name/summary and motivation/context;
- status;
- optional notes;
- optional linked GitHub issue/PR once development starts;
- implemented capability/contract version + completion timestamp.

Initial state machine:

`requested → approved → in_progress → implemented`, with `requested → declined` as the alternative.

### Professor-mode request inbox

Professor mode in the production Virtual Lab should eventually include a polished capability-request viewer so the owner does not need to ask a chat to enumerate raw Supabase rows.

It should support:

- list/filter requests;
- inspect originating experiment/draft and capability domain;
- `Approve for development` / `Decline` for requested items;
- show approved/in-progress/implemented status;
- show linked GitHub issue/PR and implemented contract version;
- optionally return to/revalidate the originating experiment after implementation.

The Professor browser must **not** receive GitHub credentials. `Approve for development` only moves the Supabase request to `approved`.

### Development handoff

The intended future developer-chat command can be as simple as:

`implement the next approved capability request`

Then the ChatGPT development side:

1. reads approved Supabase requests through the developer-side Supabase connection;
2. creates/links the GitHub engineering issue when implementation actually begins;
3. sets request status to `in_progress` and records the issue link;
4. implements/tests/deploys through normal repository workflow;
5. marks the request `implemented` only after the capability is deployed and advertised by the active contract;
6. records issue/PR and capability/contract version back in Supabase;
7. Professor mode displays the updated status automatically.

This produces the desired paper-driven loop:

`paper/Grok → missing capability → Supabase request → Professor inbox → approve → ChatGPT/GitHub implementation → Supabase updated → draft revalidates/runs`.

Examples of requestable experiment capability classes for professor-authored papers include world/setup construction (gradients, sites, raster/image worlds, obstacles, resources, placement primitives), observations/sensors, actions/actuators, simulator-owned stochastic/local intrinsics, and future typed experiment extension points.

Related issues:

- #45 — professor/curator identity, sharing/curation/Showcase;
- #58 — capability registry + request lifecycle;
- #65 — first-class world/environment/setup model, including gradients;
- #46 — production registry integration;
- #55 — authoring/validation boundary.

## Round 2 / quantitative experiment infrastructure

Major open feature epic: #3 — multiple runs, parameter sweeps, metrics, statistics, plots, and replay.

Required eventual capabilities include:

- independent seeds/repetitions;
- parameter sweeps/matrices;
- parallel independent browser-worker runs;
- headless execution separate from visual mode;
- metrics independent of controllers and with independent sampling cadence;
- aggregation/statistics/uncertainty;
- plots;
- run list/select/replay;
- local raw/large-data storage and volume estimates;
- export/reload;
- provenance including experiment revision/hash, seed, controller/compiler/core versions, parameters, backend.

Cost invariant remains local compute/storage + static hosting, with no required paid backend.

A previously proposed first bounded slice is **Round 2A — deterministic multi-run/headless execution core**. Do not start it merely from this file; inspect current `PROJECT_CONTROL.md`, #3 and owner priorities first.

## Performance epic #56 — current conclusion

High-level findings now established:

1. controller/kernel optimization materially improved N≈91 owner-visible performance;
2. #29 fixed the scheduler/render-cadence architecture and was owner accepted at N=1,000;
3. #101 found no generic 10k/100k initialization ceiling;
4. #106 fixed misleading runtime-factor instrumentation;
5. #111 shows that, for the current N≈5,000 Active Elastic profiling workload, **worker computation dominates graphics/snapshot overhead**.

Do not continue arithmetic/controller micro-optimization merely because #56 is open. If more performance work is activated, first create a bounded evidence-driven attribution inside the worker at N≈5,000 (for example neighbour/observation/controller/physics software costs) before choosing an optimization. Do not revive rejected #83 automatically.

Permanent performance guardrails:

1. **Ordered Active Elastic** — ordered hexagonal setup, zero position noise; dense/structured local-neighbour workload.
2. **Disordered Simple Random Walk** — random initializer; disordered/dynamic opposite guardrail.

Rejected optimization to remember:

- #83 direct neighbour-cell enumeration / removal of per-query x/y temporary vectors regressed representative neighbour-query timings and is closed `not_planned`.

## Scientific guardrail

Implementation work may reason about software architecture, parser/compiler design, runtime interfaces, synchronization, security, performance, tests and deployment.

Do **not** independently perform scientific reasoning, derivations, equilibrium calculations, model analysis, parameter inference, scientific retuning, or choose scientific/numerical-model assumptions.

If a software decision requires a new scientific choice, stop and ask the owner that specific scientific question. Existing accepted scientific behavior/values may be preserved mechanically during refactoring.

## Core architecture constraints

- Agent input = local observation; output = action.
- Agent internal state remains private/stateful.
- RNG is simulator-owned.
- Actions are applied by environment/physics, never by agent code.
- Physics, control, visualization and metrics schedules are separable.
- Renderer cannot affect trajectory.
- Controllers are authored in the Python-like language but executed through compiled/prepared Rust/WASM runtime structures, not per-step Python interpretation.
- Neighbour perception must scale; brute-force neighbour oracle remains for equality tests.
- Current core starts homogeneous; heterogeneous agents remain future work.
- Environment/world is intended to become first-class through #65; renderer should visualize the same canonical world model used by sensors/physics rather than a separate decorative world.

## Other open backlog

- #57 — canonical deterministic RNG with domain-separated streams.
- #58 — extensible capability registry / professor request path.
- #65 — first-class world/environment/setup capability architecture.
- #102 — numerical integrator evaluation; requires owner scientific input before numerical-method choices.
- #6 — future explicit Lab→AI results/plots channel.
- #8 — future native/HPC backend, activated by measured browser limits rather than speculation.
- #52 — mock-sim visual twin, deprioritized.
- #45 — professor/sharing/submission/curation workflow, now relevant again because owner wants a professor identity before paper-driven experiment population.
- #14/#2 — older scientific validation issues; audit against current scientific guardrail before scheduling.

Accidental placeholder issues #112 and #113 were created during tooling, immediately closed `not_planned`, and contain no project work. Ignore them.

## Cost invariant

The project remains zero-euro incremental cost: GitHub/GitHub Pages, existing Supabase free tier, client-side browser compute, and already-owned AI subscriptions/accounts.

## Resume instructions for a context-free agent

1. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, then this file.
2. Inspect current `main` and only the issue/design documents relevant to the current gate before acting.
3. #74 and #76 are owner accepted and closed; do not reopen them merely because #115 extends collection management.
4. #115 is merged and deployed; automated tests/build/deploy/smoke are green; it remains open only for owner live acceptance.
5. #29 is completed/accepted; do not rebuild the old scheduler solution.
6. #100 is completed: pre/post at U=0.05 was bit-for-bit identical for 1,000 ticks.
7. #101 is completed: valid setup handles 10k/100k initialization; owner also confirmed production 100k with arena165 for both current placement modes.
8. #106 runtime-factor meter is accepted; do not use old pre-#106 extreme-load `Actual` readings as evidence.
9. #109 zoom/pan/glyph work is deployed and owner accepted on phone.
10. #111 is completed: renderer/snapshot transfer are not the primary N≈5k bottleneck on the measured CI workload; next performance lane would be worker computation, but no follow-up optimization is currently authorized merely by this statement.
11. Preserve the ordered Active Elastic and disordered Random Walk performance guardrails.
12. Do not revive #83 without genuinely new evidence.
13. Professor unsupported-capability policy is role-based and simple: professor missing capability → Supabase request; student missing capability → reject for now. Do not reintroduce a requestability classifier.
14. Read `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md` before implementing professor/request functionality.
15. #102 requires owner scientific involvement before integrator decisions.
16. #8 is future native/HPC architecture; current evidence does not establish state transfer/rendering as the immediate large-N bottleneck.
17. Test/deploy/close the loop before reporting implementation completion.
