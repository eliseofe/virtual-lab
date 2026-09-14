# Virtual Lab — Current Project State

Updated: **14 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Detailed pre-#117 history is preserved at `docs/archive/PROJECT_STATE_pre_117_2026-09-14.md`.

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
- #139 Professor inbox/triage: `c4c9e435d430d6d4e316124f13e9777c73246a33`

## Owner-visible acceptance state

Accepted and closed include #74, #76, #29, #106 and #109.

Engineering-complete but awaiting a later consolidated owner live pass:

- **#115** — collection choice during Save as new and clean owned-experiment moves between collections/Unfiled;
- **#118** — artifact-driven Experiment workspace while retaining ordinary Configuration / Initialization / Controller behavior.

The owner prefers a self-directed combined test rather than many micro-tests. Professor is intentionally a strict permission superset using the same ordinary Experiment code path. Student-specific negative authorization boundaries are verified automatically.

#133/#135/#139 are independently verified role/request/inbox checkpoints and do not require immediate owner testing. A later combined pass can cover ordinary Experiment behavior, optional passive artifacts, unsupported executable intent, request creation, inbox triage, and collection moves.

## Canonical Experiment artifact state — #117/#118

The canonical Experiment representation is an ordered typed `artifacts` JSONB collection on the existing Experiment row. Each artifact contains:

- `id`
- `type`
- `label`
- `format`
- `order`
- `content`

Current required core IDs remain exactly `configuration`, `initialization`, `controller`.

Legacy three-source columns remain synchronized compatibility mirrors; they are not a competing source of truth. Browser load/apply/capture/dirty/save behavior is artifact-driven while retaining the specialized three core editors. Supported extra text artifacts can render generically; unsupported formats fail explicitly.

Neither #117 nor #118 changed Rust/WASM physics, RNG ordering, controller algebra, initializer semantics, integrator, scheduler, renderer, or scientific parameters.

## Artifact capability/lifecycle state — #124/#125

Canonical design: `docs/ARTIFACT_EXECUTION_LIFECYCLE.md`.

Artifacts are classified as required core, optional passive, or optional executable. Optional executable content runs only if its type is explicitly registered by the active versioned capability contract. Lifecycle vocabulary is:

`setup → initialize → control → finalize`

Current contract `vlab.artifact-capabilities/0.1` registers **zero optional executable artifact types**. Arbitrary additional code/text never gains execution by inference. Unsupported executable intent becomes `unsupported-capability`.

#126 remains blocked until a concrete owner-approved first optional executable capability exists. #127 remains future Study work.

## Professor capability-request loop — #58

### #133 / #58.1 — role foundation — completed/deployed

PR #134 merged as `064980a68de397b7c9d88f5321886d94b7d2338a`.

`public.profiles.role` is server-controlled with values `student | professor`, default Student. Authenticated users may update their display name but not their role, so self-promotion is prevented.

Product invariant: **Professor is a strict permission superset of Student**. Ordinary Experiment, collection, and authoring behavior remains one shared implementation.

The live project has one Professor account and one Student account; account-identifying data is not committed.

### #135 / #58.2 — durable capability requests — completed/deployed

PR #138 merged as `f14210124150eb220b40999007b515d296cde589`.

Migration `20260914153000_capability_requests.sql` is live. `public.capability_requests` durably preserves:

- stable request ID/timestamps;
- requester and role snapshot;
- optional originating Experiment ID/revision;
- unrunnable draft title/description/artifacts when needed;
- capability domain/name/context;
- optional artifact type/lifecycle hook;
- lifecycle state `requested | approved | declined | in_progress | implemented`;
- reserved Professor/developer notes, GitHub issue/PR linkage, implementation contract/capability versions and completion timestamp.

Unsupported drafts are preserved in request records without weakening normal runnable-Experiment validation.

MCP v13 exposes the same five ordinary tools to Student and Professor. Professor receives one additional `request_capability` tool. Student receives no request action. The MCP still has no GitHub, repository, shell, deployment, arbitrary SQL/filesystem, simulator-source or Supabase-admin capability; `simulator_access` remains false.

Key #135 evidence:

- branch workflow `34862760429`: success;
- production Professor/Student RLS probes: passed and rolled back;
- main workflow `34863015099`: build, Pages deployment and deployed-browser smoke success;
- MCP Edge Function v13 ACTIVE from exact repository bundle.

### #139 / #58.3 — Professor request inbox + Approve/Decline — completed/deployed

Issue #139 was implemented in PR #140 and merged as `c4c9e435d430d6d4e316124f13e9777c73246a33`.

