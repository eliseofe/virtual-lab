# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective

The near-term product objective remains the **Professor paper-to-experiment capability-request loop** documented in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → missing capability → Supabase capability request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request implemented → draft revalidates/runs`

The Experiment-artifact architectural prerequisite is engineering-complete through #117 and #118. The lifecycle/capability contract needed to reason safely about optional artifacts is now also documented under epic #124, with #125 completed/deployed.

Do not infer the next implementation task from recency. Owner live acceptance of the current production flow may be batched later when the owner has time.

## Current owner acceptance gate

The owner prefers one consolidated, user-driven acceptance pass rather than micromanaged synthetic checks.

### #115 — collection assignment/moves

#115 is implemented, merged, deployed and automated-smoke green. It remains open only for owner live acceptance:

- `Save as new…` can place a copy in a chosen owned collection;
- a clean owned experiment can move between collections / back to Unfiled and the library grouping/location updates.

### #117 — generic artifact persistence/MCP — engineering complete

#117 is complete and closed:

- PR #122 merged as `6b31bd5626b5af31804ff7fbaa19ec01c719177f`;
- canonical ordered typed Experiment artifacts are persisted in Supabase;
- bounded legacy mirrors remain synchronized for compatibility;
- production migration preserved existing IDs, revisions, ownership, collections, RLS and scientific semantics;
- main workflow `34832435383` passed build, Pages deploy and deployed-browser smoke.

The MCP was initially deployed as Edge Function version 9 for #117 and was subsequently redeployed as version 10 by #125 to expose artifact capability/lifecycle metadata. Storage/runtime semantics were unchanged by #125.

### #118 — artifact-driven Experiment workspace/UI — engineering complete, owner acceptance pending

#118 is implemented and deployed as its own substantial checkpoint:

- PR #123 merged as `ec3993b07faf12be063863ee609e86e7fa31668b`;
- current Configuration / Initialization / Controller remain the same visible core editors and ordering;
- browser load/apply/capture/dirty/save paths now operate through the generic ordered artifact representation;
- supported future text artifacts can be rendered through a generic editor adapter rather than a new hard-coded editor branch;
- unsupported artifact formats fail explicitly instead of silently dropping content;
- #74/#76/#115 registry/library/save/conflict behavior remains on the same production path;
- no simulator/scientific semantics changed;
- PR normal workflow `34833362480` passed;
- PR performance-regression workflow `34833362464` passed;
- main production workflow `34833493231` passed build, Pages deploy and deployed-browser smoke (`kernel ready with populated editors`).

Issue #118 remains open only for owner live acceptance. No additional #118 engineering defect is currently known to be pending.

### Consolidated Grok/Lab acceptance when the owner has time

Do not prescribe a trivial fixed script. The useful acceptance is user-driven and should naturally exercise:

1. ordinary Experiment create/load/edit/save/run behavior with the three required core artifacts;
2. optional passive artifact expansion — Grok may add a fourth/fifth supported passive artifact and the Lab should preserve/display/edit it;
3. executable intent boundary — if Grok asks for an unregistered optional artifact to execute, the contract must report `unsupported-capability` rather than infer execution;
4. #115 collection assignment/move behavior.

Current production intentionally has **zero registered optional executable artifact types**. Therefore a user request for a runnable fourth artifact must not execute today.

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

PR #132 merged as `eaae0dc0a19ef1e5124ca0753f48c89cb3406147`. Experiment MCP is active as Supabase Edge Function **version 10**.

Production now exposes `vlab.artifact-capabilities/0.1` through `read_workspace(include_authoring_contract=true)` and advertises:

- required core artifact IDs;
- lifecycle vocabulary;
- current semantics of configuration / initialization / controller;
- optional passive representation;
- zero registered optional executable artifact types;
- unsupported executable intent as `unsupported-capability`.

No schema, simulator dispatch, Rust/WASM or scientific/runtime semantics changed.

### #126 — runtime dispatcher for registered optional executable artifacts — blocked

Do **not** implement #126 merely because the generic hook architecture exists. It requires a concrete owner-approved first optional executable artifact capability. When such a real use case is selected, implement the smallest typed/versioned capability and preserve current core semantics.

### #127 — Study fresh/reset/resume/checkpoint semantics — future Study child

Default Study run start is fresh reconstruction from the pinned Experiment revision. Resume/checkpoint is an explicit Study protocol/orchestration choice with provenance; it is not hidden Experiment initialization and there is no arbitrary reset script.

## Execution granularity — mandatory

Approval breadth is not execution breadth.

When the owner says `go ahead`, `proceed`, or equivalent across several tickets, treat that as permission for the sequence, not an obligation to batch all approved work.

Default to one substantial independently deployable/testable ticket at a time:

1. implement;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop and ask whether to continue to the next substantial ticket unless the owner's current message explicitly says to complete the entire sequence without intermediate stops.

Small/trivial adjacent tickets may be batched. If scope turns out larger than expected, split at the next safe boundary. Full rule: `docs/EXECUTION_GRANULARITY.md`.

## After owner acceptance

Resume the Professor capability-request loop, still one substantial independently closable checkpoint at a time. The intended sequence is:

1. authenticated `professor` / `curator` role support while preserving student behavior;
2. durable Supabase capability-request records and role-dependent missing-capability behavior;
3. Professor request inbox with Approve / Decline;
4. developer handoff: approved request → ChatGPT → linked GitHub implementation issue → test/deploy → mark implemented only when the active capability contract advertises it;
5. revalidate the originating experiment/draft.

Before implementing that sequence, inspect #58 and the current code/design state and decompose the next substantial checkpoint rather than treating the entire loop as one ticket.

The #124/#125 capability vocabulary is intended to support this flow: unsupported executable artifact intent can be represented as a missing capability rather than silently approximated.

Broader sharing/Showcase, Study execution, Research Notes/Documents, results-to-AI and paper synthesis remain related future epics/backlog rather than prerequisites for the first capability-request loop.

## Parallel / opportunistic work

Useful work may proceed while an owner-only acceptance step is unavailable, but that is opportunistic progress, not implicit roadmap reprioritization. Do not infer priority from the latest issue, commit or technical thread.

Performance (#56/#111 follow-up), native/HPC (#8), deterministic RNG (#57), world/environment architecture (#65), numerical-integrator evaluation (#102), Study/results work (#3/#6), and Research Notes/Documents/synthesis (#119/#120) remain parallel/future lanes unless explicitly promoted here.

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

**#117/#118 are engineering-complete and deployed; #125 is completed/deployed and MCP version 10 now advertises the artifact lifecycle/capability contract. #115/#118 await a later consolidated owner acceptance pass. #126 is intentionally blocked until a concrete optional executable artifact capability is owner-approved; #127 belongs to future Study implementation.**
