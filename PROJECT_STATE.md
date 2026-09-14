# Virtual Lab — Current Project State

Updated: **14 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Detailed pre-#117 technical history is preserved at `docs/archive/PROJECT_STATE_pre_117_2026-09-14.md`.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Experiment MCP: **ACTIVE Edge Function version 13**
- MCP server version: **2.5.0**
- MCP health interface version: **7**
- Capability-request interface: **`vlab.capability-request/1`**

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
- #135 durable capability requests: `f14210124150eb220b40999007b515d296cde589`

## Owner-visible acceptance state

Accepted and closed include #74, #76, #29, #106 and #109.

Engineering-complete but awaiting a later consolidated owner live pass:

- **#115** — collection choice during Save as new and clean owned-experiment moves between collections/Unfiled;
- **#118** — artifact-driven Experiment workspace while retaining ordinary Configuration / Initialization / Controller behavior.

The owner explicitly prefers a self-directed combined test rather than many synthetic micro-tests. Normal Student functionality may be accepted while signed in as **Professor**, because Professor is intentionally a strict permission superset using the same shared code path. Student-only negative authorization boundaries should be verified automatically rather than by duplicating owner testing.

#133 and #135 are backend/contract checkpoints with live authorization probes and do not require immediate owner testing. A useful later combined pass can naturally cover ordinary create/load/edit/save/run, optional passive artifacts, unsupported executable-artifact intent, collection moves, and the Professor request/inbox workflow after the inbox checkpoint exists.

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

All ordinary Experiment, collection and AI-authoring capabilities use the **same implementation path** for both roles. Professor-only operations branch only at explicit authorization boundaries.

### Database / authorization

Migration `20260914150356_professor_role_superset` is live.

`public.profiles` has server-controlled:

- `role text not null default 'student'`;
- CHECK allowing only `student | professor`.

Authenticated users do not have table-wide UPDATE on `profiles`; they retain column UPDATE only on `display_name`. Live privilege verification:

- authenticated UPDATE on `role`: **false**;
- authenticated UPDATE on `display_name`: **true**.

Current live bootstrap has exactly one Professor account and one Student account. Account-identifying addresses are not committed to the repository.

### MCP

`read_workspace` selects `id, display_name, role` and returns role inside the authenticated identity object.

The same five ordinary tools remain registered once each for both roles:

- `read_workspace`
- `manage_collection`
- `create_experiment`
- `edit_experiment`
- `delete_experiment`

#133 initially deployed this role-aware MCP as Edge Function version 11. #135 later preserved the shared tool implementations and added one explicit Professor-only request tool.

### Verification evidence

Focused #133 tests verify server-controlled roles and the single shared tool path.

Corrected PR CI run `34860322972` passed. After merge, main workflow `34860428856` passed.

No simulator, artifact execution, scientific semantics, storage ownership, Experiment RLS or revision behavior was intentionally changed by #133.

## #135 / #58.2 — durable Professor capability requests — completed/deployed

Issue #135 was implemented in PR #138 and merged as `f14210124150eb220b40999007b515d296cde589`.

### Durable request model

Migration `20260914153000_capability_requests.sql` is live and creates `public.capability_requests` as the durable record for unsupported Professor experiment intent.

A row preserves:

- stable UUID and timestamps;
- requester ID and `requester_role` snapshot;
- optional originating Experiment ID and revision;
- preserved `draft_title`, `draft_description`, and ordered `draft_artifacts` when the requested intent is not currently runnable;
- `capability_domain`, `capability_name`, free-form context;
- optional requested artifact type and lifecycle hook (`setup | initialize | control | finalize`);
- lifecycle state `requested | approved | declined | in_progress | implemented`;
- reserved Professor/developer notes, GitHub issue/PR linkage, implemented contract/capability versions and completion timestamp.

The origin Experiment ID is intentionally provenance text/UUID rather than a cascading FK so a future working-Experiment deletion cannot erase what the request referred to.

Unsupported draft artifacts are preserved in the request row without being accepted as a valid/runnable Experiment. Normal Experiment validation remains unchanged.

### RLS and lifecycle boundary

`capability_requests` has RLS enabled.

Authenticated grants in this checkpoint are only `SELECT` and `INSERT`; there is no authenticated UPDATE or DELETE path yet.

Policies require:

