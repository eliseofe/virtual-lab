# Virtual Lab — Current Project State

Updated: **14 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Detailed pre-#117 history is preserved at `docs/archive/PROJECT_STATE_pre_117_2026-09-14.md`.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Experiment MCP: **ACTIVE Edge Function version 14**
- MCP server version: **2.5.0**
- MCP health interface version: **7**
- Capability-request interface: **`vlab.capability-request/1`**
- Current authoring contract: **`vlab.authoring/0.4`**
- Current Experiment interface version: **`6`**
- Current runtime contract: **`vlab.runtime/0.2`**
- Current artifact capability contract: **`vlab.artifact-capabilities/0.2`**
- Current Environment capability contract: **`vlab.environment-capabilities/0.1`**

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
- #141 trusted developer handoff: `5a0016f3949d0a8f40418b0e612c7576366c6612`
- #143 generic scalar Environment / local scalar observation: `7b4861e90dc00633f811cd5d882617b74301c765`
- #150 simulation-first workspace shell (final fix): `9f75ed7f9e2530e8c5681a30f3126b2f4b2a2bdd`
- #153 workspace continuity + unified Experiment switcher: `dfb70a3882176cd28a11fb3f891952eccc28d865`

## Owner-visible acceptance state

Accepted and closed include #74, #76, #29, #106 and #109.

Engineering-complete but awaiting a later consolidated owner live pass:

- **#115** — collection choice during Save as new and clean owned-experiment moves between collections/Unfiled;
- **#118** — artifact-driven Experiment workspace while retaining ordinary Configuration / Initialization / Controller behavior.

Professor is intentionally a strict permission superset using the same ordinary Experiment code path. Student-specific negative authorization boundaries are verified automatically.

The first real Professor/Grok capability-request loop on the Karagüzel et al. 2023 collective-gradient-perception paper is now accepted by the owner as a **successful end-to-end round**. Request creation, Professor note/approval, developer discussion/handoff, generic capability implementation/deployment, Grok continuation and live Experiment testing have all occurred. A renderer-only scalar-field contrast correction was also deployed and accepted; scientific values/sensing/controller semantics were unchanged.

Showcase promotion is a separate optional Professor/curator decision, not a success condition for paper-driven Experiment authoring. The working Experiment may be refined/promoted later or remain private.

The current owner-visible blocker remains the Lab UI/UX. Epic #147 is the active redesign frontier and #148 is the completed interaction audit. Two substantial redesign children are now deployed: #150 made the workspace simulation-first, and #153 added workspace continuity plus one unified Experiment switcher/finder. Production verification for #153 is workflow `34895522534` (build/deploy/deployed-browser smoke success); its initial deploy attempt hit an external GitHub OIDC-token timeout and succeeded on an unchanged retry. #115/#118 owner acceptance remains deferred behind the redesign. The next substantial UI child is editor/workspace organization; deeper collection-management cleanup and visual/responsive polish remain later children.

## Canonical Experiment artifact state — #117/#118

The canonical Experiment representation is an ordered typed `artifacts` JSONB collection on the existing Experiment row. Each artifact contains `id`, `type`, `label`, `format`, `order`, and `content`.

Current required core IDs remain exactly `configuration`, `initialization`, `controller`.

Legacy three-source columns remain synchronized compatibility mirrors; they are not a competing source of truth. Browser load/apply/capture/dirty/save behavior is artifact-driven while retaining the specialized three core editors. Supported extra text artifacts can render generically; unsupported formats fail explicitly.

## Artifact capability/lifecycle state — #124/#125/#143

Canonical lifecycle design: `docs/ARTIFACT_EXECUTION_LIFECYCLE.md`.

Artifacts are classified as required core, optional passive, or optional executable. Optional executable content runs only if its type is explicitly registered by the active versioned capability contract. Lifecycle vocabulary is:

`setup → initialize → control → finalize`

Current contract `vlab.artifact-capabilities/0.2` still registers **zero optional executable artifact types**. Arbitrary additional code/text never gains execution by inference. The newly supported static scalar Environment is deliberately a capability of the required Initialization artifact, not a fourth artifact.

#126 remains blocked until a concrete owner-approved first optional executable artifact capability exists. #127 remains future Study work.

## Professor capability-request loop — #58

### #133 / #58.1 — role foundation — completed/deployed

PR #134 merged as `064980a68de397b7c9d88f5321886d94b7d2338a`.

`public.profiles.role` is server-controlled with values `student | professor`, default Student. Authenticated users may update their display name but not their role. Professor is a strict permission superset of Student and ordinary Experiment/collection/authoring behavior remains one shared implementation.

### #135 / #58.2 — durable capability requests — completed/deployed

PR #138 merged as `f14210124150eb220b40999007b515d296cde589`.

Migration `20260914153000_capability_requests.sql` is live. `public.capability_requests` durably preserves stable request ID/timestamps, requester/provenance, optional origin Experiment/revision, unrunnable draft content, capability description, lifecycle state, and developer/deployment provenance fields.

