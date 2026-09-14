# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective

The near-term product objective is the **Professor paper-to-experiment capability-request loop** documented in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → missing capability → durable request → Professor approve/decline → developer handoff → capability implementation/deploy → deployed-contract verification → request implemented → draft revalidates/runs`

The Experiment-artifact prerequisite is engineering-complete through #117/#118. The artifact lifecycle/capability model is documented under #124/#125.

Four Professor-loop infrastructure checkpoints are complete and deployed:

1. **#133 / #58.1** — server-controlled Professor role;
2. **#135 / #58.2** — durable capability requests + Professor-only request creation;
3. **#139 / #58.3** — Professor Lab inbox + Approve/Decline triage;
4. **#141 / #58.4** — trusted developer handoff from an approved request to one linked GitHub engineering issue + `in_progress`.

Owner live acceptance of #115/#118 and the newer Professor surfaces may be batched later when the owner has time. It does **not** block independently verifiable backend/contract checkpoints.

## Owner acceptance that may be batched later

### #115 — collection assignment/moves

#115 is implemented, merged, deployed and automated-smoke green. It remains open only for owner live acceptance:

- `Save as new…` can place a copy in a chosen owned collection;
- a clean owned experiment can move between collections / back to Unfiled and the library grouping/location updates.

### #118 — artifact-driven Experiment workspace/UI

#118 is implemented/deployed and remains open only for owner live acceptance. Configuration / Initialization / Controller remain the familiar core editors; browser load/save/dirty behavior uses canonical ordered artifacts and supported passive extras can be rendered generically.

### Consolidated Professor/Lab acceptance when convenient

The owner prefers one useful self-directed pass rather than synthetic micro-tests. A later pass can naturally exercise ordinary Experiment work, passive extra artifacts, unsupported executable intent → request creation, Professor triage, developer-link visibility after a real request enters engineering, and #115 collection moves.

Do not duplicate ordinary acceptance in a Student session. Student-specific negative authorization boundaries belong in automated security tests.

## Professor capability-request loop — epic #58

### Role invariant

`professor` is a strict permission superset of `student`.

All ordinary Experiment/collection/authoring behavior remains one shared implementation. Professor-only functionality is added only at explicit authorization boundaries; do not fork Student and Professor implementations.

Research AI must never receive GitHub/repository/shell/deployment/admin/simulator-source privileges. Development is a separate trusted ChatGPT/GitHub/Supabase workflow.

### #133 / #58.1 — Professor role — completed/deployed

PR #134 merged as `064980a68de397b7c9d88f5321886d94b7d2338a`.

Production has server-controlled `profiles.role` (`student | professor`, default Student). Users cannot self-promote. `read_workspace` exposes the authenticated role while ordinary Experiment tools remain shared by Student and Professor.

### #135 / #58.2 — durable capability requests — completed/deployed

PR #138 merged as `f14210124150eb220b40999007b515d296cde589`.

Production has first-class `public.capability_requests` rows preserving requester/provenance, originating Experiment/revision when available, an unrunnable draft when needed, capability description, lifecycle state, and developer/deployment provenance.

Professor gets `request_capability`; Student gets no request action. Unsupported drafts can be preserved without weakening normal Experiment validation. Current Experiment MCP remains **ACTIVE Edge Function version 13**, server 2.5.0 / health interface 7, capability-request interface `vlab.capability-request/1`.

### #139 / #58.3 — Professor inbox + Approve/Decline — completed/deployed

PR #140 merged as `c4c9e435d430d6d4e316124f13e9777c73246a33`.

Professor can review the durable queue and transition only `requested → approved|declined`, with optional note. PostgreSQL stamps reviewer/time. Student sees no queue rows and cannot triage. Approval records intent only; it does not start engineering.

Accepted evidence includes corrected PR workflow `34865636241`, performance workflow `34865636253`, production authorization probes, main workflow `34865922898`, and inspection of the deployed Pages artifact containing `professor-inbox.js`.

### #141 / #58.4 — trusted developer handoff — completed/deployed

PR #142 merged as `5a0016f3949d0a8f40418b0e612c7576366c6612`.

Canonical handoff contract: `docs/DEVELOPER_CAPABILITY_HANDOFF.md`.

Meaning of the lifecycle is now explicit:

- `approved` = Professor approved the need, but engineering has not claimed it;
- `in_progress` = the trusted developer workflow has linked exactly one GitHub engineering issue and claimed the request;
- `implemented` remains forbidden until later deployed-capability verification succeeds.

Production now provides the trusted database claim operation `private.claim_capability_request_for_development(...)`:

- accepts only `approved → in_progress`;
- stores canonical GitHub issue number/URL and development start time;
- exact retry of the same request+issue is idempotent;
- different relink, wrong lifecycle, or duplicate issue linkage is rejected;
- execute is revoked from `public`, `anon`, `authenticated`, and `service_role` Data-API roles;
- it is not exposed through Experiment MCP or the Professor browser.

Developer workflow can now recover an approved request from Supabase, search GitHub for its exact request UUID, create/reuse one safe public engineering issue, and claim it without the owner copying request details into chat. Because the repository is public, full draft artifacts, private request context, Professor notes and unpublished paper text remain in Supabase rather than being mirrored into GitHub.

Professor Lab gains a read-only **Development** section showing linked issue/PR metadata when present. The browser cannot perform developer handoff.

Verification evidence:

- corrected PR normal workflow `34868310837`: success;
- corrected PR performance workflow `34868310789`: success;
- pre- and post-migration transactional probes verified claim, exact retry, requested-state rejection, duplicate-issue rejection, relink rejection and privilege denial;
- Supabase security advisor showed no new #141 finding;
- main workflow `34868586388`: build, Pages deployment and deployed-browser smoke all success;
- downloaded deployed Pages artifact contains `professor-development-links.js`, and deployed `runtime-speed.js` imports it.

No simulator/scientific behavior changed.

## Next substantial checkpoint — completion gate after a capability is actually implemented

### Full picture

#141 only gets an approved request **into engineering**. The linked GitHub issue is then where the missing capability itself is implemented and deployed. A request must not become `implemented` merely because code was written or a PR was merged.

The remaining lifecycle closure is:

`in_progress request → capability code implemented/tested → deployed runtime/authoring contract advertises that capability → request marked implemented with durable provenance → originating Experiment/draft revalidated`

### What the next infrastructure checkpoint should do

Build the **deployed-capability completion/revalidation gate**:

1. provide a trusted developer operation for completing an `in_progress` request only after the active deployed capability contract can prove the requested capability is available;
2. durably record implementation provenance (GitHub PR when applicable, implemented contract/capability version, completion time);
3. transition `in_progress → implemented` only after that verification;
4. revalidate the preserved originating Experiment/draft against the now-active contract and surface whether it is runnable or what remains unsupported.

It must **not** invent or implement a scientific capability by itself. The concrete capability implementation happens in the linked engineering issue and remains subject to the scientific guardrail.

Per `docs/EXECUTION_GRANULARITY.md`, do **not** start this next substantial checkpoint automatically. Start only after explicit owner continuation from #141.

## Artifact lifecycle / optional executable architecture — epic #124

Canonical design: `docs/ARTIFACT_EXECUTION_LIFECYCLE.md`.

Artifacts are required core, optional passive, or optional executable. Optional executable content runs only if its type is explicitly registered by the active versioned capability contract. Lifecycle vocabulary: `setup → initialize → control → finalize`.

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

**#58.1–#58.4 are complete and deployed: Professor role, durable request creation, Professor triage, and trusted developer/GitHub handoff are live and security-verified. The next substantial infrastructure checkpoint is the deployed-capability completion + draft-revalidation gate; it must wait for explicit continuation. #115/#118 remain queued for a later consolidated owner acceptance pass.**
