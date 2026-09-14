# Virtual Lab — Current Project State

Updated: **14 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. The detailed pre-#117 technical history is preserved verbatim at `docs/archive/PROJECT_STATE_pre_117_2026-09-14.md`; consult it when older performance/runtime evidence is relevant.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Important recent merge SHAs:

- #29 scheduler: `f713dad722c68683bfc5822366b2e8071395b307`
- #106 achieved RTF meter: `9de15df3b972f2a2e63c1bd5ebfd6b22467fa7a3`
- #109 camera/glyphs: `39ec2423874aef3b75ccc7cc03dc81d96917b733`
- #111 N≈5,000 attribution diagnostic: `69f8d293fc500de7e0cd3647a24decf1f4a49f8b`
- #115 collection assignment/moves: `5048793c75602faba3d99809693fca1e622642be`
- #117 generic Experiment artifact persistence/MCP contract: `6b31bd5626b5af31804ff7fbaa19ec01c719177f`
- #118 artifact-driven Experiment workspace/UI: `ec3993b07faf12be063863ee609e86e7fa31668b`

## Owner-visible acceptance state

Accepted and closed:

- #74 production private-experiment write-back/revision-conflict path;
- #76 private experiment browser/library path;
- #29 worker-owned scheduler;
- #106 achieved real-time-factor meter;
- #109 phone camera/visualization behavior.

Two current production items are engineering-complete but still await the owner's short live acceptance:

### #115 collection assignment/moves

1. `Save as new…` can place the copy in a chosen existing collection;
2. a clean owned experiment can be moved between collections / back to Unfiled and the library location/grouping refreshes.

### #118 artifact-driven Experiment workspace/UI

The visible experience should still look intentionally familiar: Configuration, Initialization and Controller remain the three normal core editor panels. The owner should confirm ordinary experiment load/edit/save/save-as-new/run/library behavior still works after the internal artifact refactor.

A tiny optional #117 real-client check can be done in the same acceptance pass: in a **fresh** Grok session ask it to read `Simple Random Walk` and list only the artifact IDs. Expected: `configuration`, `initialization`, `controller`.

Do not reopen accepted work without genuinely new evidence.

## #117 — generic Experiment artifact persistence / MCP contract — completed

Issue #117 was completed as an isolated substantial checkpoint in PR #122. The earlier combined #117/#118 PR #121 was closed unmerged after the owner clarified execution-granularity expectations.

### Canonical persistence

The existing `experiments` row remains the ownership, RLS, revision and optimistic-concurrency boundary. It now contains canonical ordered typed `artifacts` JSONB using:

- registry schema: `vlab.registry-experiment/2`;
- artifact interface: `vlab.experiment-artifacts/2`;
- artifact fields: `id`, `type`, `label`, `format`, `order`, `content`.

Current experiments still contain exactly the three existing scientific authoring artifacts:

1. `configuration`;
2. `initialization`;
3. `controller`.

No new scientific artifact or model was invented.

The old `config_source`, `initializer_source`, and `controller_source` columns remain temporarily as synchronized compatibility mirrors. They are not a second canonical representation. Legacy writes update the matching core artifact while preserving unknown/future artifacts; canonical artifact writes update the mirrors.

### Migration evidence

The migration was first exercised in a rollback probe with a synthetic fourth artifact. A migration-order defect involving the old v1 version check constraints was caught before production and fixed.

The production migration then completed with revision-bump suppression during mechanical backfill. Post-deploy verification confirms all existing rows retained their exact revisions:

- `Simple Random Walk tiny` — r1;
- `Simple Random Walk` — r4;
- `Active Elastic — authoring contract test` — r1;
- `Flocking mock experiment` — r8;
- `Bullshit experiments` — r2.

All five rows report schema/interface v2, currently have three core artifacts, and each legacy source mirror equals the corresponding canonical artifact content. Existing collection/RLS behavior was not changed.

### MCP v5

The Experiment MCP is deployed as Supabase Edge Function **version 9** with interface version **5**.

The five student-facing tool names remain:

- `read_workspace`;
- `manage_collection`;
- `create_experiment`;
- `edit_experiment`;
- `delete_experiment`.

Canonical create/edit scientific content is now `artifacts[]`. During the bounded migration window, old clients may still use the three legacy source arguments; supplying both forms is rejected.

The structural security boundary is unchanged: the Experiment MCP has no GitHub, repository, shell, deployment, simulator-source, arbitrary SQL/filesystem or Supabase-admin capability. AI still cannot run the simulator or automatically observe simulation results.

### Automated verification

Focused #117 tests prove:

- legacy three-source content maps mechanically to the ordered core artifacts;
- a synthetic fourth artifact is representable without a new schema column;
- legacy compatibility edits preserve that synthetic artifact;
- the MCP contract exposes generic artifacts while retaining bounded compatibility.

After merge, main workflow run `34832435383` passed:

- build;
- Rust scientific-kernel tests;
- Python-like compiler tests;
- browser/WASM build;
- GitHub Pages deployment;
- deployed browser smoke: kernel ready with populated editors.

No Rust/WASM simulator, controller execution, initializer semantics, RNG, integrator, scheduler, renderer or scientific parameters changed in #117.

## #118 — artifact-driven Experiment workspace/UI — engineering complete, owner acceptance pending

Issue #118 was completed as a separate substantial checkpoint in PR #123 and merged as `ec3993b07faf12be063863ee609e86e7fa31668b`. It was reopened after the merge only to track owner live acceptance.

