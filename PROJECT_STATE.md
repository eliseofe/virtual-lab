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
- #141 trusted developer handoff: `5a0016f3949d0a8f40418b0e612c7576366c6612`

## Owner-visible acceptance state

Accepted and closed include #74, #76, #29, #106 and #109.

Engineering-complete but awaiting a later consolidated owner live pass:

- **#115** — collection choice during Save as new and clean owned-experiment moves between collections/Unfiled;
- **#118** — artifact-driven Experiment workspace while retaining ordinary Configuration / Initialization / Controller behavior.

The owner prefers a self-directed combined test rather than many micro-tests. Professor is intentionally a strict permission superset using the same ordinary Experiment code path. Student-specific negative authorization boundaries are verified automatically.

#133/#135/#139/#141 are independently verified role/request/inbox/developer-handoff checkpoints and do not require immediate owner testing. A later combined pass can cover ordinary Experiment behavior, optional passive artifacts, unsupported executable intent, request creation/triage, linked development visibility, and collection moves.

## Canonical Experiment artifact state — #117/#118

The canonical Experiment representation is an ordered typed `artifacts` JSONB collection on the existing Experiment row. Each artifact contains `id`, `type`, `label`, `format`, `order`, and `content`.

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

`public.profiles.role` is server-controlled with values `student | professor`, default Student. Authenticated users may update their display name but not their role. Professor is a strict permission superset of Student and ordinary Experiment/collection/authoring behavior remains one shared implementation.

### #135 / #58.2 — durable capability requests — completed/deployed

PR #138 merged as `f14210124150eb220b40999007b515d296cde589`.

Migration `20260914153000_capability_requests.sql` is live. `public.capability_requests` durably preserves stable request ID/timestamps, requester/provenance, optional origin Experiment/revision, unrunnable draft content, capability description, lifecycle state, and developer/deployment provenance fields.

MCP v13 exposes the same ordinary Experiment tools to Student and Professor. Professor additionally receives `request_capability`; Student receives no request action. The MCP has no GitHub/repository/shell/deployment/admin/simulator-source capability and `simulator_access` remains false.

Key evidence: branch workflow `34862760429` success, production Professor/Student RLS probes passed, main workflow `34863015099` build/deploy/smoke success, MCP v13 ACTIVE.

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

No simulator/scientific behavior changed.

### #141 / #58.4 — trusted developer handoff — completed/deployed

Issue #141 was implemented in PR #142 and merged as `5a0016f3949d0a8f40418b0e612c7576366c6612`.

Canonical developer procedure: `docs/DEVELOPER_CAPABILITY_HANDOFF.md`.

#### Lifecycle semantics

`approved` no longer ambiguously means engineering has started:

- `approved` = Professor accepted the need, but no developer workflow has claimed it;
- `in_progress` = exactly one GitHub engineering issue is linked by the trusted developer workflow;
- `implemented` remains reserved for a later gate after deployed capability-contract verification.

#### Database / trusted developer boundary

Migration `20260914161504_developer_capability_handoff.sql` is live.

New durable fields:

- `github_issue_number bigint`;
- `development_started_at timestamptz`.

Existing `github_issue_url` is paired with the issue number. Partial unique indexes prevent one GitHub issue number/URL from being linked to multiple capability requests.

Trusted claim operation:

`private.claim_capability_request_for_development(request_id, issue_number, issue_url, developer_notes)`

Properties:

- `SECURITY INVOKER`;
- canonical URL must be `https://github.com/eliseofe/virtual-lab/issues/<number>`;
- only `approved → in_progress` is accepted;
- stores issue number/URL and `development_started_at`;
- exact retry of the same already-linked `in_progress` request is idempotent and does not overwrite the original developer note;
- wrong lifecycle, duplicate issue linkage, or relink to a different issue is rejected;
- EXECUTE is revoked from `public`, `anon`, `authenticated`, and `service_role` Data-API roles;
- authenticated users also have no UPDATE privilege on `github_issue_number`, `github_issue_url`, or `developer_notes`;
- the function is intended only for the trusted developer database connection used by developer-side ChatGPT.

This operation is not exposed by the Experiment MCP and is not callable from the Professor browser.

#### Context-free developer handoff

A future developer chat can receive a request such as:

`implement the next approved capability request`

and recover state without asking the owner to copy request details:

