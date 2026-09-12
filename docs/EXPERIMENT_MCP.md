# Virtual Lab Experiment MCP

Status: #43 transport/backend is implemented; #44 is validating the real student workflow before production Virtual Lab integration.

## Purpose

`experiment-mcp` is the restricted AI-facing adapter over the canonical experiment registry from #42. It exposes experiment-domain operations only. It is not a general Supabase MCP server and it is not a simulator-development interface.

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Supabase project: `virtual-lab` (`izdmmudfrmqhvlgepwes`).

## Security model

The Edge Function uses the project's publishable key plus the caller's Supabase Auth access token. It does not use a service-role or secret key.

The bearer token is validated with Supabase Auth and forwarded to a user-scoped Supabase client, so PostgreSQL RLS remains authoritative for every collection and experiment operation. The authenticated user ID is derived from the validated token; callers cannot supply an arbitrary owner ID.

OAuth `client_id`, when present, is recorded only as edit provenance and is not trusted as user identity.

## MCP transport and OAuth

The function uses Streamable HTTP through the official Model Context Protocol TypeScript SDK.

It exposes:

- `/health` for transport health only;
- `/.well-known/oauth-protected-resource` for protected-resource metadata;
- the function root for MCP Streamable HTTP requests.

Unauthenticated MCP requests return HTTP 401 with `WWW-Authenticate` pointing to the protected-resource metadata document. Supabase Auth is the OAuth 2.1 authorization server.

The deployed mock-sim at `https://eliseofe.github.io/virtual-lab-mock-sim/` provides the normal browser login/consent surface. Supabase OAuth 2.1 and Dynamic Client Registration are enabled.

A real Claude Pro client has successfully completed OAuth, authenticated as a normal registry user, performed an authenticated read, and performed an authenticated write.

### Connector refresh interoperability

During #44, Grok exposed a recurring connector state where its connector-auth action reported connected but the following MCP initialize failed as unauthenticated. The server-side challenge handling was therefore hardened without changing the endpoint or experiment API:

- missing bearer credentials and invalid/expired bearer credentials are now distinguished;
- invalid/expired tokens receive a standard `error="invalid_token"` `WWW-Authenticate` challenge so clients can trigger token refresh/re-authorization correctly;
- auth and metadata JSON responses use `Cache-Control: no-store` so stale challenges are not cached;
- the Bearer scheme parser is case-insensitive;
- `/health` exposes `auth_challenge_version: 2` for deployment verification.

This is an interoperability hardening only. Authentication and RLS enforcement remain unchanged.

## Compact student-facing tool surface

Real-client testing during #44 showed that normal Claude asks for first-use authorization per tool. The initial 13-operation interface was therefore consolidated into five student-oriented tools without removing domain capability.

### `read_workspace`

The single read/discovery entry point.

- with no `experiment_id`: returns the authenticated identity, owned collections, and visible experiment summaries;
- with `experiment_id`: returns the full visible experiment including configuration, initializer, controller source, and current revision;
- can select active, archived, or all experiments;
- can include visible non-owned experiments when requested;
- never writes.

AI clients should normally start here and re-read before revision-sensitive writes.

### `manage_collection`

One collection-management tool with `action=create|rename|delete`.

- create requires `name`;
- rename requires `collection_id` and `name`;
- delete requires `collection_id`;
- deleting a collection does not delete experiments; they become unfiled.

### `create_experiment`

Creates a brand-new owned experiment from zero using the three exact student-editable source strings: configuration, initializer, and controller source.

### `edit_experiment`

Handles all ordinary revision-protected changes to an existing owned experiment:

- title/description;
- configuration source;
- initializer source;
- controller source;
- moving to another collection or unfiling;
- archive;
- restore.

The caller must supply the current `base_revision`. A stale revision is rejected instead of silently overwriting newer state.

### `delete_experiment`

Permanently deletes an eligible owned working experiment at the supplied current revision. It remains a separate tool because permanent deletion deserves its own explicit safety boundary. Preserved submission/curation snapshots are independent and survive where applicable.

## Tool safety annotations

The MCP descriptors explicitly mark:

- `read_workspace` as read-only;
- `create_experiment` and `edit_experiment` as non-destructive writes;
- `manage_collection` and `delete_experiment` as potentially destructive.

These annotations are advisory to clients; client-side approval policy remains controlled by the AI client.

## Explicit non-capabilities

There is no MCP tool for:

- running or controlling the simulator;
- observing simulator state, metrics, screenshots, plots, or results;
- reading or changing simulator implementation;
- accessing GitHub;
- executing shell commands;
- accessing arbitrary filesystem paths;
- changing deployments;
- executing arbitrary SQL;
- retrieving Supabase project/admin secrets;
- bypassing registry RLS.

These capabilities are absent from the interface rather than forbidden only by prompt text.

## #44 acceptance boundary

The production Virtual Lab remains untouched until #44 passes owner acceptance.

The required proof is:

1. a real restricted AI client authenticates through OAuth;
2. AI writes are visible in mock-sim;
3. mock-sim writes are readable by the AI;
4. create-from-zero, collection organization, archive/restore and eligible permanent delete work;
5. stale writes are rejected;
6. two genuinely distinct authenticated users remain isolated;
7. the connector exposes only the five experiment tools above and no simulator-development capability;
8. the deployed baseline remains within the zero-cost architecture.

Only after that proof is owner-accepted may production integration proceed.

## Provider independence

No provider-specific operation exists in the server. Any compatible MCP client implementing Streamable HTTP and OAuth can use the same endpoint. Claude and Grok are being used for owner acceptance because they provide two genuinely distinct real AI-client paths.