### Browser artifact model

`web/src/experiment-artifacts.js` now treats experiment content as an ordered typed artifact collection with stable metadata:

- `id`;
- `type`;
- `label`;
- `format`;
- `order`;
- `content`.

The existing three core artifacts remain specialized onto the existing editor surfaces:

1. Configuration → `#experiment-config`;
2. Initialization → `#initializer-source`;
3. Controller → `#controller-source`.

This preserves the current product experience and compile/run path while removing the browser's assumption that all future Experiment-level artifacts must be new privileged top-level fields/editor branches.

### Generic future-artifact presentation

Additional supported text artifacts can be rendered dynamically in `#additional-experiment-artifacts` through the generic editor adapter. Current supported generic text formats include the text/Python-like family used by the artifact adapter.

If an artifact has no supported editor adapter, the browser throws an explicit error naming the artifact/format rather than silently dropping scientific content.

This is intentionally only an extensibility mechanism. #118 did **not** add a Study UI, protocol/sweep/metric/plot artifact, Research Note/Document, multi-run execution, or new simulator capability.

### Load/save/dirty/validation integration

The production registry UI and experiment-validation layer now read the canonical artifact collection and use generic artifact equality/capture/apply behavior for experiment dirty state and write payloads.

For the bounded migration window, browser write payloads still carry synchronized legacy core fields alongside canonical `artifacts[]` where needed by the existing production compatibility path. The database trigger from #117 keeps those mirrors synchronized; they are not an independent source of truth.

#74/#76/#115 behavior remains on the same registry UI path, including:

- owned experiment load/edit/save;
- save-as-new;
- optimistic revision-conflict protection;
- dirty-switch protection;
- private experiment browsing/collections;
- collection assignment and clean owned-experiment moves.

### Simulator boundary

#118 does not alter the simulator execution path. `main.js` still consumes the same three core editor semantics for Configuration, Initialization and Controller; it has no dependency on the dynamically rendered additional-artifact container.

No Rust/WASM simulator, RNG ordering, controller algebra, initializer semantics, integrator, scheduler, renderer or scientific parameter changed.

### Automated verification

Focused #118 tests demonstrate:

- the three current core artifacts retain the same specialized editors and order;
- an additional artifact is carried through the generic artifact model without a new schema-specific source field;
- unsupported artifact presentation fails explicitly;
- the production page has a host for dynamic additional artifacts;
- registry load/save/dirty logic uses generic artifact capture/equality;
- the simulator kernel path remains tied only to the established three core editor semantics.

PR #123 verification:

- normal workflow `34833362480`: **success**;
- performance regression workflow `34833362464`: **success**.

After merge, production workflow `34833493231` passed:

- Rust scientific-kernel tests;
- Python-like compiler tests;
- browser/WASM build;
- static browser coherence verification;
- GitHub Pages deployment;
- deployed browser smoke: **kernel ready with populated editors**.

No additional #118 engineering defect is currently known. The remaining step is owner live acceptance of normal production behavior.

## Private-student production path

The production Virtual Lab remains a real client of the canonical Supabase experiment registry while scientific execution remains local in browser/WASM.

Accepted behavior through #74/#76:

- production authentication uses its own browser auth-storage namespace;
- signed-in users discover only their own runnable private experiments;
- owned experiments load into the real local compile/run path;
- source/artifact edits can save back to the same registry experiment as a new revision;
- stale writes use optimistic `id + owner_id + base revision` protection and refuse silent overwrite;
- `Save as new…` creates a distinct private experiment;
- browser/library navigation exposes Built-in vs My experiments, All / Unfiled / collections, search, ownership/editability and revision context;
- dirty-switch confirmation preserves unsaved work;
- built-in/read-only behavior and anonymous mode remain separate from private persistence.

#115 extends this path with collection choice during Save as new and collection moves; engineering is complete but owner acceptance remains pending.

## Current strategic product direction

After owner acceptance of the current #115/#118 production gate, resume the approved Professor paper-to-experiment capability-request loop in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → unsupported capability detected → durable Supabase request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request implemented → draft revalidates/runs`

Per `docs/EXECUTION_GRANULARITY.md`, do not implement that whole loop as one pass. Inspect #58/current code and create or select the next smallest substantial independently deployable/testable checkpoint.

Broader Study / Research Note / Research Document / results-to-AI work remains approved architecture/backlog, not the immediate monolithic implementation target.

## Performance lane — current decision

#111 was diagnostic only. Its evidence indicates that at N≈5,000 the measured bottleneck on CI is worker-side simulator/neighbour/observation/controller compute, not Canvas rendering or snapshot transfer. Do not automatically continue performance work from recency; it is a parallel backlog lane unless promoted by `PROJECT_CONTROL.md`.

The #118 performance regression workflow passed, but that is only a software-regression guard; it is not new scientific/performance optimization evidence and does not change the performance roadmap.

## Scientific guardrail

While building the simulator, do not independently perform scientific derivations, equilibrium/model analysis, retuning, or other calculations about the simulated scientific system. Software architecture/implementation reasoning is allowed. If a simulator-design decision requires a scientific decision, stop and discuss it with the owner first.

Preserve deterministic semantics: simulator-owned RNG, controller information boundary, environment-owned action application, fixed scientific timing/integration semantics, and rendering as an observer unless the owner explicitly approves a scientific change.
