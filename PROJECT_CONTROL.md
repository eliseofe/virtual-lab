# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective

The near-term product objective is the **Professor paper-to-experiment capability-request loop** documented in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → missing capability → Supabase capability request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request implemented → draft revalidates/runs`

The Experiment-artifact prerequisite is engineering-complete through #117/#118. The artifact lifecycle/capability model is documented under #124/#125. The first three Professor-loop checkpoints are now complete and deployed:

1. **#133 / #58.1** — server-controlled Professor role;
2. **#135 / #58.2** — durable capability requests + Professor-only request creation;
3. **#139 / #58.3** — Professor Lab inbox + Approve/Decline triage.

Owner live acceptance of #115/#118 may be batched later when the owner has time. It does **not** block independently verifiable backend/contract checkpoints.

## Owner acceptance that may be batched later

### #115 — collection assignment/moves

#115 is implemented, merged, deployed and automated-smoke green. It remains open only for owner live acceptance:

- `Save as new…` can place a copy in a chosen owned collection;
- a clean owned experiment can move between collections / back to Unfiled and the library grouping/location updates.

### #118 — artifact-driven Experiment workspace/UI

#118 is implemented/deployed and remains open only for owner live acceptance. Configuration / Initialization / Controller remain the familiar core editors; browser load/save/dirty behavior uses canonical ordered artifacts and supported passive extras can be rendered generically.

### Consolidated Professor/Lab acceptance when convenient

The owner prefers one useful self-directed pass rather than synthetic micro-tests. A later pass can naturally exercise:

1. ordinary Experiment create/load/edit/save/run while signed in as Professor;
2. optional passive artifact preservation/display;
3. unsupported executable intent → durable Professor capability request;
4. the Professor capability-request inbox and Approve/Decline;
5. #115 collection assignment/moves.

Do not duplicate ordinary acceptance in a Student session. Student-specific negative authorization boundaries belong in automated security tests.

## Professor capability-request loop — epic #58

### Role invariant

`professor` is a strict permission superset of `student`.

All ordinary Experiment/collection/authoring behavior remains one shared implementation. Professor-only functionality is added only at explicit authorization boundaries; do not fork Student and Professor implementations.

### #133 / #58.1 — Professor role — completed/deployed

PR #134 merged as `064980a68de397b7c9d88f5321886d94b7d2338a`.

Production has server-controlled `profiles.role` (`student | professor`, default Student). Users cannot self-promote. `read_workspace` exposes the authenticated role while the same ordinary Experiment tools remain shared by Student and Professor.

### #135 / #58.2 — durable capability requests — completed/deployed

PR #138 merged as `f14210124150eb220b40999007b515d296cde589`.

Production has first-class `public.capability_requests` rows preserving requester/provenance, originating Experiment/revision when available, an unrunnable draft when needed, capability description, lifecycle state, and future developer/deployment provenance.

Professor gets one explicit MCP action, `request_capability`; Student gets no request action. Unsupported drafts can be preserved without weakening normal Experiment validation. No GitHub/repository/shell/deployment/admin/simulator-source capability is exposed to research AI.

Current Experiment MCP remains **ACTIVE Edge Function version 13**, server 2.5.0 / health interface 7, capability-request interface `vlab.capability-request/1`.

### #139 / #58.3 — Professor inbox + Approve/Decline — completed/deployed

PR #140 merged as `c4c9e435d430d6d4e316124f13e9777c73246a33`.

Production now has a Professor-only Lab inbox for capability requests:

- Professor can list the durable queue and see preserved request/origin/draft context;
- a pending request can transition only `requested → approved` or `requested → declined` through this user path;
- Professor may attach an optional triage note;
- PostgreSQL stamps `reviewed_by` and `reviewed_at` server-side;
- Student sees zero queue rows and cannot update requests;
- authenticated browser UPDATE privileges are limited to `status` and `professor_notes`; provenance/draft/developer fields remain immutable through this path;
- approval records the decision only — it does **not** create GitHub work or start implementation.

Verification evidence:

- corrected PR workflow `34865636241`: success;
- performance-regression workflow `34865636253`: success;
- live production Professor triage probe: visible row, approved transition, reviewer match and review timestamp all verified, then rolled back;
- live Student probe: zero visible rows and zero updated rows, then rolled back;
- Supabase security advisor: no new #139 finding;
- main workflow `34865922898`: build, Pages deployment and deployed-browser smoke all success;
- deployed Pages artifact contains `professor-inbox.js`, and deployed `runtime-speed.js` loads it additively after the ordinary registry UI.

No MCP approval action was added. No simulator/scientific behavior changed.

### Next substantial checkpoint — #58.4, not started

The next independently deployable checkpoint is **developer handoff for an approved request**:

- take an approved request into the developer/ChatGPT workflow;
- create/link the implementation GitHub issue;
- move the request to `in_progress` through a developer-owned boundary;
- preserve the separation between research AI and repository/deployment privileges.

This checkpoint must **not** yet mark a request `implemented`; that remains gated on deployed capability-contract verification and origin/draft revalidation in a later checkpoint.

Per `docs/EXECUTION_GRANULARITY.md`, **do not start #58.4 automatically**. Start it only after explicit owner continuation from the completed #139 checkpoint.

Later #58 work remains:

1. verify the active deployed capability contract advertises the implemented capability;
2. mark the request `implemented` with durable deployment/contract provenance;
3. revalidate the originating Experiment/draft.

## Artifact lifecycle / optional executable architecture — epic #124

Canonical design: `docs/ARTIFACT_EXECUTION_LIFECYCLE.md`.

Artifacts are classified as:

1. required core — currently `configuration`, `initialization`, `controller`;
2. optional passive — persisted/displayed, never executed;
3. optional executable — executable only when explicitly registered by the active versioned capability contract.

Lifecycle vocabulary: `setup → initialize → control → finalize`.

Unknown/code-looking optional artifacts never gain execution by inference. #126 remains blocked until there is a concrete owner-approved first optional executable capability. #127 belongs to future Study implementation.

## Execution granularity — mandatory

Approval breadth is not execution breadth. Default to one substantial independently deployable/testable ticket at a time:

1. implement;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop and ask whether to continue unless the owner's current message explicitly requests the whole multi-ticket sequence without intermediate stops.

Small adjacent low-risk work may be batched. Full rule: `docs/EXECUTION_GRANULARITY.md`.

## Parallel / future epics

Performance (#56/#111 follow-up), native/HPC (#8), deterministic RNG (#57), world/environment architecture (#65), numerical-integrator evaluation (#102), Study/results work (#3/#6), Research Notes/Documents (#119), and AI synthesis (#120) remain parallel/future lanes unless explicitly promoted here.

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

**#58.1–#58.3 are complete and deployed: Professor role, durable capability-request creation, and Professor-only Approve/Decline inbox are live and security-verified. #115/#118 await later consolidated owner acceptance. The next substantial Professor-loop checkpoint is #58.4 (developer/GitHub handoff + `in_progress`) and must wait for explicit continuation.**
