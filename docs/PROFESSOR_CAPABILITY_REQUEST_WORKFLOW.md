# Professor capability-request workflow

Status: **deployed baseline and standing development boundary, updated 16 September 2026**.

This document records the paper-to-Experiment extension loop when a research AI discovers that the current Virtual Lab cannot express a required simulator capability.

## Structural boundary

The authenticated Experiment MCP is an Experiment-domain interface. Research AI clients can create/read/edit supported Experiment content and, for Professor users, preserve/request missing capability. They have no GitHub, repository, shell, deployment, simulator-source, arbitrary SQL, arbitrary filesystem or Supabase-admin capability.

That boundary is structural. Missing simulator functionality is not “allowed through prompt”; it is absent until implemented by the trusted developer workflow.

## Roles

Current registry roles include:

- `student`
- `professor`

Professor is a strict superset of Student for ordinary Experiment-domain behavior plus explicit Professor surfaces such as the capability-request workflow. Professor role never implies simulator-development authority.

## Unsupported Experiment capabilities

Validation answers whether requested Experiment semantics fit the active versioned Virtual Lab capability contract. It must not decide whether a missing scientific feature is desirable or fabricate a substitute.

Current policy:

```text
capability exists
    -> author/validate normally

capability missing + professor
    -> preserve intent/draft and create durable capability request

capability missing + student
    -> report unsupported; no request action in the current first version
```

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

Professor-authenticated MCP exposes `request_capability` under `vlab.capability-request/1`.

The active authoring contract can signal requestable unsupported-capability behavior for Professor users. The AI preserves the original Experiment/draft intent rather than rewriting the science to fit current simulator limitations.

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

1. Professor discusses a paper/hypothesis with a research AI.
2. AI reads the current authoring/capability contract through MCP.
3. Supported Experiment artifacts/Metrics/Results bindings are authored normally.
4. If a required simulator capability is absent, validation exposes that gap.
5. Professor-authenticated AI preserves the intent/draft and creates a capability request.
6. Request appears in the Professor inbox.
7. Professor approves/declines.
8. Approved request waits for developer design + explicit owner implementation authorization.
9. Trusted developer implements/deploys if authorized.
10. Deployed versioned contract advertises the capability; request is marked implemented.
11. Research AI revalidates/completes the originating Experiment.

This lets real papers expose simulator gaps without giving research AI development privileges or encouraging paper-specific hacks.