Migration `20260914155241_professor_capability_inbox.sql` is live.

#### Database / authorization

`capability_requests` now also has:

- `reviewed_by uuid`;
- `reviewed_at timestamptz`.

A private trigger stamps both values server-side when a pending request transitions from `requested` to `approved` or `declined`.

Authenticated browser privileges are deliberately narrow:

- SELECT is available only through RLS;
- UPDATE grant is limited to columns `status` and `professor_notes`;
- Student cannot see capability-request rows;
- Professor can see the curator queue;
- Professor can update only rows currently `requested` and the resulting status must be `approved` or `declined`;
- provenance, requester, preserved draft, developer/GitHub and implementation fields cannot be changed through this user path.

Production probes after the real migration were executed inside rollback transactions:

- Professor: one probe row visible, `requested → approved` succeeded, `reviewed_by` matched authenticated Professor, `reviewed_at` was set;
- Student: **0 visible rows, 0 updated rows**;
- no probe rows remain.

Supabase security advisor after DDL reported no new #139/capability-request issue. Two unrelated pre-existing notices remain: `preserved_experiment_snapshots` has RLS but no policy, and Auth leaked-password protection is disabled.

#### Lab UI

Production includes `web/src/professor-inbox.js` as a separate additive module loaded after the ordinary registry UI.

When the signed-in profile is Professor, the Lab exposes a Professor panel with a capability-request inbox. It supports:

- pending-count indicator;
- refresh;
- capability name/domain/context;
- origin Experiment/revision when present;
- preserved draft/artifact summary;
- requested artifact type/lifecycle hook;
- optional Professor note;
- **Approve** and **Decline** for pending requests;
- display of reviewed state/time/note afterward.

Student does not see the panel. Triage uses the normal authenticated browser Supabase session and RLS; it does not use a service-role/admin credential.

Approval only records the Professor decision. There is no MCP approval tool, no GitHub issue creation, no developer handoff and no automatic implementation in #139.

#### Verification evidence

The first PR run exposed one stale #66 test that required the literal old `import(...).catch` bootstrap shape. All new #139 tests passed. The old assertion was corrected to test the actual additive-failure invariant instead of exact syntax.

Accepted PR evidence:

- normal PR workflow `34865636241`: success;
- performance-regression workflow `34865636253`: success;
- main workflow `34865922898`: build success, GitHub Pages deploy success, deployed-browser smoke success (`kernel ready with populated editors`);
- downloaded deployed Pages artifact digest `sha256:b04ec93bcce3796171fbca8ee41946f6262cbbd359047619a0b680f795c1c60c` contains `assets-*/professor-inbox.js`;
- deployed `runtime-speed.js` artifact references `import("./professor-inbox.js")`, proving the new module is in the deployed static package.

No Rust/WASM simulator, scientific model, RNG, controller algebra, initializer semantics, timing, integrator or rendering behavior changed in #139.

## Private Experiment production path

Production remains a real client of the canonical Supabase Experiment registry while scientific execution stays local in browser/WASM.

Existing behavior includes owned private experiment discovery, local compile/run, optimistic revision saves, Save as new, Built-in vs My experiments navigation, collections/Unfiled, dirty-switch protection, and anonymous/built-in read-only behavior.

#115 adds collection choice and clean Experiment moves; engineering is complete and owner acceptance remains pending.

## Current Professor-loop frontier

Completed:

1. #133 / #58.1 — server-controlled Professor role;
2. #135 / #58.2 — durable capability requests + Professor-only creation;
3. #139 / #58.3 — Professor Lab inbox + Approve/Decline.

Next substantial checkpoint is **#58.4: developer handoff for an approved request**. It should create/link the implementation GitHub issue and transition the request to `in_progress` through a developer-owned boundary while keeping research AI isolated from repository/deployment privileges.

#58.4 is **not started** and requires explicit owner continuation under `docs/EXECUTION_GRANULARITY.md`.

A later checkpoint must verify the active deployed capability contract before setting `implemented`, then revalidate the originating Experiment/draft.

## Performance lane

#111 remains diagnostic only: at N≈5,000 the measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas rendering or snapshot transfer. Performance work remains a parallel lane unless promoted by `PROJECT_CONTROL.md`.

## Scientific guardrail

While building the simulator, do not independently perform scientific derivations, equilibrium/model analysis, retuning, or other calculations about the simulated scientific system. Software architecture/implementation reasoning is allowed. If a simulator-design decision requires a scientific decision, stop and discuss it with the owner first.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, scientific timing/integration semantics, and rendering as an observer unless the owner explicitly approves a scientific change.
