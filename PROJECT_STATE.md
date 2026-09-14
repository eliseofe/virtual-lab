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

## Owner-visible acceptance state

Accepted and closed:

- #74 production private-experiment write-back/revision-conflict path;
- #76 private experiment browser/library path;
- #29 worker-owned scheduler;
- #106 achieved real-time-factor meter;
- #109 phone camera/visualization behavior.

#115 is implemented, merged, deployed and automated-smoke green. It remains awaiting only the owner's short live acceptance of collection assignment/movement:

1. `Save as new…` can place the copy in a chosen existing collection;
2. a clean owned experiment can be moved between collections / back to Unfiled and the library location refreshes.

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

A tiny real-client sanity check is appropriate before beginning #118: in a fresh Grok session, ask it to read `Simple Random Walk` and report the artifact IDs. Expected: `configuration`, `initialization`, `controller`. This check is read-only; no extra create/edit experiment is needed.

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

## #118 — artifact-driven Experiment workspace/UI — not started on production

#118 is approved and depends on #117, but it is deliberately a separate substantial execution checkpoint.

The combined implementation branch from the superseded PR #121 may be used only as implementation history/reference. No #118 browser/UI code from that PR was merged or deployed.

Do not begin #118 merely because it is already approved. Per `docs/EXECUTION_GRANULARITY.md`, wait for an explicit owner continuation after the #117 checkpoint.

When activated, #118 should make browser load/save/dirty/render behavior artifact-driven while preserving the current visible Configuration / Initialization / Controller experience and simulator semantics.

## Current strategic product direction

After the generic Experiment artifact prerequisite (#117/#118), resume the approved Professor paper-to-experiment capability-request loop in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → unsupported capability detected → durable Supabase request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request implemented → draft revalidates/runs`

Broader Study / Research Note / Research Document / results-to-AI work remains approved architecture/backlog, not the immediate monolithic implementation target.

## Performance lane — current decision

#111 was diagnostic only. Its evidence indicates that at N≈5,000 the measured bottleneck on CI is worker-side simulator/neighbour/observation/controller compute, not Canvas rendering or snapshot transfer. Do not automatically continue performance work from recency; it is a parallel backlog lane unless promoted by `PROJECT_CONTROL.md`.

## Scientific guardrail

While building the simulator, do not independently perform scientific derivations, equilibrium/model analysis, retuning, or other calculations about the simulated scientific system. Software architecture/implementation reasoning is allowed. If a simulator-design decision requires a scientific decision, stop and discuss it with the owner first.

Preserve deterministic semantics: simulator-owned RNG, controller information boundary, environment-owned action application, fixed scientific timing/integration semantics, and rendering as an observer unless the owner explicitly approves a scientific change.
