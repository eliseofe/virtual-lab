# Virtual Lab — Current Project State

Updated: **14 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Detailed pre-#117 technical history is preserved at `docs/archive/PROJECT_STATE_pre_117_2026-09-14.md`.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Experiment MCP: **ACTIVE Edge Function version 11**
- MCP server version: **2.4.0**
- MCP health interface version: **6**

Important recent merge SHAs:

- #29 scheduler: `f713dad722c68683bfc5822366b2e8071395b307`
- #106 achieved RTF meter: `9de15df3b972f2a2e63c1bd5ebfd6b22467fa7a3`
- #109 camera/glyphs: `39ec2423874aef3b75ccc7cc03dc81d96917b733`
- #111 N≈5,000 attribution diagnostic: `69f8d293fc500de7e0cd3647a24decf1f4a49f8b`
- #115 collection assignment/moves: `5048793c75602faba3d99809693fca1e622642be`
- #117 generic Experiment artifact persistence/MCP: `6b31bd5626b5af31804ff7fbaa19ec01c719177f`
- #118 artifact-driven Experiment workspace/UI: `ec3993b07faf12be063863ee609e86e7fa31668b`
- #125 artifact capability/lifecycle metadata: `eaae0dc0a19ef1e5124ca0753f48c89cb3406147`
- #133 Professor role foundation: `064980a68de397b7c9d88f5321886d94b7d2338a`

## Owner-visible acceptance state

Accepted and closed include #74, #76, #29, #106 and #109.

Engineering-complete but awaiting a later consolidated owner live pass:

- **#115** — collection choice during Save as new and clean owned-experiment moves between collections/Unfiled;
- **#118** — artifact-driven Experiment workspace while retaining ordinary Configuration / Initialization / Controller behavior.

The owner explicitly prefers a self-directed combined test rather than many synthetic micro-tests. Normal Student functionality may be accepted while signed in as **Professor**, because Professor is now intentionally a strict permission superset using the same shared code path. Student-only negative authorization boundaries should be verified automatically rather than by duplicating owner testing.

A useful later combined pass can naturally cover ordinary create/load/edit/save/run, optional passive artifacts, unsupported executable-artifact intent, collection moves, and later Professor-only request workflow once implemented.

## #117 / #118 — generic Experiment artifacts

The canonical Experiment representation is an ordered typed `artifacts` JSONB collection on the existing Experiment row. Artifact fields are:

- `id`
- `type`
- `label`
- `format`
- `order`
- `content`

Current required core IDs remain exactly:

1. `configuration`
2. `initialization`
3. `controller`

The old three source columns remain synchronized compatibility mirrors during migration; they are not a competing source of truth.

#118 makes browser load/apply/capture/dirty/save logic artifact-driven while preserving the specialized three core editors. Supported additional text artifacts can be rendered generically; unsupported formats fail explicitly rather than being silently lost.

The simulator execution path remains tied to established core semantics. Neither #117 nor #118 changed Rust/WASM physics, RNG ordering, controller algebra, initialization semantics, integrator, scheduler, renderer or scientific parameters.

Key verification:

- #117 main workflow `34832435383`: success including Pages/deployed browser smoke;
- #118 PR normal workflow `34833362480`: success;
- #118 PR performance workflow `34833362464`: success;
- #118 main workflow `34833493231`: success including deployed browser smoke.

## #124 / #125 — artifact capability registry and lifecycle contract

Canonical design: `docs/ARTIFACT_EXECUTION_LIFECYCLE.md`.

Artifacts are classified as:

1. required core;
2. optional passive;
3. optional executable only when explicitly registered by the active versioned capability contract.

Lifecycle vocabulary:

`setup → initialize → control → finalize`

#125 deployed `vlab.artifact-capabilities/0.1`. AI clients can discover:

- required core IDs and semantics;
- lifecycle hooks;
- optional passive representation;
- **zero registered optional executable artifact types today**;
- arbitrary extra code/text never executes by inference;
- unsupported executable intent maps to `unsupported-capability`.

#126 is intentionally blocked until a concrete owner-approved first optional executable artifact capability exists. #127 records future Study fresh/reset/resume/checkpoint semantics.

## #133 / #58.1 — Professor role foundation — completed/deployed