MCP exposes the same ordinary Experiment tools to Student and Professor. Professor additionally receives `request_capability`; Student receives no request action. MCP has no GitHub/repository/shell/deployment/admin/simulator-source capability and `simulator_access` remains false.

### #139 / #58.3 — Professor request inbox + Approve/Decline — completed/deployed

Issue #139 was implemented in PR #140 and merged as `c4c9e435d430d6d4e316124f13e9777c73246a33`.

Migration `20260914155241_professor_capability_inbox.sql` is live.

Database/authorization:

- `reviewed_by` and `reviewed_at` record durable review provenance;
- private trigger stamps both values for `requested → approved|declined`;
- authenticated UPDATE grant is limited to `status` and `professor_notes`;
- Student cannot see the queue;
- Professor can see the curator queue and triage only pending requests;
- preserved draft/provenance/developer fields stay immutable through the browser path.

Approval means the Professor accepts the need for discussion/consideration. It does **not** by itself authorize engineering implementation. Actual coding begins after design discussion in the developer chat and explicit owner implementation approval.

Production rollback probes after the real migration verified Professor approval + reviewer/time stamping and Student zero-row visibility/update. No probe rows remain.

Lab UI:

- `web/src/professor-inbox.js` is loaded additively after ordinary registry UI;
- Professor sees pending count, request context/origin/draft summary, optional note, Approve and Decline;
- Student sees no Professor panel;
- browser uses normal authenticated Supabase session/RLS and no admin credential.

Accepted evidence:

- PR normal workflow `34865636241`: success;
- PR performance workflow `34865636253`: success;
- main workflow `34865922898`: build, Pages deploy and deployed-browser smoke success;
- downloaded deployed Pages artifact contained `professor-inbox.js` and the deployed loader reference.

### #141 / #58.4 — trusted developer handoff — completed/deployed

Issue #141 was implemented in PR #142 and merged as `5a0016f3949d0a8f40418b0e612c7576366c6612`.

Canonical developer procedure: `docs/DEVELOPER_CAPABILITY_HANDOFF.md`.

Lifecycle semantics:

- `approved` = Professor accepted the need but engineering has not claimed it;
- `in_progress` = after explicit owner implementation approval, exactly one GitHub engineering issue is linked by the trusted developer workflow;
- `implemented` = actual capability is deployed and live capability/provenance verification has succeeded.

Migration `20260914161504_developer_capability_handoff.sql` is live.

Trusted claim operation:

`private.claim_capability_request_for_development(request_id, issue_number, issue_url, developer_notes)`

Properties:

- `SECURITY INVOKER`;
- canonical URL must be `https://github.com/eliseofe/virtual-lab/issues/<number>`;
- only `approved → in_progress` is accepted;
- exact retry is idempotent;
- wrong lifecycle, duplicate issue linkage, or relink is rejected;
- EXECUTE is revoked from `public`, `anon`, `authenticated`, and `service_role` Data-API roles;
- not exposed by Experiment MCP or Professor browser.

Professor Lab includes `web/src/professor-development-links.js` as a read-only layer showing linked issue/PR metadata.

Accepted evidence includes corrected PR normal workflow `34868310837`, corrected performance workflow `34868310789`, production transactional authorization probes, security-advisor check, and main workflow `34868586388` with build/Pages/deployed-browser smoke green.

## First real paper-driven capability — #143 / PR #144 — completed/deployed

Originating Professor request:

- request ID: `d89cdc40-bbcc-426c-ac40-7dc3f3638599`;
- requested capability: `observations / local.environmental_scalar`;
- origin Experiment: `ac57dfca-d63f-4186-be46-4231a2d37a6e`, revision 1;
- engineering issue: #143;
- implementation PR: #144;
- merge SHA: `7b4861e90dc00633f811cd5d882617b74301c765`.

### Approved architecture

The simulator capability is generic and contains no Karagüzel-specific scalar field or scientific tuning.

- required Experiment artifacts remain exactly Configuration, Initialization, Controller;
- Initialization may additionally define optional `environmental_scalar(x, y, config)`;
- the definition is a constrained deterministic static scalar expression over `x`, `y`, finite numeric config parameters and approved pure scalar intrinsics;
- simulator/WASM owns the Environment evaluation;
- observation construction samples the Environment at the robot's actual position;
- controller sees only `obs.environmental_scalar` as a scalar;
- controller does not gain global position, field function, gradient, simulator/global Environment, RNG, filesystem or network access;
- arena visualization receives samples from the same Rust Environment evaluator used by robot sensing, preventing a second scientific implementation in the renderer;
- existing Experiments without a field remain supported.

### Contract/runtime versions

After #143:

- authoring: `vlab.authoring/0.4`;
- Experiment interface: `6`;
- runtime: `vlab.runtime/0.2`;
- artifact capabilities: `vlab.artifact-capabilities/0.2`;
- Environment capabilities: `vlab.environment-capabilities/0.1`;
- Environment IR: `vlab.environment-scalar-ir/0.1`;
- published capabilities: `environment.static_scalar_field` and `local.environmental_scalar` (`obs.environmental_scalar`).

