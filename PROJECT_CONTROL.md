# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective

The near-term product objective remains the **Professor paper-to-experiment capability-request loop** documented in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → missing capability → Supabase capability request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request implemented → draft revalidates/runs`

The Experiment-artifact prerequisite is engineering-complete through #117/#118. The lifecycle/capability model is documented under #124 and #125 is deployed. The first Professor-loop implementation checkpoint, #133 / #58.1, is now also complete and deployed.

Owner live acceptance of #115/#118 may be batched later when the owner has time. It does **not** block independently verifiable backend/contract checkpoints.

## Current owner acceptance gate

The owner prefers one consolidated, user-driven acceptance pass rather than micromanaged synthetic checks.

### #115 — collection assignment/moves

#115 is implemented, merged, deployed and automated-smoke green. It remains open only for owner live acceptance:

- `Save as new…` can place a copy in a chosen owned collection;
- a clean owned experiment can move between collections / back to Unfiled and the library grouping/location updates.

### #118 — artifact-driven Experiment workspace/UI

#118 is implemented/deployed and remains open only for owner live acceptance. Configuration / Initialization / Controller remain the familiar core editors; browser load/save/dirty behavior now uses canonical ordered artifacts and supported passive extras can be rendered generically.

### Consolidated Grok/Lab acceptance when the owner has time

Do not prescribe a trivial fixed script. A useful user-driven pass can naturally exercise:

1. normal Experiment create/load/edit/save/run behavior while signed in as the **Professor** account — this also exercises the shared Student code path because Professor is a strict permission superset;
2. optional passive artifact expansion and Lab preservation/display/editing;
3. executable intent boundary — an unregistered optional artifact must produce `unsupported-capability`, never inferred execution;
4. #115 collection assignment/moves;
5. later Professor-only request/inbox behavior once those checkpoints exist.

Do **not** duplicate ordinary owner acceptance in a Student session. Student-specific negative authorization boundaries belong in automated security/regression tests.

## Professor capability-request loop — epic #58

### Role invariant

`professor` is a strict permission superset of `student`.

All ordinary Experiment/collection/authoring behavior remains one shared implementation. Professor-only functionality must be added only at explicit authorization boundaries; do not fork Student and Professor implementations.

### #133 / #58.1 — server-controlled Professor role — completed/deployed

PR #134 merged as `064980a68de397b7c9d88f5321886d94b7d2338a`.

Production now has:

- server-controlled `profiles.role` with `student | professor`, default `student`;
- exactly one existing owner/test account bootstrapped as Professor and the other as Student, without committing account-identifying data;
- authenticated users unable to update their own role while retaining allowed `display_name` updates;
- `read_workspace` identity exposing the role;
- the same five existing MCP tools and implementation paths for both roles;
- Experiment MCP **ACTIVE version 11**, server 2.4.0 / health interface 6;
- main workflow `34860428856` successful after merge/Pages deployment.

No Professor-only action exists yet. No simulator/scientific behavior changed.

### Next substantial checkpoint — #58.2, not started

The next logical independently deployable checkpoint is durable **capability-request records plus Professor-only request creation / Student rejection** for unsupported capability intent.

It should preserve the originating intent/draft/provenance, use the server-controlled role boundary from #133, and add no GitHub/developer privileges to the research AI.

Per `docs/EXECUTION_GRANULARITY.md`, **do not start #58.2 automatically from recency or broad prior approval**. Start it only after the owner explicitly continues from the completed #133 checkpoint.

Later #58 checkpoints remain:

1. Professor request inbox with Approve / Decline;
2. approved request → developer/ChatGPT + linked GitHub implementation issue;
3. mark implemented only after the active capability contract advertises the deployed capability;
4. revalidate the originating experiment/draft.

## Artifact lifecycle / optional executable architecture — epic #124

Canonical design: `docs/ARTIFACT_EXECUTION_LIFECYCLE.md`.

Experiment artifacts are classified as:

1. **required core** — currently exactly `configuration`, `initialization`, `controller`;
2. **optional passive** — persisted/displayed, never executed;
3. **optional executable** — executable only if its type is explicitly registered by the active versioned capability contract with format/compiler, lifecycle hook, scope/cadence and validation.

Lifecycle vocabulary:

`setup → initialize → control → finalize`

Unknown/code-looking optional artifacts never gain execution by inference.

### #125 — capability metadata in AI authoring contract — completed/deployed

PR #132 merged as `eaae0dc0a19ef1e5124ca0753f48c89cb3406147`. #125 initially deployed the Experiment MCP as Edge Function version 10; #133 subsequently deployed version 11 while preserving this artifact capability contract.

Production advertises:

- required core artifact IDs;
- lifecycle vocabulary;
- current configuration / initialization / controller semantics;
- optional passive representation;
- zero registered optional executable artifact types;
- unsupported executable intent as `unsupported-capability`.

### #126 — runtime dispatcher for registered optional executable artifacts — blocked

Do **not** implement #126 merely because the hook architecture exists. It requires a concrete owner-approved first optional executable artifact capability.

### #127 — Study fresh/reset/resume/checkpoint semantics — future Study child

Default Study run start is fresh reconstruction from the pinned Experiment revision. Resume/checkpoint is explicit Study protocol/orchestration with provenance; it is not hidden Experiment initialization and there is no arbitrary reset script.

## Execution granularity — mandatory

Approval breadth is not execution breadth.

Default to one substantial independently deployable/testable ticket at a time:

1. implement;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop and ask whether to continue to the next substantial ticket unless the owner's current message explicitly says to complete the entire sequence without intermediate stops.

Small/trivial adjacent tickets may be batched. If scope turns out larger than expected, split at the next safe boundary. Full rule: `docs/EXECUTION_GRANULARITY.md`.

## Parallel / future epics

Performance (#56/#111 follow-up), native/HPC (#8), deterministic RNG (#57), world/environment architecture (#65), numerical-integrator evaluation (#102), Study/results work (#3/#6), Research Notes/Documents (#119), and AI synthesis (#120) remain parallel/future lanes unless explicitly promoted here.

#126 remains blocked pending a concrete optional executable capability. #127 belongs to future Study implementation.

## Source precedence

When sources disagree:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md` for priority/sequencing;
3. `PROJECT_STATE.md` for accepted technical state/evidence;
4. current design documents;
5. active issue scope;
6. older issues/chats as history only.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**#133 / #58.1 is complete and deployed: Professor is a server-controlled strict superset of Student, MCP v11 exposes the role, and shared Student behavior remains one code path. #115/#118 await later consolidated owner acceptance. The next substantial Professor-loop checkpoint is #58.2 (durable capability requests + role-dependent creation), but it must not start until explicit continuation from this checkpoint.**
