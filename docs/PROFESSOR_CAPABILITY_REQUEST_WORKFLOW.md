# Professor capability-request workflow

Status: **deployed baseline and standing development boundary, updated 16 September 2026**.

This document records the paper-to-Experiment extension loop when a research AI discovers that the current Virtual Lab cannot express a required simulator capability.

## Structural boundary

The authenticated Experiment MCP is an Experiment-domain interface. Research AI clients can create/read/edit supported Experiment content and, for Student or Professor users, preserve/submit missing-capability analyses and requests. They have no GitHub, repository, shell, deployment, simulator-source, arbitrary SQL, arbitrary filesystem or Supabase-admin capability.

That boundary is structural. Missing simulator functionality is not “allowed through prompt”; it is absent until implemented by the trusted developer workflow.

## Roles

Current registry roles include:

- `student`
- `professor`

Student and Professor share ordinary Experiment-domain behavior and capability-request submission. Professor additionally owns the queue-wide inbox/triage surface. Professor role never implies simulator-development authority.

## Unsupported Experiment capabilities

Validation answers whether requested Experiment semantics fit the active versioned Virtual Lab capability contract. It must not decide whether a missing scientific feature is desirable or fabricate a substitute.

Current policy:

```text
capability exists
    -> author/validate normally

capability missing + student or professor
    -> preserve one whole blocked Experiment/analysis and submit durable grouped request(s)

scientific ambiguity remains
    -> preserve it explicitly; do not hand it to developer generalization

requested rows
    -> Professor inbox for approve/decline
```

## Durable blocked Experiment / closure foundation

Issue #310 adds the durable domain foundation used by the repaired closed loop:

- `blocked_experiment_drafts` preserves one resumable scientific draft/intent rather than relying on isolated request rows;
- `capability_closure_analyses` stores append-only analyses against a specific capability-contract version, including identified requirements and unresolved scientific ambiguity;
- individual capability requests may link to the closure analysis that identified them.

This schema foundation is secure-by-default. #311 adopts it in the authenticated research-AI MCP for both Student and Professor submission. #312 adds Professor-only `resume_capability_closure` and `revalidate_capability_closure`: the first reconstructs the durable draft, analysis history and linked request lifecycle without chat history; the second appends a new whole-Experiment analysis against the current contract, preserves earlier analyses and request rows, records resolved/remaining/new requirement keys, and permits `unblocked` only when no unsupported requirement or scientific ambiguity remains. The original aggregation workflow is live-tested with Grok in #313.

The two already-approved aggregation requests remained unchanged and unlinked through #310–#312. #313's reconciliation repair is the point at which the live aggregation closure may attach them to the durable blocked Experiment while preserving their `approved` state.

## Durable capability request

A request is a first-class Supabase domain row with stable identity and retained context. The deployed model preserves information such as:

- request identity/timestamps;
- authenticated requester identity/role;
- originating Experiment/revision when available;
- preserved draft artifacts/intent;
- capability domain/name/summary;
- requested lifecycle hook;
- status;
- Professor review note/identity/time where applicable;
- linked GitHub engineering issue/PR once trusted development begins;
- implemented capability/contract version when completed.

The request does not contain or grant repository credentials.

## Lifecycle

Current lifecycle vocabulary is:

```text
requested
   |\
   | \-> declined
   v
approved
   v
in_progress
   v
implemented
```

`approved` means approved by the Professor to enter developer design/queue. It **does not** authorize code implementation by itself.

The developer-side standing boundary is:

`approved request → developer design discussion → explicit owner implementation approval → trusted developer implementation/deploy/verification → implemented`

## Professor inbox — deployed

The production Lab includes the Professor-only request inbox/triage path implemented under #139 / #58.3.

Professor can review pending requests and transition only `requested → approved` or `requested → declined` through the user-facing triage flow, with durable reviewer/time/note data. Student users cannot read the Professor queue or triage requests.

This UI remains an Experiment/product administration surface. It does not embed GitHub credentials or turn the browser into a simulator-development client.

## Research-AI request action — deployed

Authenticated Student and Professor MCP sessions expose `request_capability` under `vlab.capability-request/3`.

The active authoring contract signals requestable unsupported-capability behavior for both roles. Before submission, the research AI performs a best-effort whole-Experiment analysis, groups low-level diagnostics into meaningful capability requests, and preserves explicit ambiguity instead of asking the developer layer to infer scientific meaning. Repeated initial submissions for the same blocked scientific task converge on the same durable blocked Experiment and cumulative initial closure history. A matching existing nonterminal request owned by the same requester is reconciled into that closure when it is unlinked or already belongs to the same blocked Experiment; its `requested`, `approved`, or `in_progress` lifecycle state is preserved rather than reset.

Current lifecycle-hook vocabulary exposed by the request path includes:

`setup | initialize | control | measure | finalize`

## Development handoff

Trusted developer work is separate from research-AI MCP.

When the owner asks to take an approved request, developer-side ChatGPT should:

1. read the approved Supabase request and its preserved context;
2. perform the software-generalization/refactor gate;
3. discuss the architecture/design with the owner where required;
4. obtain explicit owner implementation approval;
5. create/link the GitHub engineering issue and mark the request `in_progress` only when implementation actually begins;
6. implement/test/deploy through the normal repository workflow;
7. mark the request `implemented` only after the active deployed capability contract advertises it;
8. leave the originating Experiment/draft ready for research-AI revalidation.

No manual copying of request details should be required when developer tooling can read the durable row.

## What counts as an Experiment capability

Potential capability domains include, for example:

- world/environment/setup construction;
- observations/sensors;
- actions/actuators;
- simulator-owned stochastic/intrinsic operations;
- per-agent initialization/state representation;
- future registered measurement/lifecycle extension points.

The research AI can describe the missing requirement. It cannot implement the simulator capability.

## Scientific guardrail

A missing capability is not permission to replace the requested science with a nearby model or convenient approximation. The Professor/research AI preserves scientific intent; the developer designs the generic software capability; the owner explicitly approves implementation.

Likewise, when a definition has already been owner-authorized and is supported, do not create a duplicate capability request or ask the owner to repeat it.

## Current approved requests

Two Professor-approved requests remain **not implementation-authorized**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — generic simulator-owned controller stochasticity/RNG distributions;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — generic heterogeneous agent initialization/state.

Their durable design checkpoint is `docs/CAPABILITY_APPROVALS_2026-09-15.md`.

Do not implement either request merely because its registry status is `approved`.

## Paper-to-Experiment loop

Current intended loop:

1. A Student or Professor works on a paper/hypothesis/Experiment with a research AI.
2. AI reads the current authoring/capability contract through MCP.
3. Supported Experiment artifacts/Metrics/Results bindings are authored normally.
4. If a required simulator capability is absent, validation exposes that gap.
5. The authenticated research AI preserves one durable blocked Experiment/closure analysis and submits grouped capability request(s).
6. Request appears in the Professor inbox.
7. Professor approves/declines.
8. Approved request waits for developer design + explicit owner implementation authorization.
9. Trusted developer implements/deploys if authorized.
10. Deployed versioned contract advertises the capability; request is marked implemented.
11. Professor-connected research AI resumes the same durable blocked Experiment and revalidates the whole Experiment against the current deployed contract; existing request lifecycle state is retained, newly discovered clear gaps may create new requests, and the Experiment becomes unblocked only when no gaps or unresolved ambiguity remain.

This lets real papers expose simulator gaps without giving research AI development privileges, blocking Student requests, or encouraging paper-specific hacks.