- current profile role = Professor;
- requester ID = current authenticated user;
- requester-role snapshot = Professor;
- newly inserted status = `requested`;
- future privileged fields such as developer notes, GitHub links and implementation versions are null on initial insert;
- any supplied origin Experiment is visible through the existing Experiment RLS boundary.

This means:

- Professor can create/read their own initial requests;
- Student cannot create a request or see Professor requests;
- Approve/Decline and later lifecycle transitions are not possible yet and belong to #58.3+.

Live production RLS probes were executed inside explicit transactions and rolled back:

- Professor insert/read: **allowed**, one probe row visible;
- Student insert while attempting a Professor row: **denied** with RLS authorization failure;
- Student select: zero request rows visible;
- no probe rows remain.

A Supabase security-advisor run after DDL showed no new `capability_requests` finding. Existing unrelated advisories remained unchanged.

### MCP role-dependent request behavior

Current Experiment MCP is **ACTIVE Edge Function version 13**, server `2.5.0`, health interface `7`, capability-request interface `vlab.capability-request/1`.

The five ordinary tools remain the same single shared implementation for Student and Professor.

Professor additionally receives exactly one tool:

- `request_capability`

Student does not receive this tool.

`read_workspace` authoring metadata and unsupported-capability validation responses now advertise role-dependent behavior:

- Professor: `requestable=true`, action `request_capability`, preserve draft;
- Student: `requestable=false`, no action, reason `student-role`.

The request tool may preserve either a visible originating Experiment/revision or a draft title/description/artifact collection. When an origin is supplied it checks the visible current revision before capturing it. It does **not** validate the preserved unsupported draft as runnable, because the point of the request is that current capability is missing.

The MCP still has no GitHub, repository, shell, deployment, arbitrary SQL/filesystem, simulator-source or Supabase-admin capability. `simulator_access` remains false.

### Deployment / verification evidence

Focused #135 tests cover:

- durable request schema and lifecycle fields;
- Professor-only initial insert and no authenticated update/delete path;
- single shared implementation of all five ordinary tools;
- Professor-only request tool and Student no-action metadata;
- draft/origin preservation without weakening Experiment validation;
- MCP 2.5.0/interface 7 contract.

PR branch workflow `34862760429` passed Rust kernel tests, Python-like compiler tests, browser/WASM build and artifact coherence.

Production migration was first run transactionally and rolled back, then applied for real. Live Professor/Student RLS probes passed as described above.

PR #138 merged to main as `f14210124150eb220b40999007b515d296cde589`. Main workflow `34863015099` passed:

- build;
- Rust scientific-kernel probe;
- Python-like compiler probe;
- browser/WASM build;
- coherent browser artifact;
- GitHub Pages deploy;
- deployed-browser smoke: **kernel ready with populated editors**.

MCP deployment note: version 12 briefly became ACTIVE, but a packaging transcription mismatch was detected in an unchanged initializer-compiler error string before checkpoint completion. It was immediately superseded. Version **13** was redeployed from the exact repository dependency content and is the accepted current deployment. No simulator calculation or execution semantic changed in either package; the mismatch was an error message only.

No owner test is required for #135 before proceeding to a separately authorized next checkpoint.

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

Completed foundations:

- #133 / #58.1: server-controlled Professor role as strict Student superset;
- #135 / #58.2: durable RLS-protected capability requests and Professor-only request creation.

The next substantial checkpoint is **#58.3: Professor request inbox with Approve / Decline**.

It should expose request discovery/triage and controlled lifecycle transitions to Professor without yet giving the research AI GitHub/repository/deployment privileges or automatically implementing anything.

Per `docs/EXECUTION_GRANULARITY.md`, #58.3 is **not started** and requires explicit continuation after the #135 checkpoint.

Later checkpoints: developer/GitHub handoff; deployed-contract verification; request completion + draft revalidation.

## Performance lane

#111 remains diagnostic only: at N≈5,000 the measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas rendering or snapshot transfer. Performance work remains a parallel lane unless promoted by `PROJECT_CONTROL.md`.

## Scientific guardrail

While building the simulator, do not independently perform scientific derivations, equilibrium/model analysis, retuning, or other calculations about the simulated scientific system. Software architecture/implementation reasoning is allowed. If a simulator-design decision requires a scientific decision, stop and discuss it with the owner first.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, fixed scientific timing/integration semantics, and rendering as an observer unless the owner explicitly approves a scientific change.
