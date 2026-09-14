# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective

The near-term product objective is the **Professor paper-to-experiment capability-request loop** documented in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → missing capability → durable request → Professor approve/decline → design discussion → developer handoff → capability implementation/deploy → deployed-contract verification → request implemented → research AI resumes preserved draft`

The Experiment-artifact prerequisite is engineering-complete through #117/#118. The artifact lifecycle/capability model is documented under #124/#125.

Four Professor-loop infrastructure checkpoints are complete and deployed:

1. **#133 / #58.1** — server-controlled Professor role;
2. **#135 / #58.2** — durable capability requests + Professor-only request creation;
3. **#139 / #58.3** — Professor Lab inbox + Approve/Decline triage;
4. **#141 / #58.4** — trusted developer handoff from an approved request to one linked GitHub engineering issue + `in_progress`.

The first real paper-driven capability request has now also completed its implementation/deployment leg:

- request `d89cdc40-bbcc-426c-ac40-7dc3f3638599`;
- engineering issue #143 / PR #144;
- merge `7b4861e90dc00633f811cd5d882617b74301c765`;
- generic `environment.static_scalar_field` defined inside Initialization;
- controller observation `local.environmental_scalar` / `obs.environmental_scalar`;
- GitHub Pages build/deploy/smoke run `34876180995` green;
- Experiment MCP **v14 ACTIVE**, authoring contract `vlab.authoring/0.4`, environment capability contract `vlab.environment-capabilities/0.1`;
- request status is now `implemented` with PR/contract/capability/time provenance.

The preserved draft was checked after deployment. It still exactly matches the validated originating Experiment revision 1 and intentionally contains neither the paper-specific scalar field nor `obs.environmental_scalar`. The capability blocker is gone; **the immediate next end-to-end step is for Grok to re-read the live authoring contract and resume/revise that preserved experiment using the actual scalar distribution and modulation from the paper.** Do not invent that science in simulator code.

Owner live acceptance of #115/#118 and the newer Professor surfaces may be batched later. It does not block this real paper-loop test.

## Owner acceptance that may be batched later

### #115 — collection assignment/moves

#115 is implemented, merged, deployed and automated-smoke green. It remains open only for owner live acceptance:

- `Save as new…` can place a copy in a chosen owned collection;
- a clean owned experiment can move between collections / back to Unfiled and the library grouping/location updates.

### #118 — artifact-driven Experiment workspace/UI

#118 is implemented/deployed and remains open only for owner live acceptance. Configuration / Initialization / Controller remain the familiar core editors; browser load/save/dirty behavior uses canonical ordered artifacts and supported passive extras can be rendered generically.

### Consolidated Professor/Lab acceptance when convenient

The owner prefers one useful self-directed pass rather than synthetic micro-tests. The first real Professor paper loop is now being tested directly. A later visual/UX audit is also intentionally parked until the functional workflow has settled; the owner prefers the assistant to identify obvious visual/usability improvements coherently rather than requiring point-by-point feedback.

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

Professor gets `request_capability`; Student gets no request action. Unsupported drafts can be preserved without weakening normal Experiment validation. The current Experiment MCP is **ACTIVE Edge Function version 14**; server 2.5.0 / health interface 7; capability-request interface `vlab.capability-request/1`.

### #139 / #58.3 — Professor inbox + Approve/Decline — completed/deployed

PR #140 merged as `c4c9e435d430d6d4e316124f13e9777c73246a33`.

Professor can review the durable queue and transition only `requested → approved|declined`, with optional note. PostgreSQL stamps reviewer/time. Student sees no queue rows and cannot triage. Approval records intent only; **approval does not authorize implementation by itself**. An approved request comes back to the developer chat for design discussion; actual engineering begins only after explicit owner implementation approval.

Accepted evidence includes corrected PR workflow `34865636241`, performance workflow `34865636253`, production authorization probes, main workflow `34865922898`, and inspection of the deployed Pages artifact containing `professor-inbox.js`.

### #141 / #58.4 — trusted developer handoff — completed/deployed

PR #142 merged as `5a0016f3949d0a8f40418b0e612c7576366c6612`.

Canonical handoff contract: `docs/DEVELOPER_CAPABILITY_HANDOFF.md`.

Meaning of the lifecycle is explicit:

- `approved` = Professor approved the need for discussion/consideration; engineering has not started;
- `in_progress` = after owner implementation approval, the trusted developer workflow has linked exactly one GitHub engineering issue and claimed the request;
- `implemented` = capability has actually been deployed and its active contract/provenance verified.

Production provides the trusted database claim operation `private.claim_capability_request_for_development(...)`:

- accepts only `approved → in_progress`;
- stores canonical GitHub issue number/URL and development start time;
- exact retry of the same request+issue is idempotent;
- different relink, wrong lifecycle, or duplicate issue linkage is rejected;
- execute is revoked from `public`, `anon`, `authenticated`, and `service_role` Data-API roles;
- it is not exposed through Experiment MCP or the Professor browser.

Developer workflow can recover an approved request from Supabase, search GitHub for its exact request UUID, create/reuse one safe public engineering issue, and claim it without the owner copying request details into chat. Because the repository is public, full draft artifacts, private request context, Professor notes and unpublished paper text remain in Supabase rather than being mirrored into GitHub.

Professor Lab gains a read-only **Development** section showing linked issue/PR metadata when present. The browser cannot perform developer handoff.

Verification evidence:

- corrected PR normal workflow `34868310837`: success;
- corrected PR performance workflow `34868310789`: success;
- pre- and post-migration transactional probes verified claim, exact retry, requested-state rejection, duplicate-issue rejection, relink rejection and privilege denial;
- Supabase security advisor showed no new #141 finding;
- main workflow `34868586388`: build, Pages deployment and deployed-browser smoke all success;
- downloaded deployed Pages artifact contains `professor-development-links.js`, and deployed `runtime-speed.js` imports it.

No simulator/scientific behavior changed.

## First real capability implementation — #143 — completed/deployed

The Professor/Grok test on *Collective gradient perception with a flying robot swarm* produced request `d89cdc40-bbcc-426c-ac40-7dc3f3638599` for `local.environmental_scalar`. The Professor approved it with a note, then the owner and developer chat explicitly discussed and approved the simulator design before implementation.

Issue #143 / PR #144 implement the capability generically rather than paper-specifically:

- required artifacts remain Configuration / Initialization / Controller;
- Initialization may optionally define `environmental_scalar(x, y, config)` as a constrained deterministic static field;
- the simulator owns/evaluates that Environment;
- controller receives only local `obs.environmental_scalar`, not position, field function, gradient, simulator or global Environment access;
- visualization samples the same simulator Environment evaluator used for sensing;
- experiments without a scalar field remain supported;
- no paper-specific field or controller modulation was hard-coded.

The implementation passed the mandatory capability generalization/refactor gate in `docs/CAPABILITY_GENERALIZATION_GATE.md`. The rule remains: proactively stop before implementation and propose refactoring when a new capability would create paper-specific semantics, duplicate representations/execution paths, accumulating special cases, ownership-boundary violations, or repeated pressure on a provisional abstraction. Run an architecture audit after every three implemented paper-driven capabilities, or when a second substantial capability extends the same subsystem, whichever comes first.

Deployment/contract evidence:

- PR #144 merge: `7b4861e90dc00633f811cd5d882617b74301c765`;
- main Pages run `34876180995`: build/deploy/deployed-browser smoke all success;
- Supabase `experiment-mcp` **v14 ACTIVE**, deployed from the exact merged source bundle;
- live deployed bundle contains authoring contract `vlab.authoring/0.4`, runtime `vlab.runtime/0.2`, `environment.static_scalar_field`, `local.environmental_scalar`, and `vlab.environment-capabilities/0.1`;
- capability request is `implemented` with Issue #143, PR #144, contract/capability versions and completion timestamp recorded.

Post-deployment preserved-draft check:

- stored draft artifacts equal originating Experiment `ac57dfca-d63f-4186-be46-4231a2d37a6e` revision 1 exactly;
- origin remains revision 1;
- the preserved draft has exactly the three core artifacts;
- it does not yet define `environmental_scalar` or read `obs.environmental_scalar`.

This is expected: the preserved draft is the valid flocking substrate Grok created before the capability existed. **Grok must now resume it using the paper's actual scalar distribution and scientific modulation.** The simulator/developer must not invent that paper-specific science.

## Reusable completion gate — still future infrastructure

The first real request was closed through the trusted developer database connection after explicit verification of the deployed Pages runtime and MCP v14 contract. There is still no reusable private completion RPC that automatically proves the live capability contract before `in_progress → implemented` and stores/reports revalidation results.

That reusable completion/revalidation gate remains a future standalone infrastructure checkpoint. Do not quietly combine it with another substantive capability ticket. The first real paper-loop test should continue through Grok before deciding whether this infrastructure needs adjustment.

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

If a seemingly small task unexpectedly becomes a **Krono/Gaia/Hercules** task, do not continue silently for a long execution window merely because the original estimate was small. Stop at the next safe durable boundary, report what expanded, and preserve state so chat/app interruption is recoverable.

Small adjacent low-risk work may be batched. Full rule: `docs/EXECUTION_GRANULARITY.md`.

## Success-only durable reporting

GitHub issue #145 is the central success-report stream for ChatGPT-managed `eliseofe/*` work. Pure discussion, failures, retries and partial work do not create completion reports. After a verified terminal success, append one `[SUCCESS REPORT]`; `github-actions[bot]` reposts it mentioning `@eliseofe` so GitHub's normal notification/email channel carries the durable completion report.

GitHub issue #146 is a separate Work task to disable account-level GitHub Actions failure-email notifications. Do not mix #146 into simulator development.

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

**The first real Professor/Grok capability loop has reached `implemented`: generic static scalar Environment + `obs.environmental_scalar` are deployed, MCP v14 advertises them, and the preserved flocking draft is intact. Immediate next step: return to Grok and have it re-read the live contract and complete the paper experiment using the paper's actual scalar field/modulation. The reusable completion gate remains future infrastructure; #115/#118 and the broader UI/UX audit remain queued for later acceptance.**