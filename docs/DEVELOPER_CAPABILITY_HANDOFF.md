# Developer capability-request handoff

Status: implementation contract for #141 / #58.4.

This is the trusted bridge between a Professor-approved capability request and normal Virtual Lab GitHub engineering. It is intentionally outside the Experiment MCP and Professor browser.

## Boundary

The research side ends at `approved`.

- Professor AI may create a durable request.
- Professor may approve or decline it in the Lab.
- Neither research AI nor the Professor browser may create GitHub work, write developer fields, or move a request to `in_progress`.
- Developer-side ChatGPT uses its trusted Supabase and GitHub connections to perform the handoff.

The developer claim operation is `private.claim_capability_request_for_development(...)`. It is `SECURITY INVOKER`, has no execute grant for `public`, `anon`, `authenticated`, or `service_role`, and is intended for the privileged developer database connection only.

## Meaning of the lifecycle

```text
requested -> approved -> in_progress -> implemented
             \-> declined
```

For this document:

- `approved` = Professor approved the need for development, but no engineering issue has been claimed yet.
- `in_progress` = one GitHub engineering issue is durably linked and the request has entered the developer workflow.
- `implemented` is NOT part of this checkpoint. It means a later checkpoint has verified that the capability is deployed and advertised by the active capability contract.

## Context-free developer command

A future developer chat should be able to receive:

> implement the next approved capability request

and recover everything needed from the repository and Supabase without asking the owner to copy request details.

### Procedure

1. Read `AGENTS.md`, `PROJECT_CONTROL.md`, `PROJECT_STATE.md`, this document, and epic #58.
2. Query `public.capability_requests` through the trusted developer Supabase connection for `status = 'approved'`, ordered by `reviewed_at ASC NULLS LAST, created_at ASC`; take one request unless the owner names a request ID.
3. Before creating anything, search `eliseofe/virtual-lab` GitHub issues for the exact capability request UUID. If an existing implementation issue already identifies that request, reuse it rather than creating a duplicate.
4. If no issue exists, create one GitHub engineering issue. The issue must contain the stable capability request UUID and only the technical summary needed to identify the work.
5. Call `private.claim_capability_request_for_development(request_id, issue_number, issue_url, developer_notes)` through the trusted developer database connection.
6. Verify the returned row is `in_progress`, has the expected GitHub issue number/URL, and has `development_started_at` set.
7. Continue implementation only as a new substantial engineering checkpoint under `docs/EXECUTION_GRANULARITY.md`.

The database claim is retry-safe only for the exact already-linked issue. Retrying the same request+issue returns the existing `in_progress` row. A different issue or an invalid lifecycle state is rejected.

## Public GitHub issue content

`eliseofe/virtual-lab` is public. A capability request may preserve unpublished research context or draft source. Therefore the GitHub issue is a pointer/engineering summary, not a mirror of the Supabase request.

By default include:

- `Capability request ID: <uuid>` as an exact searchable marker;
- capability domain and concise capability name;
- requested artifact type and lifecycle hook when present;
- originating Experiment ID/revision when useful and non-sensitive;
- a short developer-written technical scope derived from the capability gap;
- explicit acceptance criterion that the capability must eventually be advertised by the active versioned capability contract.

Do NOT automatically copy into the public issue:

- full `draft_artifacts` content;
- full draft description;
- full free-form request context;
- requester identity;
- Professor notes;
- unpublished paper text or other potentially private research material.

The developer-side ChatGPT can read those fields privately from Supabase while implementing.

## GitHub issue template

```text
CAPABILITY — <concise capability name>

Capability request ID: <uuid>
Parent lifecycle: #58

Domain: <capability_domain>
Artifact type: <requested_artifact_type or n/a>
Lifecycle hook: <requested_lifecycle_hook or n/a>
Origin: <experiment id/revision or n/a>

Engineering scope
<concise technical statement of the missing simulator capability; do not invent scientific semantics>

Completion gate
- implementation and tests complete;
- deployed capability is advertised by the active authoring/runtime capability contract;
- request is NOT marked implemented until that deployed-contract verification succeeds.
```

## Duplicate prevention

Two layers prevent duplicate handoff:

1. developer procedure searches GitHub for the exact request UUID before issue creation;
2. Supabase enforces unique `github_issue_number` and `github_issue_url`, while the claim function only accepts `approved` or an idempotent retry of the exact existing `in_progress` linkage.

If a GitHub issue is created but the database link step is interrupted, search by request UUID first and reuse that issue on retry.

## What this checkpoint does not do

It does not implement the requested capability, create a PR for that capability, mark the request implemented, verify deployed capability metadata, or revalidate the originating draft. Those are later engineering/completion steps.
