# Developer capability-request handoff

Status: **trusted development boundary, updated 16 September 2026**.

This is the bridge between a Professor-approved capability request and normal Virtual Lab GitHub engineering. It is intentionally outside the Experiment MCP and Professor browser.

## Critical approval boundary

The research side can move a request to `approved`, but **Professor approval is design/queue approval only. It is not implementation authorization.**

Standing flow:

```text
research AI request
  -> Professor review/approval
  -> developer-side architecture/generalization review
  -> design discussion with owner
  -> explicit owner implementation approval
  -> trusted GitHub/developer handoff
  -> implementation/test/deploy
  -> implemented
```

Do not create implementation work, claim the request `in_progress`, or begin coding solely because registry status is `approved`.

## Roles and security boundary

- Student or Professor research AI may create a durable request from a preserved blocked-Experiment analysis.
- Professor alone may approve/decline it in the Lab.
- Neither research AI nor Professor browser may create GitHub engineering work, write developer fields, or move the request to `in_progress`.
- Developer-side ChatGPT can read the private request through its trusted Supabase connection and discuss software design with the owner.
- Only after explicit owner implementation approval may developer-side ChatGPT create/link the GitHub engineering issue and claim the request `in_progress`.

The developer database claim operation remains a trusted developer-side function; it is not exposed through ordinary authenticated Experiment-domain clients.

## Lifecycle meaning

```text
requested -> approved -> in_progress -> implemented
             \-> declined
```

- `requested` — authenticated Student/Professor research AI has recorded a missing capability; this is not approval.
- `approved` — Professor agrees the request should enter developer design/queue. Implementation is **not yet authorized**.
- `in_progress` — owner has explicitly authorized implementation, a trusted developer handoff has linked the GitHub engineering work, and coding/testing may proceed.
- `implemented` — implementation is deployed/verified and the active versioned capability contract advertises it.

If design discussion shows the request should be generalized/refactored/reformulated, keep it `approved` while the design is resolved; do not use `in_progress` as a substitute for owner approval.

## Context-free developer command

A future developer chat may receive:

> inspect the next approved capability request

or

> implement capability request <uuid>

These commands have different meanings.

### Inspect/design procedure

1. Read `AGENTS.md`, `CURRENT_STATUS.md`, `DEVELOPMENT_WORKFLOW.md`, `docs/CAPABILITY_GENERALIZATION_GATE.md`, this document and the relevant request record.
2. Query the trusted Supabase connection for the named/next `approved` request.
3. Recover the preserved private context/draft without copying sensitive material into public GitHub.
4. Evaluate only the **software architecture/generalization** needed to support the requested science. Do not invent/derive the science itself.
5. Present the design/refactor proposal to the owner when a design decision or generalization gate is material.
6. Wait for **explicit owner implementation approval**.

No GitHub implementation issue and no `in_progress` transition is required merely to inspect/design an approved request. Moving through `approved -> in_progress` is the handoff checkpoint; reaching `implemented` is NOT part of this checkpoint and occurs only after the later implementation/deploy lifecycle succeeds.

### Implementation handoff procedure — only after explicit owner approval

1. Confirm the exact request ID and the owner's explicit approval of the implementation/design.
2. Search `eliseofe/virtual-lab` GitHub issues for the exact capability request UUID to avoid duplicates.
3. Reuse an existing correct implementation issue if present; otherwise create one concise engineering issue containing the stable request UUID and non-sensitive technical scope.
4. Call the trusted developer claim operation to link that issue and transition `approved -> in_progress`.
5. Verify the returned request row has the expected GitHub issue identity and development-start metadata.
6. Implement only the authorized capability scope as a substantial engineering ticket under `DEVELOPMENT_WORKFLOW.md`.
7. Test/deploy/verify the actual capability and confirm that the active authoring/runtime contract advertises it.
8. Only then mark the request `implemented` and record the implemented capability/contract version.

## Public GitHub issue content

`eliseofe/virtual-lab` is public. Capability requests can preserve unpublished research context/source, so the GitHub issue is a pointer/engineering summary rather than a mirror of the Supabase row.

Include only what is necessary, such as:

- `Capability request ID: <uuid>` exact searchable marker;
- capability domain and concise generic capability name;
- requested artifact type/lifecycle hook when relevant;
- originating Experiment ID/revision only when useful and non-sensitive;
- concise developer-written software scope;
- completion gate requiring deployed contract advertisement.

Do NOT automatically copy or publish:

- full `draft_artifacts` content;
- full draft description/context;
- requester identity;
- Professor notes;
- unpublished paper text/private research material.

## Duplicate prevention

Before creating a GitHub issue, search for the exact request UUID. If an earlier attempt already created the correct issue, reuse it.

The database linkage/claim should be treated as authoritative for whether a request is already `in_progress`. A retry must not create a second implementation issue.

## Scientific/generalization guardrail

Capability implementation must add the **generic simulator/software capability** authorized by the owner, not a paper-specific hard-coded shortcut unless that is explicitly the approved architecture.

Developer-side ChatGPT may reason about interface design, compiler/runtime integration, deterministic RNG ownership, data structures and execution plumbing. It must not independently invent the missing scientific semantics that motivated the request.

## Current approved-but-not-implementation-authorized requests

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — generic simulator-owned controller stochasticity/RNG distributions.
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — generic heterogeneous agent initialization/state.

Their Professor approval does not authorize coding. Their durable notes live in `docs/CAPABILITY_APPROVALS_2026-09-15.md`.