Issue #133 was implemented in PR #134 and merged as `064980a68de397b7c9d88f5321886d94b7d2338a`.

### Product invariant

`professor` is a strict permission superset of `student`.

All ordinary Experiment, collection and AI-authoring capabilities use the **same implementation path** for both roles. Future Professor-only operations must branch only at explicit authorization boundaries.

### Database / authorization

Migration `20260914150356_professor_role_superset` is live.

`public.profiles` now has server-controlled:

- `role text not null default 'student'`;
- CHECK allowing only `student | professor`.

Authenticated users no longer have table-wide UPDATE on `profiles`; they retain column UPDATE only on `display_name`. Live privilege verification:

- authenticated UPDATE on `role`: **false**;
- authenticated UPDATE on `display_name`: **true**.

Thus a normal authenticated user cannot self-promote through PostgREST even though the existing self-profile RLS policy still permits writes to their own row.

Current live bootstrap has exactly:

- 1 Professor account;
- 1 Student account.

The existing owner/test Gmail account is Professor and the other account remains Student. Account-identifying addresses are not committed to the repository.

### MCP

`read_workspace` now selects `id, display_name, role` and returns role inside the existing authenticated identity object.

The exact same five tools remain registered once each for both roles:

- `read_workspace`
- `manage_collection`
- `create_experiment`
- `edit_experiment`
- `delete_experiment`

There is no Professor-only MCP action yet and no duplicated Student/Professor implementation.

Experiment MCP was deployed as **Edge Function version 11**, status ACTIVE, with `verify_jwt=false` intentionally preserved because the function uses its existing custom Supabase OAuth/JWKS middleware.

### Verification evidence

Focused #133 tests verify server-controlled roles and the single shared tool path.

The first PR CI attempt failed only because an old #117 test hard-coded MCP interface version 5. The new #133 tests themselves passed. The stale assertion was generalized to accept the current numeric interface version; corrected PR CI run `34860322972` passed.

After merge, main production workflow `34860428856` passed, including the normal build/Pages path.

Live post-deploy checks confirm:

- MCP version 11 ACTIVE;
- one Professor and one Student profile;
- role self-update privilege false;
- display-name update privilege true.

No simulator, artifact execution, scientific semantics, storage ownership, Experiment RLS or revision behavior was intentionally changed by #133.

## Private experiment production path

Production remains a real client of the canonical Supabase Experiment registry while scientific execution stays local in browser/WASM.

Existing behavior includes:

- signed-in users discover only their own runnable private experiments;
- owned experiments load into the local compile/run path;
- edits save with optimistic revision protection;
- Save as new creates a distinct private Experiment;
- library navigation exposes Built-in vs My experiments, collections and Unfiled;
- dirty-switch protection preserves unsaved work;
- anonymous/built-in read-only behavior remains separate.

#115 extends this with collection choice and clean Experiment moves; engineering is complete, owner acceptance pending.

## Current Professor-loop frontier

The approved flow remains:

`paper + professor AI → experiment draft → unsupported capability → durable Supabase request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request implemented → draft revalidates/runs`

#133 provides the first required role/authorization foundation.

The next substantial checkpoint is **#58.2: durable capability-request persistence plus role-dependent creation behavior**:

- Professor may preserve unsupported capability intent/draft and create a request;
- Student receives the existing unsupported rejection and cannot create Professor requests;
- no GitHub/shell/deployment/simulator-development privileges are exposed to research AI.

Per `docs/EXECUTION_GRANULARITY.md`, #58.2 is **not started** and requires explicit continuation after the #133 checkpoint.

Later checkpoints: Professor inbox Approve/Decline; developer/GitHub handoff; deployed-contract verification; request completion + draft revalidation.

## Performance lane

#111 remains diagnostic only: at N≈5,000 the measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas rendering or snapshot transfer. Performance work remains a parallel lane unless promoted by `PROJECT_CONTROL.md`.

## Scientific guardrail

While building the simulator, do not independently perform scientific derivations, equilibrium/model analysis, retuning, or other calculations about the simulated scientific system. Software architecture/implementation reasoning is allowed. If a simulator-design decision requires a scientific decision, stop and discuss it with the owner first.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, fixed scientific timing/integration semantics, and rendering as an observer unless the owner explicitly approves a scientific change.