1. query approved requests from Supabase;
2. search GitHub for the exact capability-request UUID;
3. reuse an existing matching implementation issue after an interrupted handoff, or create one if absent;
4. call the trusted claim operation;
5. verify `in_progress` and linkage;
6. treat actual capability implementation as a new substantial engineering checkpoint.

Because the repository is public, GitHub receives a stable request UUID and safe engineering summary, not an automatic dump of full draft artifacts, free-form private context, Professor notes, requester identity, or unpublished paper text. Full research context remains available privately in Supabase to the developer workflow.

#### Professor visibility

Production includes `web/src/professor-development-links.js` as a read-only layer after the Professor inbox.

When a request has developer linkage, Professor can see:

- capability name;
- lifecycle status;
- linked `Issue #N`;
- linked PR when later populated.

The module reads through the normal Professor RLS path and contains no update/insert/delete/RPC action.

#### Verification evidence

Before production DDL, rollback probes verified:

- approved request can be claimed;
- exact retry is idempotent;
- requested-state claim is rejected;
- second request cannot reuse the same issue;
- an in-progress request cannot be relinked;
- authenticated/service-role Data API roles cannot execute the claim or write developer fields.

After the real migration, the same transactional probes passed again and synthetic rows were rolled back.

Accepted CI/deployment evidence:

- corrected PR normal workflow `34868310837`: success;
- corrected PR performance workflow `34868310789`: success;
- Supabase security advisor after DDL showed no new #141 finding; the same two unrelated pre-existing notices remain;
- main workflow `34868586388`: build success, GitHub Pages deploy success, deployed-browser smoke success (`kernel ready with populated editors`);
- downloaded deployed Pages artifact `10358231396` / digest `sha256:6a5ecc49b15959cc4ef803ee4a2eee9d62f632fb782e12acb71e6dccd98f1506` contains `assets-*/professor-development-links.js`;
- deployed `assets-*/runtime-speed.js` explicitly imports `./professor-development-links.js`.

One stale #66 loader-syntax assertion failed on the first PR run; all #141 tests already passed. The assertion was corrected to test additive failure isolation rather than requiring the prior literal import shape, after which both PR workflows passed.

No Experiment MCP, Rust/WASM simulator, scientific model, RNG, controller algebra, initializer semantics, timing, integrator or renderer semantics changed in #141.

## Private Experiment production path

Production remains a real client of the canonical Supabase Experiment registry while scientific execution stays local in browser/WASM.

Existing behavior includes owned private experiment discovery, local compile/run, optimistic revision saves, Save as new, Built-in vs My experiments navigation, collections/Unfiled, dirty-switch protection, and anonymous/built-in read-only behavior.

#115 adds collection choice and clean Experiment moves; engineering is complete and owner acceptance remains pending.

## Current Professor-loop frontier

Completed infrastructure:

1. #133 / #58.1 — server-controlled Professor role;
2. #135 / #58.2 — durable capability requests + Professor-only creation;
3. #139 / #58.3 — Professor Lab inbox + Approve/Decline;
4. #141 / #58.4 — trusted developer/GitHub handoff + `in_progress`.

The next substantial infrastructure checkpoint is the **deployed-capability completion and origin/draft revalidation gate**.

Important distinction: #141 does not implement a requested simulator capability. The concrete capability is implemented through its linked GitHub engineering issue as a separate substantive task. Only after that capability is deployed and advertised by the active versioned authoring/runtime capability contract may the completion gate move the request to `implemented` and revalidate the preserved origin/draft.

The next infrastructure checkpoint must therefore provide trusted completion semantics, durable deployed contract/capability provenance, `in_progress → implemented` only after live contract verification, and revalidation results for the preserved originating intent.

It is **not started** and requires explicit owner continuation under `docs/EXECUTION_GRANULARITY.md`.

## Performance lane

#111 remains diagnostic only: at N≈5,000 the measured bottleneck was worker-side simulator/neighbour/observation/controller compute rather than Canvas rendering or snapshot transfer. Performance work remains parallel unless promoted by `PROJECT_CONTROL.md`.

## Scientific guardrail

While building the simulator, do not independently perform scientific derivations, equilibrium/model analysis, retuning, or other calculations about the simulated scientific system. Software architecture/implementation reasoning is allowed. If a simulator-design decision requires a scientific decision, stop and discuss it with the owner first.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, scientific timing/integration semantics, and rendering as an observer unless the owner explicitly approves a scientific change.