### Verification/deployment

PR #144 normal CI passed after correcting only stale version/compatibility assertions. The independent performance guard's first attempt hit the known browser profile-harness module-resolution race; an identical rerun passed completely. No product change was made for that transient race.

Main GitHub Pages run `34876180995` completed successfully:

- build: success;
- Pages deployment: success;
- deployed-browser smoke: success.

Supabase `experiment-mcp` **v14 is ACTIVE**. It was deployed from the exact merged #144 bundle, including the new Environment compiler and matching browser/MCP compiler/runtime sources. v14 bundle hash: `8a6232defa369c97b60224eb59c59165532b05b747c981d5da4bfb5cf6b41f08`.

The deployed bundle explicitly advertises:

- `environment.static_scalar_field`;
- `local.environmental_scalar` / `obs.environmental_scalar`;
- `vlab.authoring/0.4`;
- `vlab.environment-capabilities/0.1`.

### Capability request terminal state

After live Pages and MCP verification, request `d89cdc40-bbcc-426c-ac40-7dc3f3638599` was transitioned by the trusted developer DB connection from `in_progress → implemented` and now durably records:

- GitHub Issue #143;
- GitHub PR #144;
- implemented contract `vlab.authoring/0.4`;
- implemented capability `vlab.environment-capabilities/0.1`;
- implementation timestamp.

There is not yet a reusable private completion RPC. This first real request used the trusted developer DB connection after explicit live verification. A generic deployed-capability completion/revalidation gate remains a separate future infrastructure checkpoint and should not be silently bundled into a later capability ticket.

### Preserved-draft post-deployment check

The stored request draft:

- contains exactly the three required core artifacts;
- exactly equals the current artifacts of the originating Experiment revision 1;
- origin is still revision 1;
- contains no `environmental_scalar` definition;
- contains no `obs.environmental_scalar` use.

This is correct. Grok preserved the already-valid flocking substrate before the missing simulator capability existed. The contract blocker has now been removed, but the paper-specific scalar distribution and desired-distance/speed modulation are still absent. **Those scientific details must come from Grok/the paper, not from simulator implementation reasoning.**

The immediate end-to-end test is therefore to return to Grok, have it re-read the live authoring contract, and continue the preserved experiment rather than starting a disconnected new workflow.

## Capability generalization/refactor gate

`docs/CAPABILITY_GENERALIZATION_GATE.md` is mandatory for paper-driven simulator capability work.

Before implementing each new capability, developer-side ChatGPT must explicitly decide whether the request fits an existing abstraction cleanly or creates a new special case. Stop before implementation and bring the owner a refactor proposal when material signs include:

- paper-specific simulator semantics;
- duplicate representations/evaluation paths for one concept;
- repeated conditional/special-case growth across layers;
- violation of ownership/information boundaries;
- repeated pressure on an abstraction previously treated as provisional.

Even if individual requests look clean, perform an architecture audit after every **three** implemented paper-driven capabilities, or when a **second substantial capability extends the same subsystem**, whichever happens first.

Scientific equivalence/generalization is not decided autonomously. If a refactor requires claiming that two scientific models/concepts are equivalent, stop and discuss that scientific decision with the owner.

#143 passed the first gate: one generic Environment evaluator, one local observation boundary, same evaluator for visualization, no paper-specific simulator branch.

## Success-only durable completion reporting

GitHub issue #145 is the central GitHub-only success-report stream for ChatGPT-managed work across `eliseofe/*` projects.

Rules:

- pure discussion: no report;
- running/failed/retrying/partial action plan: no report;
- verified terminal success: append one `[SUCCESS REPORT]` comment to #145;
- `.github/workflows/success-report-notifier.yml` reposts as `github-actions[bot]` and mentions `@eliseofe`, allowing GitHub's normal notification/email channel to carry the report without Gmail/mailbox access.

Workflow live test run `34877631853` passed and the bot repost was verified.

Issue #146 is the separate Work task for the account-level GitHub setting that disables Actions failure-email noise. The available GitHub connector cannot change that personal account notification preference.

## Performance lane

#111 remains diagnostic only: at N≈5,000 the measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas rendering or snapshot transfer. Performance work remains parallel unless promoted by `PROJECT_CONTROL.md`.

## Scientific guardrail

While building the simulator, do not independently perform scientific derivations, equilibrium/model analysis, retuning, or other calculations about the simulated scientific system. Software architecture/implementation reasoning is allowed. If a simulator-design decision requires a scientific decision, stop and discuss it with the owner first.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, scientific timing/integration semantics, and rendering as an observer unless the owner explicitly approves a scientific change.

## Current frontier

The first real Professor/Grok paper-driven capability has completed its developer/deployment leg and the request is `implemented`. The **next immediate action is owner/research-AI acceptance in Grok**: re-read the current authoring contract and continue the preserved Karagüzel et al. experiment using the actual paper-specific scalar field and modulation.

The reusable completion/revalidation gate remains future infrastructure. #115/#118 owner acceptance and the broader Lab UI/UX audit remain queued for later coherent passes.